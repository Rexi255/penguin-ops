// Word expansion of the shell (ADR 0007, ADR 0046): turns the words of the parser into the
// arguments of a command like bash. The steps run in bash's order: tilde expansion and
// parameter expansion, then field splitting of the unquoted expansion results, then pathname
// expansion of unquoted pattern characters, and quote removal last. Brace expansion (`{a,b}`)
// is not simulated; braces stay ordinary characters.

import { expandPathname, type PatternChar } from "./glob";
import type { WordPart } from "./lexer";
import type { Assignment, Word } from "./parser";
import { DEFAULT_IFS, type Session } from "./session";
import { findHost, findUser, findUserByUid, type Host, type World } from "./world";

/** Special parameters that need parts of bash the game does not simulate yet. */
export type UnsupportedParameter =
  /** `$$`: needs process IDs (chapter "Processes and resources"). */
  | "process-id"
  /** `$-`: needs the shell options of `set`. */
  | "shell-options";

/** Why a word could not be expanded. `start` is the offset of the word or assignment. */
export interface ExpansionError {
  readonly kind: "unsupported";
  readonly feature: UnsupportedParameter;
  readonly start: number;
}

/** The result of `expandWords`: the fields (the arguments), or the first error. */
export type WordsExpansion =
  | { readonly ok: true; readonly fields: readonly string[] }
  | { readonly ok: false; readonly error: ExpansionError };

/** The result of `expandAssignment`: the value, or the first error. */
export type AssignmentExpansion =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: ExpansionError };

/** What `$0` expands to: the name of a login shell. */
const SHELL_NAME = "-bash";

/** The characters that bash treats as IFS whitespace. */
const IFS_WHITESPACE = new Set([" ", "\t", "\n"]);

/**
 * A piece of a word after tilde and parameter expansion. `quoted` text is neither split nor used
 * as a pattern; `split` text came from an unquoted expansion and is split at `IFS` characters.
 * A piece that is not `split` starts a field even if it is empty (`""` is an empty argument).
 */
interface Piece {
  readonly text: string;
  readonly quoted: boolean;
  readonly split: boolean;
}

/** Carries an expansion error from deep inside the expansion to the caller. */
class ExpansionFailure extends Error {
  constructor(readonly feature: UnsupportedParameter) {
    super(`expansion error: ${feature}`);
  }
}

/** What the expansion of one session needs. */
interface Context {
  readonly host: Host;
  readonly session: Session;
}

/**
 * Expands `words` into fields like bash, for the shell `session` in `world`:
 *
 * - `~` expands to `HOME` (or the home of the session's user if `HOME` is unset), `~name` to
 *   the home of the user `name`, `~+` to `PWD` and `~-` to `OLDPWD`; an unknown user or an
 *   unset variable keeps the tilde prefix as text. The result is neither split nor globbed.
 * - `$name` and `${name}` expand to the shell variable, or to nothing if it is unset. `$?` is
 *   the last exit status, `$0` is `-bash`; an interactive shell has no positional parameters,
 *   so `$1`, `$@` and `$*` are empty and `$#` is `0`; `$!` is empty without background jobs.
 * - Unquoted expansion results are split at the characters of `IFS` (bash's default if unset,
 *   no splitting if empty); a word whose unquoted expansions are all empty disappears, but `""`
 *   and `"$x"` stay as an empty field, and `"$@"` gives no field.
 * - Each field with an unquoted `*`, `?` or bracket expression becomes the sorted list of
 *   matching paths, or stays as it is if nothing matches (see `expandPathname`).
 *
 * `$$` and `$-` give an "unsupported" error. Throws an Error if the session's host is not part
 * of `world`.
 */
export function expandWords(
  world: World,
  session: Session,
  words: readonly Word[],
): WordsExpansion {
  const context = { host: hostOf(world, session), session };
  const fields: string[] = [];
  for (const word of words) {
    try {
      fields.push(...expandWord(context, word.parts));
    } catch (failure) {
      if (failure instanceof ExpansionFailure) {
        return {
          ok: false,
          error: { kind: "unsupported", feature: failure.feature, start: word.start },
        };
      }
      throw failure;
    }
  }
  return { ok: true, fields };
}

/**
 * Expands the value of `assignment` like bash: tildes and parameters are expanded, but the
 * result is neither split nor used as a pattern (`x=*` stores `*`). `+=` is up to the caller.
 * Gives the same errors as `expandWords`.
 */
