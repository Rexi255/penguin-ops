// The coreutils command `cp` 9.7 (ADR 0062), following `src/cp.c` and `copy_internal` in
// `src/copy.c`. `cp SOURCE DEST` copies a file to a new name; when the last operand is a
// directory (or with `-t DIR`), every source is copied into it under its own last component.
// Directories need `-r`; they are created with the source's permissions (made searchable and
// writable for their owner while cp fills them) and copied entry by entry. New files get the
// source's permission bits minus the umask, existing files keep theirs. `-f` removes a
// destination that cannot be opened, `-v` names every copy.

import { type CommandInvocation, defineCommand } from "../command-registry";
import type { FsNode } from "../fs-node";
import { openDirectory, openForReading } from "../fs-read";
import { removeEntry } from "../fs-remove";
import { changeMode, makeDirectory, writeFile } from "../fs-write";
import type { CommandResult } from "../interpreter";
import { lookup, type LookupError, type LookupResult } from "../lookup";
import { shellQuoteAlways } from "../quote";
import { findHost, type World } from "../world";
import { LOOKUP_ERROR_MESSAGES } from "./directory-names";
import { fileNameConcat, nameInDirectory } from "./file-names";

/** The exit status after an error, coreutils' `EXIT_FAILURE`. */
const FAILURE = 1;

/** The bits cp leaves out when it creates a directory: write for group and others. */
const GROUP_OTHER_WRITE = 0o022;

/** The owner's read, write and search bits, which cp needs to fill a directory. */
const OWNER_ALL = 0o700;

type CpOption =
  | "archive"
  | "attributes-only"
  | "backup"
  | "copy-contents"
  | "debug"
  | "dereference"
  | "force"
  | "interactive"
  | "link"
  | "no-clobber"
  | "no-dereference"
  | "no-preserve"
  | "no-target-directory"
  | "one-file-system"
  | "parents"
  | "preserve"
  | "recursive"
  | "remove-destination"
  | "sparse"
  | "reflink"
  | "strip-trailing-slashes"
  | "suffix"
  | "symbolic-link"
  | "target-directory"
  | "update"
  | "verbose"
  | "keep-directory-symlink"
  | "context"
  | "help"
  | "version"
  | "no-dereference-preserve-links"
  | "dereference-command-line"
  | "preserve-defaults";

export const cp = defineCommand<CpOption>({
  name: "cp",
  // The `long_opts` of coreutils 9.7, then the short options without a long name.
  options: [
    { id: "archive", short: "a", long: "archive", argument: "none" },
    { id: "attributes-only", long: "attributes-only", argument: "none" },
    { id: "backup", long: "backup", argument: "optional" },
    { id: "copy-contents", long: "copy-contents", argument: "none" },
    { id: "debug", long: "debug", argument: "none" },
    { id: "dereference", short: "L", long: "dereference", argument: "none" },
    { id: "force", short: "f", long: "force", argument: "none" },
    { id: "interactive", short: "i", long: "interactive", argument: "none" },
    { id: "link", short: "l", long: "link", argument: "none" },
    { id: "no-clobber", short: "n", long: "no-clobber", argument: "none" },
    { id: "no-dereference", short: "P", long: "no-dereference", argument: "none" },
    { id: "no-preserve", long: "no-preserve", argument: "required" },
    { id: "no-target-directory", short: "T", long: "no-target-directory", argument: "none" },
    { id: "one-file-system", short: "x", long: "one-file-system", argument: "none" },
    { id: "parents", long: "parents", argument: "none" },
    { id: "parents", long: "path", argument: "none" },
    { id: "preserve", long: "preserve", argument: "optional" },
    { id: "recursive", short: "R", long: "recursive", argument: "none" },
    { id: "remove-destination", long: "remove-destination", argument: "none" },
    { id: "sparse", long: "sparse", argument: "required" },
    { id: "reflink", long: "reflink", argument: "optional" },
    { id: "strip-trailing-slashes", long: "strip-trailing-slashes", argument: "none" },
    { id: "suffix", short: "S", long: "suffix", argument: "required" },
    { id: "symbolic-link", short: "s", long: "symbolic-link", argument: "none" },
    { id: "target-directory", short: "t", long: "target-directory", argument: "required" },
    { id: "update", long: "update", argument: "optional" },
    { id: "verbose", short: "v", long: "verbose", argument: "none" },
    { id: "keep-directory-symlink", long: "keep-directory-symlink", argument: "none" },
    { id: "context", short: "Z", argument: "none" },
    { id: "context", long: "context", argument: "optional" },
    { id: "help", long: "help", argument: "none" },
    { id: "version", long: "version", argument: "none" },
    { id: "backup", short: "b", argument: "none" },
    { id: "no-dereference-preserve-links", short: "d", argument: "none" },
    { id: "dereference-command-line", short: "H", argument: "none" },
    { id: "preserve-defaults", short: "p", argument: "none" },
    { id: "recursive", short: "r", argument: "none" },
    { id: "update", short: "u", argument: "none" },
  ],
  simulated: ["force", "no-target-directory", "recursive", "target-directory", "verbose"],
  usageErrorStatus: FAILURE,
  checkOption: (option, before) =>
    option.id === "target-directory" && before.some((earlier) => earlier.id === option.id)
      ? { message: "multiple target directories specified", tryHelp: false }
      : undefined,
  run: (invocation) => runCp(invocation),
});

