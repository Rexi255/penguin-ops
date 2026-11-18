// The YAML form of the check rules (ADR 0011, ADR 0067, ADR 0068). A rule is an object with
// exactly one key, the rule type, for example `{ cwd_is: "~/reports" }` or
// `{ file_contains: ["~/notes.txt", "printer"] }`. Parsing turns it into the engine's `Rule`.
//
// The content package may only import types from the engine (ADR 0006), so the checks of the
// engine's `checkRule` are repeated here: paths are absolute or start with `~/`, `all` and `any`
// need at least one rule, and `output_matches` takes a valid JavaScript regular expression with
// the flags `m` and `u`. A gameplay test makes sure that both agree.

import type { Rule } from "@penguin-ops/engine";
import { z } from "zod";

/** The YAML form of a rule, as a level file writes it. */
export interface RuleInput {
  readonly cwd_is?: string | undefined;
  readonly exists?: string | undefined;
  readonly file_exists?: string | undefined;
  readonly dir_exists?: string | undefined;
  readonly file_contains?: readonly [string, string] | undefined;
  readonly same_content?: readonly [string, string] | undefined;
  readonly output_contains?: string | undefined;
  readonly output_matches?: string | undefined;
  readonly all?: readonly RuleInput[] | undefined;
  readonly any?: readonly RuleInput[] | undefined;
  readonly not?: RuleInput | undefined;
}

/** The flags that the engine gives `output_matches` patterns (ADR 0067). */
const OUTPUT_PATTERN_FLAGS = "mu";

/**
 * A path in a rule: absolute, `~` (the player's home) or starting with `~/`. Like the engine,
 * it may contain `.`, `..` and repeated slashes.
 */
export const rulePathSchema = z
  .string()
  .refine((path) => path.startsWith("/") || path === "~" || path.startsWith("~/"), {
    error: "a path must be absolute or start with ~/ (the player's home)",
  })
  .meta({
    description: 'An absolute path, "~" (the player\'s home) or a path that starts with "~/".',
    pattern: "^(?:/|~$|~/)",
  });

const outputPatternSchema = z
  .string()
  .refine(isValidOutputPattern, {
    error: "not a valid JavaScript regular expression (with the flags m and u)",
  })
  .meta({
    description:
      "A JavaScript regular expression, found anywhere in the output; ^ and $ also match at line breaks.",
  });

/** The rule types and their descriptions for the JSON Schema. */
const RULE_TYPES = {
  cwd_is: "The current directory is the directory at the path.",
  exists: "A file or directory exists at the path.",
  file_exists: "A regular file exists at the path.",
  dir_exists: "A directory exists at the path.",
  file_contains: "[path, text]: a regular file exists at the path and contains the text.",
  same_content: "[path, path]: regular files exist at both paths and have the same content.",
  output_contains: "The output of the last input contains the text.",
  output_matches: "The output of the last input matches the regular expression.",
  all: "All rules are true.",
  any: "At least one rule is true.",
  not: "The rule is false.",
} as const satisfies Record<keyof RuleInput, string>;

type RuleType = keyof typeof RULE_TYPES;

const RULE_TYPE_LIST = Object.keys(RULE_TYPES).join(", ");

function ruleList(type: "all" | "any") {
  return z
    .array(ruleObjectSchema)
    .min(1, { error: `"${type}" needs at least one rule` })
    .meta({ description: RULE_TYPES[type] });
}

/**
 * A rule object as zod checks it: the YAML form, also inside `all`, `any` and `not`. The
 * recursion stays inside this one object schema, so that the JSON Schema defines a rule once;
 * `ruleSchema` turns the whole tree into engine rules at the end.
 */
