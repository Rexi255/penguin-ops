// Level schema v1 (ADR 0010, ADR 0068): the format of `content/levels/<level-id>/level.yaml`,
// described in docs/LEVEL-AUTHORING.md. Parsing checks a level that the YAML parser has read
// and turns it into a `Level`: rules become the engine's rules, file modes become numbers and
// the start files a list. The JSON Schema for editors is generated from this schema
// (`level-json-schema.ts`).
//
// What the schema cannot see is checked later: the content loader checks that the folder name
// is the level ID, that the world and the start host exist, that owners and groups of start
// files exist on the host and that text keys exist in the catalogs; the content tests check
// that the level's world builds and that the reference solutions solve it (ROADMAP M2.4b).
// Whether the commands in `teaches` exist is checked with the handbook (ROADMAP M3).

import type { Rule } from "@penguin-ops/engine";
import { z } from "zod";

import { type FileAttributes, type FileEntry, proseFileEntriesSchema } from "./file-entries-schema";
import { rulePathSchema, ruleSchema } from "./rule-schema";

export { type FileSource, parseMode } from "./file-entries-schema";

/** The level format version that this schema reads. */
export const LEVEL_FORMAT_VERSION = 1;

/** The kinds of levels (ADR 0017). */
export const LEVEL_KINDS = ["main", "review", "side", "incident"] as const;

export type LevelKind = (typeof LEVEL_KINDS)[number];

/** XP for solving a level that does not say otherwise. */
export const DEFAULT_LEVEL_XP = 100;

/**
 * Keys that the text catalogs use for the level's own texts (ticket, hints, explanation), so
 * that level.yaml cannot use them for file contents, tips or steps.
 */
export const RESERVED_TEXT_KEYS = ["title", "ticket", "hints", "explanation"] as const;

/** Owner, group and permission bits of a start file or directory; unset means the default. */
export type StartAttributes = FileAttributes;

/** A file or directory that the level creates at the start. */
export type StartEntry = FileEntry;

/** How the level's session starts. */
export interface LevelStart {
  /** The host the session starts on; unset means the world's default host. */
  readonly host?: string;
  /** The start directory: absolute, `~` or starting with `~/`. */
  readonly cwd: string;
  /** Files and directories to create, in the order of the level file. */
  readonly files: readonly StartEntry[];
}

/** One step of a multi-step ticket. */
export interface LevelStep {
  /** Stable ID, unique in the level; save files store the last completed step. */
  readonly id: string;
  /** The rule that completes the step. */
  readonly goal: Rule;
  /** Text key of a message shown when the step is completed. */
  readonly say?: string;
}

/** A tip for a typical mistake, shown once when its rule becomes true. */
export interface LevelTip {
  readonly when: Rule;
  /** Text key of the tip. */
  readonly say: string;
}

/** An optional bonus goal. */
export interface ExtraGoal {
  /** Stable ID, unique in the level; its description is `extra_goals.<id>` in the catalogs. */
  readonly id: string;
  readonly when: Rule;
  readonly xp: number;
}

interface LevelFields {
  readonly format: typeof LEVEL_FORMAT_VERSION;
  /** Stable kebab-case ID, the name of the level's folder. */
  readonly id: string;
  readonly kind: LevelKind;
  /** Commands the level introduces (for `review` levels: the commands it practises). */
  readonly teaches: readonly string[];
  readonly xp: number;
  /** Base world from `content/worlds/`; unset means the standard office world. */
  readonly world?: string;
  readonly start: LevelStart;
  readonly tips: readonly LevelTip[];
  readonly extraGoals: readonly ExtraGoal[];
  /** Reference solutions: each a list of command lines. */
  readonly solutions: readonly (readonly string[])[];
}

/** A checked level: one goal, or steps for a multi-step ticket. */
export type Level = LevelFields &
  (
    | { readonly goal: Rule; readonly steps?: never }
    | { readonly steps: readonly LevelStep[]; readonly goal?: never }
  );

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
/** Text keys of the catalogs: kebab-case, starting with a letter. */
export const TEXT_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9._+-]*$/u;
/** Host names as the engine allows them (ADR 0009). */
const HOST_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
/** A string schema for a stable kebab-case ID; `what` names the ID in the message. */
export function idSchema(what: string) {
  return z.string().regex(ID_PATTERN, {
    error: `${what} must be kebab-case: lowercase letters and digits, separated by single hyphens`,
  });
}

const textKeySchema = z
  .string()
  .regex(TEXT_KEY_PATTERN, {
    error: "a text key must be kebab-case and start with a letter, for example tip-wrong-printer",
  })
  .refine((key) => !(RESERVED_TEXT_KEYS as readonly string[]).includes(key), {
    error: `a text key must not be one of the catalog's own keys: ${RESERVED_TEXT_KEYS.join(", ")}`,
  })
  .meta({ description: "A key of the level's text catalogs (de.yaml, en.yaml)." });

const startFilesSchema = proseFileEntriesSchema("start file", textKeySchema);

const startSchema = z
  .strictObject({
    host: z
      .string()
      .regex(HOST_NAME_PATTERN, { error: "not a valid host name" })
      .meta({ description: "The host the session starts on. Default: the world's default host." })
      .optional(),
    cwd: rulePathSchema
      .default("~")
      .meta({ description: 'The start directory. Default: "~", the player\'s home.' }),
    files: startFilesSchema
      .prefault({})
      .meta({ description: "Files and directories to create, by path." }),
  })
  .transform((start): LevelStart => ({
    ...(start.host === undefined ? {} : { host: start.host }),
    cwd: start.cwd,
    files: start.files,
  }));

