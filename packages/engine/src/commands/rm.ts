// The coreutils command `rm` 9.7 (ADR 0061), following `src/rm.c` and `src/remove.c`, which walk
// each operand with gnulib's fts. `rm` removes files; directories only with `-r` (recursively)
// or `-d` (if empty). `-f` ignores missing files and never asks. Without `-f`, `rm` asks before
// it removes a write-protected file when standard input is the terminal; the game cannot take
// the answer, so it writes the question and stops the input with a notice, keeping what `rm`
// removed before. Operands whose last component is `.` or `..` are refused, and `rm -r /` is
// refused like `--preserve-root`.

import { type CommandInvocation, defineCommand } from "../command-registry";
import type { FsNode } from "../fs-node";
import { openDirectory } from "../fs-read";
import { removeEntry, type RemoveError, type RemovedKind } from "../fs-remove";
import type { CommandContext, CommandResult } from "../interpreter";
import { lookup, type LookupError } from "../lookup";
import { splitPath } from "../path";
import { hasPermission } from "../permissions";
import { shellQuote, shellQuoteAlways } from "../quote";
import { findHost, type World } from "../world";
import { LOOKUP_ERROR_MESSAGES } from "./directory-names";

/** The exit status after an error, coreutils' `EXIT_FAILURE`. */
const FAILURE = 1;

type RmOption =
  | "force"
  | "interactive"
  | "one-file-system"
  | "no-preserve-root"
  | "preserve-root"
  | "presume-input-tty"
  | "recursive"
  | "dir"
  | "verbose"
  | "help"
  | "version"
  | "interactive-always"
  | "interactive-once";

export const rm = defineCommand<RmOption>({
  name: "rm",
  // The `long_opts` of coreutils 9.7, then the short options without a long name.
  options: [
    { id: "force", short: "f", long: "force", argument: "none" },
    { id: "interactive", long: "interactive", argument: "optional" },
    { id: "one-file-system", long: "one-file-system", argument: "none" },
    { id: "no-preserve-root", long: "no-preserve-root", argument: "none" },
    { id: "preserve-root", long: "preserve-root", argument: "optional" },
    { id: "presume-input-tty", long: "-presume-input-tty", argument: "none" },
    { id: "recursive", short: "r", long: "recursive", argument: "none" },
    { id: "dir", short: "d", long: "dir", argument: "none" },
    { id: "verbose", short: "v", long: "verbose", argument: "none" },
    { id: "help", long: "help", argument: "none" },
    { id: "version", long: "version", argument: "none" },
    { id: "interactive-always", short: "i", argument: "none" },
    { id: "interactive-once", short: "I", argument: "none" },
    { id: "recursive", short: "R", argument: "none" },
  ],
  simulated: ["force", "preserve-root", "recursive", "dir", "verbose"],
  usageErrorStatus: FAILURE,
  checkOption: (option) =>
    option.id === "preserve-root" && option.argument !== undefined && option.argument !== "all"
      ? {
          message: `unrecognized --preserve-root argument: ${shellQuoteAlways(option.argument)}`,
          tryHelp: false,
        }
      : undefined,
  usageErrorNote: leadingHyphenNote,
  run: (invocation) => {
    const { options, operands, name } = invocation;
    const force = options.some((option) => option.id === "force");
    if (operands.length === 0) {
      if (force) {
        return { exitStatus: 0 };
      }
      invocation.stderr(`${name}: missing operand\nTry '${name} --help' for more information.\n`);
      return { exitStatus: FAILURE };
    }
    return new Removal(invocation, force).run();
  },
});

/**
 * rm.c's `diagnose_leading_hyphen`: after a usage error, the first argument that starts with `-`
 * and names an existing file gets a hint how to remove it.
 */
function leadingHyphenNote(context: CommandContext): string {
  const { world, session, args, name } = context;
  const root = findHost(world, session.host)?.root;
  if (root === undefined) {
    return "";
  }
  const file = args.find(
    (arg) =>
      arg.length > 1 &&
      arg.startsWith("-") &&
      lookup(root, session.credentials, session.cwd, arg).ok,
  );
  return file === undefined
    ? ""
    : `Try '${name} ./${shellQuote(file)}' to remove the file ${shellQuoteAlways(file)}.\n`;
}

/** The messages of the errors of unlink(2), rmdir(2), stat(2) and opendir(3). */
const ERROR_MESSAGES: Readonly<Record<RemoveError, string>> = {
  ...LOOKUP_ERROR_MESSAGES,
  EISDIR: "Is a directory",
  ENOTEMPTY: "Directory not empty",
  EPERM: "Operation not permitted",
  EBUSY: "Device or resource busy",
  EINVAL: "Invalid argument",
};

