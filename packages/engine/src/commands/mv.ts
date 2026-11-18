// The coreutils command `mv` 9.7 (ADR 0063), following `src/mv.c` and the move mode of
// `copy_internal` in `src/copy.c`. `mv SOURCE DEST` first tries rename(2) without replacing
// anything; if that fails and DEST is a directory (or with `-t DIR`), every source moves into it
// under its own last component. An existing destination is replaced like rename(2) does. The
// game has one file system per host, so mv never has to copy and remove. Without `-f`, mv asks
// before it replaces a destination the user may not write to when standard input is the
// terminal; the game writes the question and stops the input with a notice.

import { type CommandInvocation, defineCommand } from "../command-registry";
import { modeString } from "../file-status";
import type { FsNode } from "../fs-node";
import { renameEntry, type RenameError } from "../fs-rename";
import type { CommandResult } from "../interpreter";
import { lookup, type LookupError, type LookupResult } from "../lookup";
import { hasPermission } from "../permissions";
import { shellQuoteAlways } from "../quote";
import { findHost, type World } from "../world";
import { LOOKUP_ERROR_MESSAGES } from "./directory-names";
import { fileNameConcat, lastComponent, stripTrailingSlashes } from "./file-names";

/** The exit status after an error, coreutils' `EXIT_FAILURE`. */
const FAILURE = 1;

type MvOption =
  | "backup"
  | "context"
  | "debug"
  | "exchange"
  | "force"
  | "interactive"
  | "no-clobber"
  | "no-copy"
  | "no-target-directory"
  | "strip-trailing-slashes"
  | "suffix"
  | "target-directory"
  | "update"
  | "verbose"
  | "help"
  | "version";

export const mv = defineCommand<MvOption>({
  name: "mv",
  // The `long_options` of coreutils 9.7, then the short options with another argument kind.
  options: [
    { id: "backup", long: "backup", argument: "optional" },
    { id: "context", short: "Z", long: "context", argument: "none" },
    { id: "debug", long: "debug", argument: "none" },
    { id: "exchange", long: "exchange", argument: "none" },
    { id: "force", short: "f", long: "force", argument: "none" },
    { id: "interactive", short: "i", long: "interactive", argument: "none" },
    { id: "no-clobber", short: "n", long: "no-clobber", argument: "none" },
    { id: "no-copy", long: "no-copy", argument: "none" },
    { id: "no-target-directory", short: "T", long: "no-target-directory", argument: "none" },
    { id: "strip-trailing-slashes", long: "strip-trailing-slashes", argument: "none" },
    { id: "suffix", short: "S", long: "suffix", argument: "required" },
    { id: "target-directory", short: "t", long: "target-directory", argument: "required" },
    { id: "update", long: "update", argument: "optional" },
    { id: "verbose", short: "v", long: "verbose", argument: "none" },
    { id: "help", long: "help", argument: "none" },
    { id: "version", long: "version", argument: "none" },
    { id: "backup", short: "b", argument: "none" },
    { id: "update", short: "u", argument: "none" },
  ],
  // --no-copy only forbids copying across file systems, which the game never needs.
  simulated: [
    "force",
    "no-copy",
    "no-target-directory",
    "strip-trailing-slashes",
    "target-directory",
    "verbose",
  ],
  usageErrorStatus: FAILURE,
  checkOption: (option, before) =>
    option.id === "target-directory" && before.some((earlier) => earlier.id === option.id)
      ? { message: "multiple target directories specified", tryHelp: false }
      : undefined,
  run: (invocation) => new Move(invocation).run(),
});

/** The errors mv reports, as `strerror(3)` writes them. */
const ERROR_MESSAGES: Readonly<Record<RenameError, string>> = {
  ...LOOKUP_ERROR_MESSAGES,
  EEXIST: "File exists",
  EBUSY: "Device or resource busy",
  EINVAL: "Invalid argument",
  ENOTEMPTY: "Directory not empty",
  EISDIR: "Is a directory",
  EPERM: "Operation not permitted",
};

/** rename(2) errors after which mv blames the destination: "cannot overwrite 'DEST'". */
const DESTINATION_ERRORS: ReadonlySet<RenameError> = new Set(["EEXIST", "EISDIR", "ENOTEMPTY"]);

/** mv asked a question on the terminal, which the game cannot answer. */
class Question extends Error {
  constructor() {
    super("mv asks a question");
  }
}

/** The result of an earlier rename(2): it worked, or why not; `undefined` if not tried yet. */
type RenameAttempt = "ok" | RenameError | undefined;

/** One run of `mv`. */
class Move {
  private world: World;
  private readonly force: boolean;
  private readonly verbose: boolean;
  private failed = false;
  /** The canonical paths of the destinations moved to, with two or more sources. */
  private destinationsSeen: Set<string> | undefined;
  /** `remember_copied` for source directories that could not be renamed. */
  private readonly directoriesSeen = new Map<string, string>();