/** The errors cp reports, as `strerror(3)` writes them. */
type CopyError = LookupError | "EISDIR" | "EEXIST" | "EPERM" | "ENOTEMPTY" | "EBUSY" | "EINVAL";

const ERROR_MESSAGES: Readonly<Record<CopyError, string>> = {
  ...LOOKUP_ERROR_MESSAGES,
  EISDIR: "Is a directory",
  EEXIST: "File exists",
  EPERM: "Operation not permitted",
  ENOTEMPTY: "Directory not empty",
  EBUSY: "Device or resource busy",
  EINVAL: "Invalid argument",
};

/** cp.c's `do_copy`: finds the target directory and copies each source. */
function runCp(invocation: CommandInvocation<CpOption>): CommandResult {
  const { name, options, operands } = invocation;
  const tryHelp = `Try '${name} --help' for more information.\n`;
  const target = options.find((option) => option.id === "target-directory")?.argument;
  const noTarget = options.some((option) => option.id === "no-target-directory");
  const first = operands[0];
  if (first === undefined || (target === undefined && operands.length === 1)) {
    const message =
      first === undefined
        ? "missing file operand"
        : `missing destination file operand after ${shellQuoteAlways(first)}`;
    invocation.stderr(`${name}: ${message}\n${tryHelp}`);
    return { exitStatus: FAILURE };
  }
  const copier = new Copier(invocation);
  if (noTarget) {
    if (target !== undefined) {
      invocation.stderr(
        `${name}: cannot combine --target-directory (-t) and --no-target-directory (-T)\n`,
      );
      return { exitStatus: FAILURE };
    }
    const extra = operands[2];
    if (extra !== undefined) {
      invocation.stderr(`${name}: extra operand ${shellQuoteAlways(extra)}\n${tryHelp}`);
      return { exitStatus: FAILURE };
    }
    return copier.copyTo(first, operands[1] ?? "", "unknown");
  }
  if (target !== undefined) {
    const error = copier.targetDirectoryError(target);
    if (error !== undefined) {
      invocation.stderr(
        `${name}: target directory ${shellQuoteAlways(target)}: ${ERROR_MESSAGES[error]}\n`,
      );
      return { exitStatus: FAILURE };
    }
    return copier.copyInto(target, operands);
  }
  const last = operands.at(-1) ?? "";
  const error = copier.targetDirectoryError(last);
  if (error === undefined) {
    return copier.copyInto(last, operands.slice(0, -1));
  }
  if (operands.length > 2) {
    invocation.stderr(`${name}: target ${shellQuoteAlways(last)}: ${ERROR_MESSAGES[error]}\n`);
    return { exitStatus: FAILURE };
  }
  return copier.copyTo(first, last, error === "ENOENT" ? "new" : "unknown");
}

/** What cp knows about a destination before it looks: missing, or not known yet. */
type DestinationHint = "new" | "unknown";

/** A directory that cp copied or created, to find copies of a directory into itself. */
interface Remembered {
  /** The name cp gave the copy, as the player sees it. */
  readonly name: string;
  /** The canonical path of that copy's directory entry. */
  readonly path: string | undefined;
}

/** The result of one `copy_internal`. */
interface Outcome {
  readonly ok: boolean;
  /** Whether cp found that it copies a directory into itself, after which it stops the loop. */
  readonly intoSelf: boolean;
}

const SUCCESS: Outcome = { ok: true, intoSelf: false };
const FAILED: Outcome = { ok: false, intoSelf: false };