/** rm asked a question on the terminal, which the game cannot answer. */
class Question extends Error {
  constructor() {
    super("rm asks a question");
  }
}

/** Whether a directory is empty, has entries, or cannot be read (`directory_status`). */
type DirectoryStatus = "empty" | "nonempty" | { readonly error: LookupError };

/** One run of `rm` over its operands. */
class Removal {
  private world: World;
  private readonly recursive: boolean;
  private readonly emptyDirectories: boolean;
  private readonly verbose: boolean;
  /** rm.c's `stdin_tty` without `-f`: whether rm asks before it removes write-protected files. */
  private readonly asks: boolean;
  private failed = false;

  constructor(
    private readonly invocation: CommandInvocation<RmOption>,
    private readonly force: boolean,
  ) {
    const has = (id: RmOption): boolean => invocation.options.some((option) => option.id === id);
    this.world = invocation.world;
    this.recursive = has("recursive");
    this.emptyDirectories = has("dir");
    this.verbose = has("verbose");
    this.asks = !force && invocation.stdin.kind === "terminal";
  }

  run(): CommandResult {
    try {
      for (const operand of this.invocation.operands) {
        this.removeOperand(trimTrailingSlashes(operand));
      }
    } catch (failure) {
      if (failure instanceof Question) {
        return { stop: { key: "terminal-input-not-simulated" }, world: this.world };
      }
      throw failure;
    }
    return { exitStatus: this.failed ? FAILURE : 0, world: this.world };
  }

  /** Removes one operand; returns whether it is gone. */
  private removeOperand(path: string): boolean {
    const found = this.stat(path);
    if (!found.ok) {
      // fts reports FTS_NS; rm then tries unlink(2), which fails the same way.
      return this.removed(path, found.error);
    }
    if (found.node.kind === "file") {
      return this.removeFile(path, found.node);
    }
    return this.removeDirectory(path, found.node, true);
  }

  /** Removes the file at `path` (fts' FTS_F or FTS_NSOK). */
  private removeFile(path: string, node: FsNode): boolean {
    if (this.writeProtected(node)) {
      const type =
        node.kind === "file" && node.content === "" ? "regular empty file" : "regular file";
      this.ask(`remove write-protected ${type} ${shellQuoteAlways(path)}`);
    }
    return this.excise(path, "file");
  }

  /** Removes the directory at `path` and, with `-r`, everything in it. */
  private removeDirectory(path: string, node: FsNode, operand: boolean): boolean {
    let status: DirectoryStatus | undefined;
    const statusOf = (): DirectoryStatus => (status ??= this.directoryStatus(path));
    // fts' FTS_D, the directory before its entries.
    if (!this.recursive && !(this.emptyDirectories && statusOf() !== "nonempty")) {
      this.report(path, this.emptyDirectories ? "ENOTEMPTY" : "EISDIR");
      return false;
    }
    if (operand && !this.operandAllowed(path)) {
      return false;
    }
    if (this.writeProtected(node)) {
      const current = statusOf();
      const quoted = shellQuoteAlways(path);
      if (current === "nonempty") {
        this.ask(`descend into write-protected directory ${quoted}`);
      } else if (current !== "empty") {
        if (!(this.emptyDirectories && current.error === "EACCES")) {
          this.report(path, current.error);
          return false;
        }
      } else {
        this.ask(`remove write-protected directory ${quoted}`);
      }
    }
    const opened = openDirectory(this.world, this.invocation.session, path);
    if (!opened.ok) {
      // fts' FTS_DNR: the directory cannot be read, but rmdir(2) may still remove it if empty.
      // A write-protected one only gets here with -d and EACCES; remove.c then asks again.
      if (this.writeProtected(node)) {
        this.ask(
          this.recursive
            ? `remove write-protected directory ${shellQuoteAlways(path)}`
            : `attempt removal of inaccessible directory ${shellQuoteAlways(path)}`,
        );
      }
      return this.excise(path, "directory", opened.error);
    }
    let complete = true;
    for (const entry of opened.entries) {
      if (entry.name === "." || entry.name === "..") {
        continue;
      }
      const child = path.endsWith("/") ? path + entry.name : `${path}/${entry.name}`;
      complete = this.removeEntryOf(child) && complete;
    }
    // fts' FTS_DP: a directory with an entry that stayed is left alone without a message. A
    // write-protected directory would be asked about again, but the game stopped at the first
    // question above.
    if (!complete) {
      return false;
    }
    return this.excise(path, "directory");
  }

  /** Removes an entry found inside a directory. */
  private removeEntryOf(path: string): boolean {
    const found = this.stat(path);
    if (!found.ok) {
      // fts stats directories (FTS_NS if that fails) and leaves files unstat'ed (FTS_NSOK); both
      // end in unlink(2), which fails like the stat(2) when the directory cannot be searched.
      return this.excise(path, "file");
    }
    return found.node.kind === "file"
      ? this.removeFile(path, found.node)
      : this.removeDirectory(path, found.node, false);
  }