const ruleObjectSchema: z.ZodType<RuleInput, RuleInput> = z
  // A loose object: the check below reports unknown keys itself, with the list of rule types.
  .looseObject({
    cwd_is: rulePathSchema.meta({ description: RULE_TYPES.cwd_is }).optional(),
    exists: rulePathSchema.meta({ description: RULE_TYPES.exists }).optional(),
    file_exists: rulePathSchema.meta({ description: RULE_TYPES.file_exists }).optional(),
    dir_exists: rulePathSchema.meta({ description: RULE_TYPES.dir_exists }).optional(),
    file_contains: z
      .tuple([rulePathSchema, z.string()])
      .meta({ description: RULE_TYPES.file_contains })
      .optional(),
    same_content: z
      .tuple([rulePathSchema, rulePathSchema])
      .meta({ description: RULE_TYPES.same_content })
      .optional(),
    output_contains: z.string().meta({ description: RULE_TYPES.output_contains }).optional(),
    output_matches: outputPatternSchema.meta({ description: RULE_TYPES.output_matches }).optional(),
    get all() {
      return ruleList("all").optional();
    },
    get any() {
      return ruleList("any").optional();
    },
    // No description here: a described copy of the recursive rule schema would make the JSON
    // Schema define the rule twice.
    get not() {
      return ruleObjectSchema.optional();
    },
  })
  .superRefine((input, context) => {
    const unknown = Object.keys(input).filter((key) => !Object.hasOwn(RULE_TYPES, key));
    for (const key of unknown) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `unknown rule type "${key}"; the rule types are ${RULE_TYPE_LIST}`,
      });
    }
    const types = presentTypes(input);
    if (unknown.length === 0 && types.length !== 1) {
      context.addIssue({
        code: "custom",
        message:
          types.length === 0
            ? `a rule needs one rule type: ${RULE_TYPE_LIST}`
            : `a rule has exactly one rule type, not ${types.join(" and ")}; combine rules with all, any or not`,
      });
    }
  })
  .meta({
    id: "rule",
    description: "A check rule: an object with exactly one rule type.",
    // zod cannot express "exactly one known key" itself; the check above does it while parsing.
    additionalProperties: false,
    minProperties: 1,
    maxProperties: 1,
  });

/**
 * A check rule in its YAML form, parsed into the engine's `Rule`. The object must have exactly
 * one key, the rule type; unknown keys are errors.
 */
export const ruleSchema: z.ZodType<Rule, RuleInput> = ruleObjectSchema.transform(toRule);

/** The rule types that have a value in the object. */
function presentTypes(input: RuleInput): RuleType[] {
  return (Object.keys(RULE_TYPES) as RuleType[]).filter((type) => input[type] !== undefined);
}

/** Turns a rule object that passed the checks, and the rules inside it, into engine rules. */
function toRule(input: RuleInput): Rule {
  if (input.cwd_is !== undefined) return { kind: "cwd_is", path: input.cwd_is };
  if (input.exists !== undefined) return { kind: "exists", path: input.exists };
  if (input.file_exists !== undefined) return { kind: "file_exists", path: input.file_exists };
  if (input.dir_exists !== undefined) return { kind: "dir_exists", path: input.dir_exists };
  if (input.file_contains !== undefined) {
    const [path, text] = input.file_contains;
    return { kind: "file_contains", path, text };
  }
  if (input.same_content !== undefined) return { kind: "same_content", paths: input.same_content };
  if (input.output_contains !== undefined) {
    return { kind: "output_contains", text: input.output_contains };
  }
  if (input.output_matches !== undefined) {
    return { kind: "output_matches", pattern: input.output_matches };
  }
  if (input.all !== undefined) return { kind: "all", rules: input.all.map(toRule) };
  if (input.any !== undefined) return { kind: "any", rules: input.any.map(toRule) };
  if (input.not !== undefined) return { kind: "not", rule: toRule(input.not) };
  // The checks of ruleObjectSchema run first, so a rule object always has one rule type here.
  throw new Error("a rule object without a rule type passed the checks");
}

function isValidOutputPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, OUTPUT_PATTERN_FLAGS);
    return true;
  } catch {
    return false;
  }
}
