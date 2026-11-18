// Turns zod's issues into problems with file, line and column (ADR 0069). zod reports a path
// inside the parsed value; the YAML source finds the node at that path. Some issues are
// rewritten so that they read well in a file:
//
// - An unknown field becomes one problem per field, located at the field.
// - A missing required field says so, instead of "expected array, received undefined" or the
//   message of a wrong value, and is located at the map that lacks it.
// - An "invalid union" issue lists the issues of every option. Options that failed only
//   because the value has another type are dropped; if one option is left, its issues are
//   reported, otherwise the union's own message.

import type { z } from "zod";

import type { ContentProblem } from "./content-problem";
import { sourceProblem, type YamlSource } from "./yaml-source";

/** zod's message of a union without its own message. */
const DEFAULT_UNION_MESSAGE = "Invalid input";

/** The problems of the issues that a schema found in a parsed YAML file. */
export function schemaProblems(
  source: YamlSource,
  issues: readonly z.core.$ZodIssue[],
): ContentProblem[] {
  return issues.flatMap((issue) => issueProblems(source, issue, []));
}

function issueProblems(
  source: YamlSource,
  issue: z.core.$ZodIssue,
  prefix: readonly PropertyKey[],
): ContentProblem[] {
  const path = [...prefix, ...issue.path];
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => sourceProblem(source, [...path, key], `unknown field "${key}"`));
  }
  if (issue.code === "invalid_union") {
    const options = issue.errors.filter((option) => !isTypeMismatch(option));
    const [only] = options;
    if (options.length === 1 && only !== undefined) {
      return only.flatMap((optionIssue) => issueProblems(source, optionIssue, path));
    }
    return [sourceProblem(source, path, unionMessage(issue))];
  }
  const field = path.at(-1);
  const parent = valueAt(source.value, path.slice(0, -1));
  if (typeof field === "string" && isPlainObject(parent) && !Object.hasOwn(parent, field)) {
    return [sourceProblem(source, path, `the required field "${field}" is missing`)];
  }
  return [sourceProblem(source, path, issue.message)];
}

/** An option that failed only because the value as a whole has another type. */
function isTypeMismatch(option: readonly z.core.$ZodIssue[]): boolean {
  const [first] = option;
  return option.length === 1 && first?.code === "invalid_type" && first.path.length === 0;
}

/** The union's own message, or one that lists the expected types. */
function unionMessage(issue: z.core.$ZodIssueInvalidUnion): string {
  if (issue.message !== DEFAULT_UNION_MESSAGE) {
    return issue.message;
  }
  const expected = issue.errors.flatMap((option) => {
    const [first] = option;
    return isTypeMismatch(option) && first?.code === "invalid_type" ? [first.expected] : [];
  });
  return expected.length === 0
    ? DEFAULT_UNION_MESSAGE
    : `${DEFAULT_UNION_MESSAGE}: expected ${[...new Set(expected)].join(" or ")}`;
}

/** The value at `path`, or `undefined` if there is none. */
function valueAt(value: unknown, path: readonly PropertyKey[]): unknown {
  let current = value;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") {
      current = current[segment];
    } else if (isPlainObject(current) && typeof segment === "string") {
      current = Object.hasOwn(current, segment) ? current[segment] : undefined;
    } else {
      return undefined;
    }
  }
  return current;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