  /**
   * The checks for operands: a last component `.` or `..` is refused, and `-r` on a directory
   * that is `/` is refused like `--preserve-root`. `--preserve-root=all` would skip directories
   * on another device; the game has one file system per host, so only its stat(2) of `DIR/..`
   * can fail.
   */
  private operandAllowed(path: string): boolean {
    const name = this.invocation.name;
    const last = splitPath(path).components.at(-1);
    if (last === "." || last === "..") {
      this.invocation.stderr(
        `${name}: refusing to remove '.' or '..' directory: skipping ${shellQuoteAlways(path)}\n`,
      );
      this.failed = true;
      return false;
    }
    const found = this.stat(path);
    if (this.recursive && found.ok && found.path === "/") {
      const same = path === "/" ? "" : " (same as '/')";
      this.invocation.stderr(
        `${name}: it is dangerous to operate recursively on ${shellQuoteAlways(path)}${same}\n` +
          `${name}: use --no-preserve-root to override this failsafe\n`,
      );
      this.failed = true;
      return false;
    }
    const preserveAll = this.invocation.options.some(
      (option) => option.id === "preserve-root" && option.argument === "all",
    );
    const parent = path.endsWith("/") ? `${path}..` : `${path}/..`;
    if (preserveAll && !this.stat(parent).ok) {
      this.invocation.stderr(
        `${name}: failed to stat ${shellQuoteAlways(parent)}: skipping ${shellQuoteAlways(path)}\n`,
      );
      this.failed = true;
      return false;
    }
    return true;
  }

  /**
   * unlink(2) or rmdir(2) of `path`, or the error of an earlier step (`earlier`). Writes
   * `removed 'PATH'` for `-v`. A missing file is no error with `-f`. An unreadable directory
   * that is not empty reports why it could not be read.
   */
  private excise(path: string, kind: RemovedKind, unreadable?: LookupError): boolean {
    const result = removeEntry(
      this.world,
      this.invocation.session,
      path,
      kind,
      this.invocation.clock,
    );
    if (result.ok) {
      this.world = result.world;
      if (this.verbose) {
        const what = kind === "directory" ? "removed directory" : "removed";
        this.invocation.stdout(`${what} ${shellQuoteAlways(path)}\n`);
      }
      return true;
    }
    const error =
      unreadable !== undefined && result.error === "ENOTEMPTY" ? unreadable : result.error;
    return this.removed(path, error);
  }

  /** The end of a failed removal: ignored for a missing file with `-f`, else reported. */
  private removed(path: string, error: RemoveError): boolean {
    if (this.force && (error === "ENOENT" || error === "ENOTDIR")) {
      return true;
    }
    this.report(path, error);
    return false;
  }

  /** Writes `rm: cannot remove 'PATH': MESSAGE`. */
  private report(path: string, error: RemoveError): void {
    this.invocation.stderr(
      `${this.invocation.name}: cannot remove ${shellQuoteAlways(path)}: ${ERROR_MESSAGES[error]}\n`,
    );
    this.failed = true;
  }

  /** Asks `rm: QUESTION? ` on standard error; the game stops there. */
  private ask(question: string): never {
    this.invocation.stderr(`${this.invocation.name}: ${question}? `);
    throw new Question();
  }

  /**
   * Whether rm asks before removing `node`: only when it asks at all, and when the user may not
   * write to it (root may write to everything).
   */
  private writeProtected(node: FsNode): boolean {
    return this.asks && !hasPermission(node, this.invocation.session.credentials, "write");
  }

  /** lstat(2) of `path`. */
  private stat(path: string): ReturnType<typeof lookup> {
    const { session } = this.invocation;
    const host = findHost(this.world, session.host);
    if (host === undefined) {
      throw new Error(`the session's host "${session.host}" is not part of the world`);
    }
    return lookup(host.root, session.credentials, session.cwd, path);
  }

  /** `directory_status`: whether the directory at `path` is empty, has entries, or cannot be read. */
  private directoryStatus(path: string): DirectoryStatus {
    const opened = openDirectory(this.world, this.invocation.session, path);
    if (!opened.ok) {
      return { error: opened.error };
    }
    return opened.entries.some((entry) => entry.name !== "." && entry.name !== "..")
      ? "nonempty"
      : "empty";
  }
}

/** fts_open's treatment of an operand: two or more trailing slashes become one. */
function trimTrailingSlashes(operand: string): string {
  let length = operand.length;
  if (length > 2 && operand.endsWith("/")) {
    while (length > 1 && operand[length - 2] === "/") {
      length--;
    }
  }
  return operand.slice(0, length);
}
