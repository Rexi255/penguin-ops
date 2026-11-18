// The coreutils command `touch` 9.7 (ADR 0060), following `src/touch.c`. `touch` opens each
// operand like open(2) with O_WRONLY | O_CREAT, which creates a missing file, and then sets its
// times like utimensat(2): to the current time, or to the times of a reference file (`-r`).
// `-c` (and `-h`) create nothing, `-a` and `-m` change only the access or the modification
// time. The game keeps no access times, so `-a` changes nothing that can be seen, but it needs
// the same permissions as on Linux. `-` stands for standard output.

import { type CommandInvocation, defineCommand } from "../command-registry";
import type { DirectoryNode } from "../fs-node";
import {
  setTimes,
  type SetTimesError,
  type TimesUpdate,
  writeFile,
  type WriteError,
} from "../fs-write";
import type { CommandResult } from "../interpreter";
import { lookup } from "../lookup";
import { shellQuoteAlways } from "../quote";
import type { Session } from "../session";
import { findHost, type World } from "../world";
import { LOOKUP_ERROR_MESSAGES } from "./directory-names";

/** The exit status after an error, coreutils' `EXIT_FAILURE`. */
const FAILURE = 1;

/** The operand that stands for standard output. */
const STDOUT_OPERAND = "-";

type TouchOption =
  | "time"
  | "no-create"
  | "date"
  | "reference"
  | "no-dereference"
  | "help"
  | "version"
  | "access"
  | "ignored"
  | "modification"
  | "stamp";

export const touch = defineCommand<TouchOption>({
  name: "touch",
  // The `longopts` of coreutils 9.7, then the short options without a long name.
  options: [
    { id: "time", long: "time", argument: "required" },
    { id: "no-create", short: "c", long: "no-create", argument: "none" },
    { id: "date", short: "d", long: "date", argument: "required" },
    { id: "reference", short: "r", long: "reference", argument: "required" },
    { id: "no-dereference", short: "h", long: "no-dereference", argument: "none" },
    { id: "help", long: "help", argument: "none" },
    { id: "version", long: "version", argument: "none" },
    { id: "access", short: "a", argument: "none" },
    { id: "ignored", short: "f", argument: "none" },
    { id: "modification", short: "m", argument: "none" },
    { id: "stamp", short: "t", argument: "required" },
  ],
  simulated: ["no-create", "reference", "no-dereference", "access", "ignored", "modification"],
  usageErrorStatus: FAILURE,
  run: (invocation) => runTouch(invocation),
});

/** The messages of the errors of open(2) and utimensat(2), as `strerror(3)` writes them. */
const ERROR_MESSAGES: Readonly<Record<WriteError | SetTimesError, string>> = {
  ...LOOKUP_ERROR_MESSAGES,
  EISDIR: "Is a directory",
  EPERM: "Operation not permitted",
};

/** What `touch` does to every operand, after all options. */
interface TouchSettings {
  /** `-c` or `-h`: do not open the file, so a missing file is not created. */
  readonly noOpen: boolean;
  /** `-c`: a missing file is no error. */
  readonly noCreate: boolean;
  readonly update: TimesUpdate;
}

function runTouch(invocation: CommandInvocation<TouchOption>): CommandResult {
  const { options, operands, name } = invocation;
  const has = (id: TouchOption): boolean => options.some((option) => option.id === id);
  const access = has("access");
  const modification = has("modification");
  // Without -a and -m, both times change.
  const changesMtime = modification || !access;
  const changesAtime = access || !modification;
  let update: TimesUpdate;
  const reference = options.findLast((option) => option.id === "reference")?.argument;
  if (reference !== undefined) {
    const mtime = referenceTime(invocation, reference);
    if (mtime === undefined) {
      return { exitStatus: FAILURE };
    }
    update = { kind: "explicit", mtime: changesMtime ? mtime : "omit" };
  } else if (changesMtime && changesAtime) {
    update = { kind: "now" };
  } else {
    update = { kind: "explicit", mtime: changesMtime ? "now" : "omit" };
  }
  if (operands.length === 0) {
    invocation.stderr(
      `${name}: missing file operand\nTry '${name} --help' for more information.\n`,
    );
    return { exitStatus: FAILURE };
  }
  const settings: TouchSettings = {
    noOpen: has("no-create") || has("no-dereference"),
    noCreate: has("no-create"),
    update,
  };
  let world = invocation.world;
  let failed = false;
  for (const operand of operands) {
    const touched = touchOne(invocation, world, settings, operand);
    world = touched.world;
    failed ||= !touched.ok;
  }
  return { exitStatus: failed ? FAILURE : 0, world };
}