export function expandAssignment(
  world: World,
  session: Session,
  assignment: Assignment,
): AssignmentExpansion {
  const context = { host: hostOf(world, session), session };
  try {
    const pieces = assignment.value.flatMap((part) => expandPart(context, part));
    return { ok: true, value: pieces.map((piece) => piece.text).join("") };
  } catch (failure) {
    if (failure instanceof ExpansionFailure) {
      return {
        ok: false,
        error: { kind: "unsupported", feature: failure.feature, start: assignment.start },
      };
    }
    throw failure;
  }
}

function hostOf(world: World, session: Session): Host {
  const host = findHost(world, session.host);
  if (host === undefined) {
    throw new Error(`the session's host "${session.host}" is not part of the world`);
  }
  return host;
}

function expandWord(context: Context, parts: readonly WordPart[]): readonly string[] {
  const pieces = parts.flatMap((part) => expandPart(context, part));
  const ifs = context.session.variables.get("IFS") ?? DEFAULT_IFS;
  const { host, session } = context;
  return splitFields(pieces, ifs).flatMap((field) => {
    const matches = expandPathname(field, host.root, session.credentials, session.cwd);
    return matches.length > 0 ? matches : [field.map((char) => char.c).join("")];
  });
}

function expandPart(context: Context, part: WordPart): readonly Piece[] {
  switch (part.kind) {
    case "text":
      return [{ text: part.text, quoted: part.quoted, split: false }];
    case "tilde":
      return [expandTilde(context, part.user)];
    case "parameter":
      if (part.quoted && part.name === "@") {
        // "$@" gives one field per positional parameter, and an interactive shell has none.
        return [];
      }
      return [
        {
          text: parameterValue(context.session, part.name),
          quoted: part.quoted,
          split: !part.quoted,
        },
      ];
  }
}

function expandTilde(context: Context, user: string): Piece {
  const { host, session } = context;
  let home: string | undefined;
  if (user === "") {
    home = session.variables.get("HOME") ?? findUserByUid(host, session.credentials.uid)?.home;
  } else if (user === "+") {
    home = session.variables.get("PWD");
  } else if (user === "-") {
    home = session.variables.get("OLDPWD");
  } else {
    home = findUser(host, user)?.home;
  }
  if (home === undefined) {
    return { text: `~${user}`, quoted: false, split: false };
  }
  return { text: home, quoted: true, split: false };
}

function parameterValue(session: Session, name: string): string {
  switch (name) {
    case "?":
      return String(session.exitStatus);
    case "$":
      throw new ExpansionFailure("process-id");
    case "-":
      throw new ExpansionFailure("shell-options");
    case "#":
      return "0";
    case "0":
      return SHELL_NAME;
    case "!":
    case "@":
    case "*":
      return "";
    default:
      // Positional parameters (`$1`, `${10}`) are never set in an interactive shell.
      return /^[0-9]+$/.test(name) ? "" : (session.variables.get(name) ?? "");
  }
}

/**
 * Splits `pieces` into fields at the `IFS` characters of `split` pieces, following POSIX:
 * IFS whitespace at the start and end is skipped and a run of it separates fields; every other
 * IFS character separates fields together with the IFS whitespace around it, so `a::b` with
 * `IFS=:` gives an empty field between `a` and `b`, but a separator at the end gives none.
 */
function splitFields(pieces: readonly Piece[], ifs: string): readonly (readonly PatternChar[])[] {
  const fields: PatternChar[][] = [];
  let current: PatternChar[] | undefined;
  let endedByWhitespace = false;
  for (const piece of pieces) {
    if (!piece.split) {
      current ??= [];
      for (const c of Array.from(piece.text)) {
        current.push({ c, quoted: piece.quoted });
      }
      continue;
    }
    for (const c of Array.from(piece.text)) {
      if (!ifs.includes(c)) {
        current ??= [];
        current.push({ c, quoted: false });
      } else if (IFS_WHITESPACE.has(c)) {
        if (current !== undefined) {
          fields.push(current);
          current = undefined;
          endedByWhitespace = true;
        }
      } else {
        if (current !== undefined) {
          fields.push(current);
          current = undefined;
        } else if (!endedByWhitespace) {
          fields.push([]);
        }
        endedByWhitespace = false;
      }
    }
  }
  if (current !== undefined) {
    fields.push(current);
  }
  return fields;
}