const stepSchema = z
  .strictObject({
    id: idSchema("a step ID").meta({ description: "Stable ID of the step, unique in the level." }),
    goal: ruleSchema,
    say: textKeySchema
      .meta({ description: "Text key of a message shown when the step is completed." })
      .optional(),
  })
  .transform((step): LevelStep => ({
    id: step.id,
    goal: step.goal,
    ...(step.say === undefined ? {} : { say: step.say }),
  }));

const tipSchema = z.strictObject({
  when: ruleSchema,
  say: textKeySchema.meta({ description: "Text key of the tip." }),
});

const extraGoalSchema = z.strictObject({
  id: idSchema("an extra goal ID").meta({
    description: "Stable ID, unique in the level; the catalogs describe it as extra_goals.<id>.",
  }),
  when: ruleSchema,
  xp: z.int().positive().meta({ description: "XP for reaching the extra goal." }),
});

const commandLineSchema = z
  .string()
  .refine((line) => line.trim() !== "", { error: "a command line must not be empty" })
  .refine((line) => !/[\n\r]/u.test(line), {
    error: "a command line must not contain a line break; write one command line per entry",
  });

const levelObjectSchema = z
  .strictObject({
    format: z
      .literal(LEVEL_FORMAT_VERSION, {
        error: `the level format version must be ${String(LEVEL_FORMAT_VERSION)}`,
      })
      .meta({ description: "Level format version." }),
    id: idSchema("a level ID").meta({
      description: "Stable level ID; must match the folder name and never change.",
    }),
    kind: z.enum(LEVEL_KINDS).meta({ description: "The kind of level." }),
    teaches: z
      .array(z.string().regex(COMMAND_NAME_PATTERN, { error: "not a valid command name" }))
      .min(1, { error: "a level teaches or practises at least one command" })
      .superRefine((commands, context) => {
        reportDuplicates(commands, "the command", context);
      })
      .meta({ description: "Commands introduced (for review levels: commands practised)." }),
    xp: z
      .int()
      .positive()
      .default(DEFAULT_LEVEL_XP)
      .meta({ description: `XP for solving. Default: ${String(DEFAULT_LEVEL_XP)}.` }),
    world: idSchema("a world ID")
      .meta({ description: "Base world from content/worlds/. Default: the standard office world." })
      .optional(),
    start: startSchema.prefault({}),
    goal: ruleSchema.optional(),
    steps: z
      .array(stepSchema)
      .min(2, { error: "a multi-step ticket has at least two steps; use goal for one" })
      .superRefine((steps, context) => {
        reportDuplicates(
          steps.map((step) => step.id),
          "the step ID",
          context,
          (index) => [index, "id"],
        );
      })
      .meta({ description: "Steps of a multi-step ticket, instead of goal." })
      .optional(),
    tips: z.array(tipSchema).default([]).meta({ description: "Tips, each shown once." }),
    extra_goals: z
      .array(extraGoalSchema)
      .default([])
      .superRefine((goals, context) => {
        reportDuplicates(
          goals.map((goal) => goal.id),
          "the extra goal ID",
          context,
          (index) => [index, "id"],
        );
      })
      .meta({ description: "Optional bonus goals." }),
    solutions: z
      .array(z.array(commandLineSchema).min(1, { error: "a reference solution needs a command" }))
      .min(1, { error: "a level needs at least one reference solution" })
      .meta({ description: "Reference solutions, each a list of command lines." }),
  })
  .meta({ oneOf: [{ required: ["goal"] }, { required: ["steps"] }] });

/** Schema of a `level.yaml` file: checks the parsed YAML and turns it into a `Level`. */
export const levelSchema = levelObjectSchema
  .superRefine((level, context) => {
    if ((level.goal === undefined) === (level.steps === undefined)) {
      context.addIssue({
        code: "custom",
        message:
          level.goal === undefined
            ? "a level needs either goal or steps"
            : "a level has either goal or steps, not both",
      });
    }
  })
  .transform((level): Level => {
    const fields: LevelFields = {
      format: level.format,
      id: level.id,
      kind: level.kind,
      teaches: level.teaches,
      xp: level.xp,
      ...(level.world === undefined ? {} : { world: level.world }),
      start: level.start,
      tips: level.tips,
      extraGoals: level.extra_goals,
      solutions: level.solutions,
    };
    if (level.goal !== undefined) {
      return { ...fields, goal: level.goal };
    }
    // The superRefine check runs first, so a level without a goal has steps.
    return { ...fields, steps: level.steps ?? [] };
  })
  .meta({
    title: "PenguinOps level",
    description: "A level of PenguinOps: content/levels/<level-id>/level.yaml.",
  });

/** The form of a `level.yaml` file as the YAML parser reads it. */
export type LevelInput = z.input<typeof levelSchema>;

/** Adds an issue at every repeated value of the list. */
export function reportDuplicates(
  values: readonly string[],
  what: string,
  context: z.RefinementCtx,
  path: (index: number) => PropertyKey[] = (index) => [index],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        path: path(index),
        message: `${what} "${value}" is repeated`,
      });
    }
    seen.add(value);
  });
}