/**
 * The mtime of the reference file of `-r`, found like stat(2); `undefined` after writing
 * `failed to get attributes of 'FILE': MESSAGE`, after which touch exits.
 */
function referenceTime(
  invocation: CommandInvocation<TouchOption>,
  reference: string,
): number | undefined {
  const { world, session } = invocation;
  const found = lookup(hostRoot(world, session), session.credentials, session.cwd, reference);
  if (!found.ok) {
    invocation.stderr(
      `${invocation.name}: failed to get attributes of ${shellQuoteAlways(reference)}: ` +
        `${LOOKUP_ERROR_MESSAGES[found.error]}\n`,
    );
    return undefined;
  }
  return found.node.mtime;
}

/** Touches one operand like touch.c's `touch`; returns the world after it and whether it worked. */
function touchOne(
  invocation: CommandInvocation<TouchOption>,
  world: World,
  settings: TouchSettings,
  operand: string,
): { readonly world: World; readonly ok: boolean } {
  const { session, clock, name } = invocation;
  if (operand === STDOUT_OPERAND) {
    return touchStdout(invocation, world, settings);
  }
  let current = world;
  let openError: WriteError | undefined;
  if (!settings.noOpen) {
    const opened = writeFile(current, session, { path: operand, text: "", mode: "append" }, clock);
    if (opened.ok) {
      current = opened.world;
    } else {
      openError = opened.error;
    }
  }
  const set = setTimes(current, session, operand, settings.update, clock);
  if (set.ok) {
    return { world: set.world, ok: true };
  }
  // A directory cannot be opened for writing, so its open error would mislead.
  if (openError !== undefined && openError !== "EISDIR") {
    invocation.stderr(
      `${name}: cannot touch ${shellQuoteAlways(operand)}: ${ERROR_MESSAGES[openError]}\n`,
    );
    return { world: current, ok: false };
  }
  if (settings.noCreate && set.error === "ENOENT") {
    return { world: current, ok: true };
  }
  invocation.stderr(
    `${name}: setting times of ${shellQuoteAlways(operand)}: ${ERROR_MESSAGES[set.error]}\n`,
  );
  return { world: current, ok: false };
}

/**
 * `touch -`: the times of standard output, like futimens(2) on file descriptor 1. A file from
 * `>` or `>>` gets them; the terminal and a pipe belong to the player, so the call works and
 * changes nothing the game keeps.
 */
function touchStdout(
  invocation: CommandInvocation<TouchOption>,
  world: World,
  settings: TouchSettings,
): { readonly world: World; readonly ok: boolean } {
  const file = invocation.stdoutFile;
  if (file === undefined) {
    return { world, ok: true };
  }
  const session: Session = { ...invocation.session, cwd: "/" };
  const set = setTimes(world, session, file.path, settings.update, invocation.clock);
  if (set.ok) {
    return { world: set.world, ok: true };
  }
  invocation.stderr(
    `${invocation.name}: setting times of ${shellQuoteAlways(STDOUT_OPERAND)}: ` +
      `${ERROR_MESSAGES[set.error]}\n`,
  );
  return { world, ok: false };
}

function hostRoot(world: World, session: Session): DirectoryNode {
  const host = findHost(world, session.host);
  if (host === undefined) {
    throw new Error(`the session's host "${session.host}" is not part of the world`);
  }
  return host.root;
}