/** One run of `cp`. */
class Copier {
  private world: World;
  private readonly recursive: boolean;
  private readonly force: boolean;
  private readonly verbose: boolean;
  private failed = false;
  /**
   * `remember_copied`: the copies of command-line directories by the canonical path of their
   * source, and the first directory cp created for each operand by its own canonical path.
   */
  private readonly copied = new Map<string, Remembered>();
  /** The canonical paths of the sources and destinations of the operands, with two or more. */
  private sourcesSeen: Set<string> | undefined;
  private destinationsSeen: Set<string> | undefined;
  /** The names of the operand being copied, for "into itself" messages. */
  private topSource = "";
  private topDestination = "";

  constructor(private readonly invocation: CommandInvocation<CpOption>) {
    const has = (id: CpOption): boolean => invocation.options.some((option) => option.id === id);
    this.world = invocation.world;
    this.recursive = has("recursive");
    this.force = has("force");
    this.verbose = has("verbose");
  }

  /**
   * gnulib's `target_directory_operand`: undefined if `name` is a directory cp can use as the
   * target, else why not (ENOENT, ENOTDIR or a lookup error on the way).
   */
  targetDirectoryError(name: string): LookupError | undefined {
    if (name === "") {
      return "ENOENT";
    }
    const found = this.stat(name);
    if (!found.ok) {
      return found.error;
    }
    return found.node.kind === "directory" ? undefined : "ENOTDIR";
  }

  /** `cp SOURCE DEST`: copies one source to the name `destination`. */
  copyTo(source: string, destination: string, hint: DestinationHint): CommandResult {
    this.copyOperand(source, destination, hint);
    return this.result();
  }

  /** `cp SOURCE... DIRECTORY`: copies each source into `target` under its last component. */
  copyInto(target: string, sources: readonly string[]): CommandResult {
    if (sources.length >= 2) {
      this.sourcesSeen = new Set();
      this.destinationsSeen = new Set();
    }
    for (const source of sources) {
      this.copyOperand(source, nameInDirectory(target, source), "unknown");
    }
    return this.result();
  }

  private result(): CommandResult {
    return { exitStatus: this.failed ? FAILURE : 0, world: this.world };
  }

  /** cp.c's `copy`: one operand, with its names for the messages. */
  private copyOperand(source: string, destination: string, hint: DestinationHint): void {
    this.topSource = source;
    this.topDestination = destination;
    const outcome = this.copyInternal(source, destination, true, hint, { created: false });
    if (!outcome.ok) {
      this.failed = true;
    }
  }

  /** copy.c's `copy_internal` for files and directories. */
  private copyInternal(
    source: string,
    destination: string,
    commandLine: boolean,
    hint: DestinationHint,
    firstDirectory: { created: boolean },
  ): Outcome {
    const sourceFound = this.stat(source);
    if (!sourceFound.ok) {
      return this.fail(`cannot stat ${q(source)}`, sourceFound.error);
    }
    const sourceNode = sourceFound.node;
    const sourceIsDirectory = sourceNode.kind === "directory";
    if (sourceIsDirectory && !this.recursive) {
      return this.fail(`-r not specified; omitting directory ${q(source)}`);
    }
    if (commandLine && this.sourcesSeen !== undefined) {
      if (!sourceIsDirectory && this.sourcesSeen.has(sourceFound.path)) {
        this.warn(`warning: source file ${q(source)} specified more than once`);
        return SUCCESS;
      }
      this.sourcesSeen.add(sourceFound.path);
    }
    let destinationNode: FsNode | undefined;
    if (hint === "unknown") {
      const found = this.stat(destination);
      if (found.ok) {
        destinationNode = found.node;
        if (found.path === sourceFound.path) {
          return this.fail(`${q(source)} and ${q(destination)} are the same file`);
        }
      } else if (found.error !== "ENOENT") {
        return this.fail(`cannot stat ${q(destination)}`, found.error);
      }
    }
    if (destinationNode !== undefined) {
      if (sourceIsDirectory !== (destinationNode.kind === "directory")) {
        return this.fail(
          sourceIsDirectory
            ? `cannot overwrite non-directory ${q(destination)} with directory ${q(source)}`
            : `cannot overwrite directory ${q(destination)} with non-directory ${q(source)}`,
        );
      }
      const entry = this.entryPath(destination);
      if (
        destinationNode.kind === "file" &&
        commandLine &&
        entry !== undefined &&
        this.destinationsSeen?.has(entry) === true
      ) {
        return this.fail(`will not overwrite just-created ${q(destination)} with ${q(source)}`);
      }
    }
    if (this.verbose && !sourceIsDirectory) {
      this.invocation.stdout(`${q(source)} -> ${q(destination)}\n`);
    }
    let outcome: Outcome;
    if (sourceIsDirectory) {
      const earlier = this.earlierCopy(sourceFound.path, destination, commandLine);
      if (earlier !== undefined) {
        return earlier;
      }
      outcome = this.copyDirectory(
        source,
        destination,
        { path: sourceFound.path, mode: sourceNode.mode },
        destinationNode,
        firstDirectory,
      );
    } else {
      outcome = this.copyFile(source, destination, sourceNode, destinationNode !== undefined);
    }
    // Only files that cp wrote can be overwritten "just-created" later.
    if (commandLine && this.destinationsSeen !== undefined && !sourceIsDirectory && outcome.ok) {
      const entry = this.entryPath(destination);
      if (entry !== undefined) {
        this.destinationsSeen.add(entry);
      }
    }
    return outcome;
  }