  constructor(private readonly invocation: CommandInvocation<MvOption>) {
    const has = (id: MvOption): boolean => invocation.options.some((option) => option.id === id);
    this.world = invocation.world;
    this.force = has("force");
    this.verbose = has("verbose");
  }

  run(): CommandResult {
    try {
      this.moveOperands();
    } catch (failure) {
      if (failure instanceof Question) {
        return { stop: { key: "terminal-input-not-simulated" }, world: this.world };
      }
      throw failure;
    }
    return { exitStatus: this.failed ? FAILURE : 0, world: this.world };
  }

  /** mv.c's `main` after the options: finds the target directory and moves each source. */
  private moveOperands(): void {
    const { name, options } = this.invocation;
    const tryHelp = `Try '${name} --help' for more information.\n`;
    let operands = [...this.invocation.operands];
    const target = options.find((option) => option.id === "target-directory")?.argument;
    const noTarget = options.some((option) => option.id === "no-target-directory");
    const strip = options.some((option) => option.id === "strip-trailing-slashes");
    const first = operands[0];
    if (first === undefined || (target === undefined && operands.length === 1)) {
      const message =
        first === undefined
          ? "missing file operand"
          : `missing destination file operand after ${q(first)}`;
      this.exitWith(`${message}\n${tryHelp}`);
      return;
    }
    let targetDirectory = target;
    let attempt: RenameAttempt;
    if (noTarget) {
      if (target !== undefined) {
        this.exitWith("cannot combine --target-directory (-t) and --no-target-directory (-T)\n");
        return;
      }
      const extra = operands[2];
      if (extra !== undefined) {
        this.exitWith(`extra operand ${q(extra)}\n${tryHelp}`);
        return;
      }
    } else if (target !== undefined) {
      const error = this.targetDirectoryError(target);
      if (error !== undefined) {
        this.exitWith(`target directory ${q(target)}: ${ERROR_MESSAGES[error]}\n`);
        return;
      }
    } else {
      const last = operands.at(-1) ?? "";
      if (operands.length === 2) {
        attempt = this.rename(first, last, true);
      }
      if (attempt !== "ok") {
        const error = this.targetDirectoryError(last);
        if (error === undefined) {
          attempt = undefined;
          targetDirectory = last;
          operands = operands.slice(0, -1);
        } else if (operands.length > 2) {
          this.exitWith(`target ${q(last)}: ${ERROR_MESSAGES[error]}\n`);
          return;
        }
      }
    }
    if (strip) {
      operands = operands.map((operand) => stripTrailingSlashes(operand));
    }
    if (targetDirectory === undefined) {
      this.moveOne(operands[0] ?? "", operands[1] ?? "", true, attempt);
      return;
    }
    if (operands.length >= 2) {
      this.destinationsSeen = new Set();
    }
    for (const [index, source] of operands.entries()) {
      const base = lastComponent(source);
      const destination = fileNameConcat(
        targetDirectory,
        base === "" ? "" : stripTrailingSlashes(base),
      );
      this.moveOne(source, destination, index === operands.length - 1, undefined);
    }
  }

  /** Writes `mv: MESSAGE` for an error that ends mv at once. */
  private exitWith(message: string): void {
    this.invocation.stderr(`${this.invocation.name}: ${message}`);
    this.failed = true;
  }

  /** gnulib's `target_directory_operand`, as for `cp`. */
  private targetDirectoryError(name: string): LookupError | undefined {
    if (name === "") {
      return "ENOENT";
    }
    const found = this.stat(name);
    if (!found.ok) {
      return found.error;
    }
    return found.node.kind === "directory" ? undefined : "ENOTDIR";
  }

  /** rename(2) of `from` to `to`; applies it to the world when it works. */
  private rename(from: string, to: string, noReplace: boolean): RenameAttempt {
    const result = renameEntry(
      this.world,
      this.invocation.session,
      from,
      to,
      noReplace,
      this.invocation.clock,
    );
    if (!result.ok) {
      return result.error;
    }
    this.world = result.world;
    return "ok";
  }

