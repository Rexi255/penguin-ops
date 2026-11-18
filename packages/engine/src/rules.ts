// Declarative check rules (ADR 0011, ADR 0067): whether a ticket is solved, whether a tip fires
// or an extra goal is reached. A rule looks at the world, the player's session and the output of
// the last input, never at the typed command line, the player's user name or translated text.
// Levels write rules in YAML (`{ cwd_is: "~/reports" }`); the content package turns them into
// these values.

import type { FsNode } from "./fs-node";
import { toGid, toUid } from "./ids";
import type { ShellEvent } from "./interpreter";
import { lookup } from "./lookup";
import type { Session } from "./session";
import { findHost, findUserByUid, type Host, type World } from "./world";

/** A check rule. Paths are absolute or start with `~` (the player's home directory). */
export type Rule =
  /** The current working directory is the directory at the path. */
  | { readonly kind: "cwd_is"; readonly path: string }
  /** A file or directory exists at the path. */
  | { readonly kind: "exists"; readonly path: string }
  /** A regular file exists at the path. */
  | { readonly kind: "file_exists"; readonly path: string }
  /** A directory exists at the path. */
  | { readonly kind: "dir_exists"; readonly path: string }
  /** A regular file exists at the path and contains the text. */
  | { readonly kind: "file_contains"; readonly path: string; readonly text: string }
  /** Regular files exist at both paths and have the same content. */
  | { readonly kind: "same_content"; readonly paths: readonly [string, string] }
  /** The output of the last input contains the text. */
  | { readonly kind: "output_contains"; readonly text: string }
  /** The output of the last input matches the regular expression (see `checkRule`). */
  | { readonly kind: "output_matches"; readonly pattern: string }
  /** All rules are true. */
  | { readonly kind: "all"; readonly rules: readonly Rule[] }
  /** At least one rule is true. */
  | { readonly kind: "any"; readonly rules: readonly Rule[] }
  /** The rule is false. */
  | { readonly kind: "not"; readonly rule: Rule };

/** What rules are checked against. */
export interface RuleContext {
  readonly world: World;
  /**
   * The player's session: its host is where paths are looked up, its user's home is `~`, and
   * its working directory is what `cwd_is` checks.
   */
  readonly session: Session;
  /** The output of the last input, as `terminalOutput` collects it; "" before the first one. */
  readonly output: string;
}

/** Thrown by `checkRule` and `evaluateRule` for a rule that breaks the rules of the format. */
export class InvalidRuleError extends Error {
  override name = "InvalidRuleError";
}

/** The flags of `output_matches`: Unicode, and `^` and `$` also at line breaks. */
const OUTPUT_PATTERN_FLAGS = "mu";

/** Root's credentials: rules see the whole file system, whatever the player may read. */
const ROOT = { uid: toUid(0), gid: toGid(0), groups: [toGid(0)] };

/**
 * Checks a rule and all rules inside it, and throws an InvalidRuleError for the first problem:
 *
 * - a path that is empty, relative, or starts with `~` but not with `~/` (only the player's own
 *   home may be written with `~`, so that rules never name the player);
 * - an `output_matches` pattern that is not a valid JavaScript regular expression with the `u`
 *   flag;
 * - an `all` or `any` without rules.
 */
export function checkRule(rule: Rule): void {
  switch (rule.kind) {
    case "cwd_is":
    case "exists":
    case "file_exists":
    case "dir_exists":
    case "file_contains":
      checkPath(rule.path);
      return;
    case "same_content":
      rule.paths.forEach(checkPath);
      return;
    case "output_contains":
      return;
    case "output_matches":
      outputPattern(rule.pattern);
      return;
    case "all":
    case "any":
      if (rule.rules.length === 0) {
        throw new InvalidRuleError(`"${rule.kind}" needs at least one rule`);
      }
      rule.rules.forEach(checkRule);
      return;
    case "not":
      checkRule(rule.rule);
  }
}

