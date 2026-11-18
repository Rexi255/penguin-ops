// The coreutils command `mkdir` 9.7 (ADR 0060), following `src/mkdir.c` and gnulib's
// `make_dir_parents` and `mkancesdirs`. `mkdir` creates each operand as a directory with the
// mode `0777 & ~umask`. With `-p` it first creates the missing directories on the way (each one
// also writable and searchable for its owner, whatever the umask says) and enters them like
// chdir(2), and an operand that already is a directory is no error. `-v` writes a line for every
// directory it creates.

import { type CommandInvocation, defineCommand } from "../command-registry";
import { makeDirectory, type MakeDirectoryError } from "../fs-write";
import type { CommandResult } from "../interpreter";
import { lookup } from "../lookup";
import { localeQuote, shellQuoteAlways } from "../quote";
import type { Session } from "../session";
import { findHost, type World } from "../world";
import { changeDirectory, directoryView, LOOKUP_ERROR_MESSAGES } from "./directory-names";

/** The exit status after an error, coreutils' `EXIT_FAILURE`. */
const FAILURE = 1;

/** The owner's write and search bits, which `mkdir -p` keeps for the directories on the way. */
const OWNER_WRITE_SEARCH = 0o300;

type MkdirOption = "context" | "mode" | "parents" | "verbose" | "help" | "version";

export const mkdir = defineCommand<MkdirOption>({
  name: "mkdir",
  // The `longopts` of coreutils 9.7; `-Z` takes no argument, `--context` an optional one.
  options: [
    { id: "context", short: "Z", argument: "none" },
    { id: "context", long: "context", argument: "optional" },
    { id: "mode", short: "m", long: "mode", argument: "required" },
    { id: "parents", short: "p", long: "parents", argument: "none" },
    { id: "verbose", short: "v", long: "verbose", argument: "none" },
    { id: "help", long: "help", argument: "none" },
    { id: "version", long: "version", argument: "none" },
  ],
  simulated: ["parents", "verbose"],
  usageErrorStatus: FAILURE,
  run: (invocation) => {
    if (invocation.operands.length === 0) {
      invocation.stderr(
        `${invocation.name}: missing operand\n` +
          `Try '${invocation.name} --help' for more information.\n`,
      );
      return { exitStatus: FAILURE };
    }
    return new MakeDirectories(invocation).run();
  },
});

/** The messages of the errors of mkdir(2) and chdir(2), as `strerror(3)` writes them. */
const ERROR_MESSAGES: Readonly<Record<MakeDirectoryError, string>> = {
  ...LOOKUP_ERROR_MESSAGES,
  EEXIST: "File exists",
};

/** A directory on the way to an operand: the operand up to it, and its own name. */
export interface Ancestor {
  /** The operand up to the end of this component, such as `./a/b` for `./a/b/c`. */
  readonly prefix: string;
  /** The component itself, such as `b`. */
  readonly component: string;
}

/**
 * The directories on the way to `file` and the rest after them, as gnulib's `mkancesdirs`
 * scans the name from left to right: every component that a slash and a further component
 * follow is an ancestor. Repeated slashes belong to the separator, a leading slash to the
 * first ancestor, and trailing slashes to the rest.
 */
export function ancestorsOf(file: string): {
  readonly ancestors: readonly Ancestor[];
  readonly rest: string;
} {
  const ancestors: Ancestor[] = [];
  /** The index of the slash after the last component that ended, or -1. */
  let separator = -1;
  /** The index where the component that is not processed yet starts. */
  let start = 0;
  for (let index = 0; index < file.length; index++) {
    const character = file[index];
    const next = file[index + 1];
    if (next === "/") {
      if (character !== "/") {
        separator = index + 1;
      }
    } else if (character === "/" && next !== undefined && separator !== -1) {
      ancestors.push({
        prefix: file.slice(0, separator),
        component: file.slice(start, separator),
      });
      start = index + 1;
    }
  }
  return { ancestors, rest: file.slice(start) };
}

/** One run of `mkdir` over its operands. */
class MakeDirectories {
  private world: World;
  private readonly parents: boolean;
  private readonly verbose: boolean;
  private failed = false;

  constructor(private readonly invocation: CommandInvocation<MkdirOption>) {
    this.world = invocation.world;
    this.parents = invocation.options.some((option) => option.id === "parents");
    this.verbose = invocation.options.some((option) => option.id === "verbose");
  }

  run(): CommandResult {
    for (const operand of this.invocation.operands) {
      if (this.parents) {
        this.makeWithParents(operand);
      } else {
        this.make(operand);
      }
    }
    return { exitStatus: this.failed ? FAILURE : 0, world: this.world };
  }

  /** `mkdir DIR`: one mkdir(2) of the whole operand. */
  private make(operand: string): void {
    const made = makeDirectory(this.world, this.invocation.session, operand, this.invocation.clock);
    if (!made.ok) {
      this.fail(operand, made.error);
      return;
    }
    this.world = made.world;
    this.announce(operand);
  }

  /** `mkdir -p DIR`: the directories on the way first, then the operand itself. */
  private makeWithParents(operand: string): void {
    const { session, clock } = this.invocation;
    const ancestorSession: Session = { ...session, umask: session.umask & ~OWNER_WRITE_SEARCH };
    for (const { prefix, component } of ancestorsOf(operand).ancestors) {
      if (component === ".") {
        continue;
      }
      let makeError: MakeDirectoryError | undefined;
      // ".." exists whenever the directory before it does.
      if (component !== "..") {
        const made = makeDirectory(this.world, ancestorSession, prefix, clock);
        if (made.ok) {
          this.world = made.world;
          this.announce(prefix);
        } else {
          makeError = made.error;
        }
      }
      const entered = changeDirectory(directoryView(this.world, session), prefix);
      if (!entered.ok) {
        // A missing directory is better explained by why mkdir(2) could not create it.
        this.fail(
          operand,
          makeError !== undefined && entered.error === "ENOENT" ? makeError : entered.error,
        );
        return;
      }
    }
    const made = makeDirectory(this.world, session, operand, clock);
    if (made.ok) {
      this.world = made.world;
      this.announce(operand);
      return;
    }
    if (made.error === "EEXIST" && this.isDirectory(operand)) {
      return;
    }
    this.fail(operand, made.error);
  }

  /** Whether stat(2) finds a directory at `path`. */
  private isDirectory(path: string): boolean {
    const { session } = this.invocation;
    const host = findHost(this.world, session.host);
    if (host === undefined) {
      throw new Error(`the session's host "${session.host}" is not part of the world`);
    }
    const found = lookup(host.root, session.credentials, session.cwd, path);
    return found.ok && found.node.kind === "directory";
  }

  /** Writes `mkdir: created directory 'DIR'` for `-v`. */
  private announce(directory: string): void {
    if (this.verbose) {
      this.invocation.stdout(
        `${this.invocation.name}: created directory ${shellQuoteAlways(directory)}\n`,
      );
    }
  }

  /** Writes `mkdir: cannot create directory ‘DIR’: MESSAGE`. */
  private fail(operand: string, error: MakeDirectoryError): void {
    this.invocation.stderr(
      `${this.invocation.name}: cannot create directory ${localeQuote(operand)}: ${ERROR_MESSAGES[error]}\n`,
    );
    this.failed = true;
  }
}