  /** `copy_internal` in move mode for one operand. */
  private moveOne(
    source: string,
    destination: string,
    lastFile: boolean,
    earlier: RenameAttempt,
  ): void {
    let attempt = earlier ?? this.rename(source, destination, true);
    const renamed = attempt === "ok";
    let sourceNode: FsNode | undefined;
    if (renamed ? !lastFile : true) {
      const name = renamed ? destination : source;
      const found = this.stat(name);
      if (!found.ok) {
        this.fail(`cannot stat ${q(name)}`, found.error);
        return;
      }
      sourceNode = found.node;
    }
    if (!renamed && sourceNode !== undefined) {
      const found = this.stat(destination);
      if (found.ok) {
        attempt = "EEXIST";
        if (!this.mayReplace(source, destination, sourceNode, found)) {
          return;
        }
      } else if (found.error !== "ENOENT") {
        this.fail(`cannot stat ${q(destination)}`, found.error);
        return;
      }
      if (sourceNode.kind === "directory" && this.repeated(source, destination)) {
        return;
      }
    }
    if (attempt === "EEXIST") {
      attempt = this.rename(source, destination, false);
    }
    if (attempt === "ok") {
      if (this.verbose) {
        this.invocation.stdout(`renamed ${q(source)} -> ${q(destination)}\n`);
      }
      const entry = this.entryPath(destination);
      if (!lastFile && entry !== undefined) {
        this.destinationsSeen?.add(entry);
      }
      return;
    }
    if (attempt === "EINVAL") {
      this.fail(`cannot move ${q(source)} to a subdirectory of itself, ${q(destination)}`);
    } else if (attempt !== undefined && DESTINATION_ERRORS.has(attempt)) {
      this.fail(`cannot overwrite ${q(destination)}`, attempt);
    } else if (attempt !== undefined) {
      this.fail(`cannot move ${q(source)} to ${q(destination)}`, attempt);
    }
  }

  /**
   * The checks of an existing destination: the same file, the question on the terminal
   * (`abandon_move`), a directory over a file and the reverse, and a file mv just moved there.
   * Returns false after writing why mv does not replace it.
   */
  private mayReplace(
    source: string,
    destination: string,
    sourceNode: FsNode,
    found: Extract<LookupResult, { ok: true }>,
  ): boolean {
    const destinationNode = found.node;
    if (this.entryPath(source) === this.entryPath(destination)) {
      this.fail(`${q(source)} and ${q(destination)} are the same file`);
      return false;
    }
    const { session, stdin } = this.invocation;
    if (
      !this.force &&
      stdin.kind === "terminal" &&
      !hasPermission(destinationNode, session.credentials, "write")
    ) {
      const mode = destinationNode.mode & 0o7777;
      const permissions = modeString(destinationNode.kind, destinationNode.mode).slice(1);
      this.invocation.stderr(
        `${this.invocation.name}: replace ${q(destination)}, overriding mode ` +
          `${mode.toString(8).padStart(4, "0")} (${permissions})? `,
      );
      throw new Question();
    }
    const sourceIsDirectory = sourceNode.kind === "directory";
    if (sourceIsDirectory !== (destinationNode.kind === "directory")) {
      this.fail(
        sourceIsDirectory
          ? `cannot overwrite non-directory ${q(destination)} with directory ${q(source)}`
          : `cannot overwrite directory ${q(destination)} with non-directory ${q(source)}`,
      );
      return false;
    }
    const entry = this.entryPath(destination);
    if (
      destinationNode.kind === "file" &&
      entry !== undefined &&
      this.destinationsSeen?.has(entry) === true
    ) {
      this.fail(`will not overwrite just-created ${q(destination)} with ${q(source)}`);
      return false;
    }
    return true;
  }

  /**
   * `remember_copied` for a source directory that could not be renamed: the same directory
   * named again gives a warning and counts as done. Returns true if mv stops here.
   */
  private repeated(source: string, destination: string): boolean {
    const sourcePath = this.entryPath(source);
    const destinationPath = this.entryPath(destination);
    if (sourcePath === undefined || destinationPath === undefined) {
      return false;
    }
    const earlier = this.directoriesSeen.get(sourcePath);
    if (earlier === undefined) {
      this.directoriesSeen.set(sourcePath, destinationPath);
      return false;
    }
    if (earlier !== destinationPath) {
      return false;
    }
    this.invocation.stderr(
      `${this.invocation.name}: warning: source directory ${q(source)} specified more than once\n`,
    );
    return true;
  }

  /** lstat(2) of `path` as the session's user. */
  private stat(path: string): LookupResult {
    const { session } = this.invocation;
    const host = findHost(this.world, session.host);
    if (host === undefined) {
      throw new Error(`the session's host "${session.host}" is not part of the world`);
    }
    return lookup(host.root, session.credentials, session.cwd, path);
  }

  /** The canonical path of the directory entry `path` names, as in `cp`. */
  private entryPath(path: string): string | undefined {
    const trimmed = path.replace(/\/+$/u, "");
    const slash = trimmed.lastIndexOf("/");
    const name = trimmed.slice(slash + 1);
    if (name === "" || name === "." || name === "..") {
      const found = this.stat(path);
      return found.ok ? found.path : undefined;
    }
    const directory = slash < 0 ? "." : trimmed.slice(0, slash) || "/";
    const found = this.stat(directory);
    if (!found.ok) {
      return undefined;
    }
    return found.path === "/" ? `/${name}` : `${found.path}/${name}`;
  }

  /** Writes `mv: MESSAGE` with the error's text. */
  private fail(message: string, error?: RenameError): void {
    const reason = error === undefined ? "" : `: ${ERROR_MESSAGES[error]}`;
    this.invocation.stderr(`${this.invocation.name}: ${message}${reason}\n`);
    this.failed = true;
  }
}

function q(name: string): string {
  return shellQuoteAlways(name);
}