  /**
   * The check of `remember_copied` and `src_to_dest_lookup` for a source directory that cp has
   * met before: the directory it is creating (a copy into itself), the same operand twice, or a
   * directory that would need a hard link. `undefined` if the directory is new to cp.
   */
  private earlierCopy(
    sourcePath: string,
    destination: string,
    commandLine: boolean,
  ): Outcome | undefined {
    const earlier = this.copied.get(sourcePath);
    if (commandLine && earlier === undefined) {
      this.copied.set(sourcePath, { name: destination, path: this.entryPath(destination) });
      return undefined;
    }
    if (earlier === undefined) {
      return undefined;
    }
    if (earlier.path !== undefined && earlier.path === sourcePath) {
      this.failed = true;
      this.error(
        `cannot copy a directory, ${q(this.topSource)}, into itself, ${q(this.topDestination)}`,
      );
      return { ok: false, intoSelf: true };
    }
    if (earlier.path !== undefined && earlier.path === this.entryPath(destination)) {
      this.warn(`warning: source directory ${q(this.topSource)} specified more than once`);
      return SUCCESS;
    }
    return this.fail(`will not create hard link ${q(destination)} to directory ${q(earlier.name)}`);
  }

  /** Copies a directory: creates it if needed, copies its entries, then sets its mode. */
  private copyDirectory(
    source: string,
    destination: string,
    sourceStatus: { readonly path: string; readonly mode: number },
    destinationNode: FsNode | undefined,
    firstDirectory: { created: boolean },
  ): Outcome {
    const { session, clock } = this.invocation;
    const { path: sourcePath, mode: sourceMode } = sourceStatus;
    const created = destinationNode === undefined;
    let restoreMode: number | undefined;
    let omitted = 0;
    if (created) {
      omitted = sourceMode & GROUP_OTHER_WRITE;
      const made = makeDirectory(this.world, session, destination, clock, sourceMode & ~omitted);
      if (!made.ok) {
        // `forget_created`: a later operand with this source may try again.
        this.copied.delete(sourcePath);
        return this.fail(`cannot create directory ${q(destination)}`, made.error);
      }
      this.world = made.world;
      const mode = this.modeOf(destination);
      if ((mode & OWNER_ALL) !== OWNER_ALL) {
        const opened = changeMode(this.world, session, destination, mode | OWNER_ALL);
        if (!opened.ok) {
          return this.fail(`setting permissions for ${q(destination)}`, opened.error);
        }
        this.world = opened.world;
        restoreMode = mode;
      }
      if (!firstDirectory.created) {
        this.copied.set(made.path, { name: destination, path: made.path });
        firstDirectory.created = true;
      }
      if (this.verbose) {
        this.invocation.stdout(`${q(source)} -> ${q(destination)}\n`);
      }
    }
    let ok = this.copyEntries(source, destination, created, firstDirectory);
    omitted &= ~session.umask;
    if (omitted !== 0 && restoreMode === undefined) {
      const mode = this.modeOf(destination);
      if ((omitted & ~mode) !== 0) {
        restoreMode = mode;
      }
    }
    if (restoreMode !== undefined) {
      const restored = changeMode(this.world, session, destination, restoreMode | omitted);
      if (restored.ok) {
        this.world = restored.world;
      } else {
        this.error(`preserving permissions for ${q(destination)}`, restored.error);
        ok = { ...ok, ok: false };
      }
    }
    return ok;
  }