/**
 * Returns whether `rule` holds in `context`:
 *
 * - Paths start at the root of the session's host; `~` is the home directory of the session's
 *   user as the user list has it (not `HOME`, which the player can change). `.` and `..` are
 *   resolved, repeated and trailing slashes do not matter. Permissions do not count: a rule
 *   sees files that the player cannot read.
 * - `cwd_is` compares the session's working directory with the path, both without `.`, `..`
 *   and repeated slashes; the directory need not exist any more.
 * - `file_contains` and `same_content` need regular files; a directory never matches.
 * - `output_contains` and `output_matches` look at the output of the last input;
 *   `output_matches` finds the pattern anywhere, with `^` and `$` also at line breaks.
 * - `all` holds if every rule holds, `any` if one does, `not` if its rule does not.
 *
 * Throws an InvalidRuleError if the rule is invalid (see `checkRule`) and an Error if the
 * session's host is not part of the world or the session's user has no entry in its user list.
 */
export function evaluateRule(rule: Rule, context: RuleContext): boolean {
  checkRule(rule);
  return holds(rule, context);
}

/**
 * The output of an input as rules see it: the text that commands wrote to the terminal, standard
 * output and standard error in the order written. Screen clears do not remove earlier output,
 * and game notices are not output.
 */
export function terminalOutput(events: readonly ShellEvent[]): string {
  return events.map((event) => (event.kind === "output" ? event.text : "")).join("");
}

function holds(rule: Rule, context: RuleContext): boolean {
  switch (rule.kind) {
    case "cwd_is":
      return normalize(resolvePath(context, rule.path)) === normalize(context.session.cwd);
    case "exists":
      return nodeAt(context, rule.path) !== undefined;
    case "file_exists":
      return nodeAt(context, rule.path)?.kind === "file";
    case "dir_exists":
      return nodeAt(context, rule.path)?.kind === "directory";
    case "file_contains":
      return contentOf(context, rule.path)?.includes(rule.text) ?? false;
    case "same_content": {
      const [first, second] = rule.paths.map((path) => contentOf(context, path));
      return first !== undefined && first === second;
    }
    case "output_contains":
      return context.output.includes(rule.text);
    case "output_matches":
      return outputPattern(rule.pattern).test(context.output);
    case "all":
      return rule.rules.every((inner) => holds(inner, context));
    case "any":
      return rule.rules.some((inner) => holds(inner, context));
    case "not":
      return !holds(rule.rule, context);
  }
}

function checkPath(path: string): void {
  if (!path.startsWith("/") && path !== "~" && !path.startsWith("~/")) {
    throw new InvalidRuleError(
      `the path "${path}" must be absolute or start with "~/" (the player's home)`,
    );
  }
}

function outputPattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern, OUTPUT_PATTERN_FLAGS);
  } catch (error) {
    throw new InvalidRuleError(
      `the output_matches pattern "${pattern}" is not a valid JavaScript regular expression`,
      { cause: error },
    );
  }
}

/** The absolute path of a rule path: `~` replaced by the home of the session's user. */
function resolvePath(context: RuleContext, path: string): string {
  if (!path.startsWith("~")) {
    return path;
  }
  const { session } = context;
  const user = findUserByUid(hostOf(context), session.credentials.uid);
  if (user === undefined) {
    throw new Error(`the session's user ${String(session.credentials.uid)} has no home`);
  }
  return user.home + path.slice(1);
}

/** The node at a rule path, or `undefined` if there is none. */
function nodeAt(context: RuleContext, path: string): FsNode | undefined {
  const found = lookup(hostOf(context).root, ROOT, "/", resolvePath(context, path));
  return found.ok ? found.node : undefined;
}

/** The content of the regular file at a rule path, or `undefined` if there is none. */
function contentOf(context: RuleContext, path: string): string | undefined {
  const node = nodeAt(context, path);
  return node?.kind === "file" ? node.content : undefined;
}

function hostOf(context: RuleContext): Host {
  const host = findHost(context.world, context.session.host);
  if (host === undefined) {
    throw new Error(`the session's host "${context.session.host}" is not part of the world`);
  }
  return host;
}

/** An absolute path without `.`, `..`, repeated slashes and a trailing slash. */
function normalize(path: string): string {
  const components: string[] = [];
  for (const component of path.split("/")) {
    if (component === "..") {
      components.pop();
    } else if (component !== "" && component !== ".") {
      components.push(component);
    }
  }
  return `/${components.join("/")}`;
}