  /** copy.c's `copy_dir`: copies every entry, and stops after a copy into itself. */
  private copyEntries(
    source: string,
    destination: string,
    created: boolean,
    firstDirectory: { created: boolean },
  ): Outcome {
    const listed = openDirectory(this.world, this.invocation.session, source);
    if (!listed.ok) {
      return this.fail(`cannot access ${q(source)}`, listed.error);
    }
    let ok = true;
    let anyCreated = false;
    for (const entry of listed.entries) {
      if (entry.name === "." || entry.name === "..") {
        continue;
      }
      const local = { created: firstDirectory.created };
      const outcome = this.copyInternal(
        fileNameConcat(source, entry.name),
        fileNameConcat(destination, entry.name),
        false,
        created ? "new" : "unknown",
        local,
      );
      ok &&= outcome.ok;
      if (outcome.intoSelf) {
        return { ok: false, intoSelf: true };
      }
      anyCreated ||= local.created;
    }
    firstDirectory.created = anyCreated;
    return { ok, intoSelf: false };
  }

  /** copy.c's `copy_reg`: opens the source, then writes its content to the destination. */
  private copyFile(
    source: string,
    destination: string,
    sourceNode: FsNode,
    exists: boolean,
  ): Outcome {
    const { session, clock } = this.invocation;
    const read = openForReading(this.world, session, source);
    if (!read.ok) {
      return this.fail(`cannot open ${q(source)} for reading`, read.error);
    }
    const content = read.opened.kind === "file" ? read.opened.content : "";
    let isNew = !exists;
    if (exists) {
      const opened = writeFile(
        this.world,
        session,
        { path: destination, text: content, mode: "truncate" },
        clock,
      );
      if (opened.ok) {
        this.world = opened.world;
        return SUCCESS;
      }
      if (!this.force || opened.error === "ENOENT") {
        return this.fail(`cannot create regular file ${q(destination)}`, opened.error);
      }
      const removed = removeEntry(this.world, session, destination, "file", clock);
      if (removed.ok) {
        this.world = removed.world;
        if (this.verbose) {
          this.invocation.stdout(`removed ${q(destination)}\n`);
        }
      } else if (removed.error !== "ENOENT") {
        return this.fail(`cannot remove ${q(destination)}`, removed.error);
      }
      isNew = true;
    }
    if (isNew) {
      const created = writeFile(
        this.world,
        session,
        { path: destination, text: content, mode: "truncate", createMode: sourceNode.mode & 0o777 },
        clock,
      );
      if (!created.ok) {
        // A missing name that ends in a slash cannot be a regular file.
        const error =
          created.error === "EISDIR" && destination.endsWith("/") ? "ENOTDIR" : created.error;
        return this.fail(`cannot create regular file ${q(destination)}`, error);
      }
      this.world = created.world;
    }
    return SUCCESS;
  }

  /** stat(2) of `path` as the session's user. */
  private stat(path: string): LookupResult {
    const { session } = this.invocation;
    const host = findHost(this.world, session.host);
    if (host === undefined) {
      throw new Error(`the session's host "${session.host}" is not part of the world`);
    }
    return lookup(host.root, session.credentials, session.cwd, path);
  }

  /** The mode of the node at `path`, which exists. */
  private modeOf(path: string): number {
    const found = this.stat(path);
    if (!found.ok) {
      throw new Error(`the node at "${path}" that cp just created is gone`);
    }
    return found.node.mode;
  }

  /**
   * The canonical path of the directory entry `path` names, without following its last
   * component: the canonical path of its directory and its own name. `undefined` if the
   * directory cannot be found. Two names for the same entry give the same path.
   */
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

  /** Writes `cp: MESSAGE` (with the error's text) and returns a failed outcome. */
  private fail(message: string, error?: CopyError): Outcome {
    this.error(message, error);
    return FAILED;
  }

  private error(message: string, error?: CopyError): void {
    const reason = error === undefined ? "" : `: ${ERROR_MESSAGES[error]}`;
    this.invocation.stderr(`${this.invocation.name}: ${message}${reason}\n`);
  }

  private warn(message: string): void {
    this.invocation.stderr(`${this.invocation.name}: ${message}\n`);
  }
}

function q(name: string): string {
  return shellQuoteAlways(name);
}
