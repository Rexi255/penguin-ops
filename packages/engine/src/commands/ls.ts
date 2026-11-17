// The coreutils command `ls` 9.7 (ADR 0054, ADR 0055), following `src/ls.c`. `ls` looks up every
// operand first and reports those it cannot access, then lists the other files and then the
// contents of the directories, each sorted by name. On a terminal it writes the names in
// columns as wide as the terminal, quoted where a shell would need quotes; into a pipe or a
// file it writes one name per line, as they are. `-l` writes one line per file in the long
// format instead (see `long-listing.ts`). The game runs `ls` without Debian's
// `alias ls='ls --color=auto'`, so there are no colours.

import { compareNames } from "../collation";
import { type CommandInvocation, defineCommand } from "../command-registry";
import { displayWidth } from "../display-width";
import { type FileStatus, fileStatus } from "../file-status";
import type { FsNode } from "../fs-node";
import { type DirectoryEntry, openDirectory } from "../fs-read";
import type { CommandResult } from "../interpreter";
import { lookup } from "../lookup";
import type { ParsedOption } from "../options";
import { shellQuote, shellQuoteAlways } from "../quote";
import type { Session } from "../session";
import { findHost, type Host } from "../world";
import { type DirectoryView, directoryView, LOOKUP_ERROR_MESSAGES } from "./directory-names";
import { formatLongListing, type LongEntry, type LongStyle, totalLine } from "./long-listing";

/** The exit status of `ls` after a serious problem, such as an operand it cannot access. */
const FAILURE = 2;

/** The exit status of `ls` after a minor problem, such as a listed file it cannot stat(2). */
const MINOR_PROBLEM = 1;

/** The narrowest column `ls` lays out, separator included. */
const MIN_COLUMN_WIDTH = 3;

/** The space between two columns. */
const COLUMN_SEPARATOR_WIDTH = 2;

/** The tab stops `ls` assumes between columns when `TABSIZE` is not set. */
const TAB_SIZE = 8;

export const ls = defineCommand({
  name: "ls",
  // The `long_options` of coreutils 9.7, then the short options without a long name.
  options: [
    { id: "all", short: "a", long: "all", argument: "none" },
    { id: "escape", short: "b", long: "escape", argument: "none" },
    { id: "directory", short: "d", long: "directory", argument: "none" },
    { id: "dired", short: "D", long: "dired", argument: "none" },
    { id: "full-time", long: "full-time", argument: "none" },
    { id: "group-directories-first", long: "group-directories-first", argument: "none" },
    { id: "human-readable", short: "h", long: "human-readable", argument: "none" },
    { id: "inode", short: "i", long: "inode", argument: "none" },
    { id: "kibibytes", short: "k", long: "kibibytes", argument: "none" },
    { id: "numeric-uid-gid", short: "n", long: "numeric-uid-gid", argument: "none" },
    { id: "no-group", short: "G", long: "no-group", argument: "none" },
    { id: "hide-control-chars", short: "q", long: "hide-control-chars", argument: "none" },
    { id: "reverse", short: "r", long: "reverse", argument: "none" },
    { id: "size", short: "s", long: "size", argument: "none" },
    { id: "width", short: "w", long: "width", argument: "required" },
    { id: "almost-all", short: "A", long: "almost-all", argument: "none" },
    { id: "ignore-backups", short: "B", long: "ignore-backups", argument: "none" },
    // `-F` takes no argument, `--classify` an optional one.
    { id: "classify", short: "F", argument: "none" },
    { id: "classify", long: "classify", argument: "optional" },
    { id: "file-type", long: "file-type", argument: "none" },
    { id: "si", long: "si", argument: "none" },
    {
      id: "dereference-command-line",
      short: "H",
      long: "dereference-command-line",
      argument: "none",
    },
    {
      id: "dereference-command-line-symlink-to-dir",
      long: "dereference-command-line-symlink-to-dir",
      argument: "none",
    },
    { id: "hide", long: "hide", argument: "required" },
    { id: "ignore", short: "I", long: "ignore", argument: "required" },
    { id: "indicator-style", long: "indicator-style", argument: "required" },
    { id: "dereference", short: "L", long: "dereference", argument: "none" },
    { id: "literal", short: "N", long: "literal", argument: "none" },
    { id: "quote-name", short: "Q", long: "quote-name", argument: "none" },
    { id: "quoting-style", long: "quoting-style", argument: "required" },
    { id: "recursive", short: "R", long: "recursive", argument: "none" },
    { id: "format", long: "format", argument: "required" },
    { id: "show-control-chars", long: "show-control-chars", argument: "none" },
    { id: "sort", long: "sort", argument: "required" },
    { id: "tabsize", short: "T", long: "tabsize", argument: "required" },
    { id: "time", long: "time", argument: "required" },
    { id: "time-style", long: "time-style", argument: "required" },
    { id: "zero", long: "zero", argument: "none" },
    { id: "color", long: "color", argument: "optional" },
    { id: "hyperlink", long: "hyperlink", argument: "optional" },
    { id: "block-size", long: "block-size", argument: "required" },
    { id: "context", short: "Z", long: "context", argument: "none" },
    { id: "author", long: "author", argument: "none" },
    { id: "help", long: "help", argument: "none" },
    { id: "version", long: "version", argument: "none" },
    { id: "ctime", short: "c", argument: "none" },
    { id: "unsorted-all", short: "f", argument: "none" },
    { id: "long-without-owner", short: "g", argument: "none" },
    { id: "long", short: "l", argument: "none" },
    { id: "commas", short: "m", argument: "none" },
    { id: "long-without-group", short: "o", argument: "none" },
    { id: "slash-indicator", short: "p", argument: "none" },
    { id: "sort-by-time", short: "t", argument: "none" },
    { id: "atime", short: "u", argument: "none" },
    { id: "version-sort", short: "v", argument: "none" },
    { id: "across", short: "x", argument: "none" },
    { id: "columns", short: "C", argument: "none" },
    { id: "sort-by-size", short: "S", argument: "none" },
    { id: "unsorted", short: "U", argument: "none" },
    { id: "sort-by-extension", short: "X", argument: "none" },
    { id: "one-per-line", short: "1", argument: "none" },
  ],
  simulated: [
    "all",
    "one-per-line",
    "long",
    "long-without-owner",
    "long-without-group",
    "no-group",
    "numeric-uid-gid",
  ],
  usageErrorStatus: FAILURE,
  run: (invocation) => {
    const long = longStyle(invocation.options);
    const oneColumn =
      long !== undefined || invocation.options.some((option) => option.id === "one-per-line");
    const columns = oneColumn ? undefined : invocation.terminal?.columns;
    const variable = variableNotSimulated(
      invocation.session,
      columns !== undefined,
      long !== undefined,
    );
    if (variable !== undefined) {
      return { stop: { key: "variable-not-simulated", variable } };
    }
    return new Listing(invocation, columns, long).run();
  },
});

/**
 * The style of the long format, or `undefined` if `ls` does not write it. `-l`, `-g`, `-o` and
 * `-n` each select the long format, which `-1` cannot undo; `-g` drops the owner, `-o` and `-G`
 * drop the group, `-n` shows IDs instead of names.
 */
function longStyle(options: readonly ParsedOption[]): LongStyle | undefined {
  const given = new Set(options.map((option) => option.id));
  const long =
    given.has("long") ||
    given.has("long-without-owner") ||
    given.has("long-without-group") ||
    given.has("numeric-uid-gid");
  if (!long) {
    return undefined;
  }
  return {
    owner: !given.has("long-without-owner"),
    group: !given.has("long-without-group") && !given.has("no-group"),
    numericIds: given.has("numeric-uid-gid"),
  };
}

/**
 * Variables that change the long format and that the game does not simulate: `TIME_STYLE` and
 * `TZ` change the times, `LS_BLOCK_SIZE`, `BLOCK_SIZE` and `BLOCKSIZE` the units of the sizes.
 */
const LONG_FORMAT_VARIABLES = ["TIME_STYLE", "TZ", "LS_BLOCK_SIZE", "BLOCK_SIZE", "BLOCKSIZE"];

/**
 * The first environment variable that would change what `ls` writes and that the game does not
 * simulate: `TABSIZE` changes the tab stops between columns, `QUOTING_STYLE` the quoting of
 * names, and in the long format also `LONG_FORMAT_VARIABLES`. The game has no exported
 * variables yet, so a shell variable counts too.
 */
function variableNotSimulated(
  session: Session,
  inColumns: boolean,
  long: boolean,
): string | undefined {
  const variables = [
    ...(inColumns ? ["TABSIZE"] : []),
    "QUOTING_STYLE",
    ...(long ? LONG_FORMAT_VARIABLES : []),
  ];
  return variables.find((variable) => session.variables.has(variable));
}

/** A name as `ls` writes it, and how many cells it takes on the terminal. */
interface ShownName {
  readonly text: string;
  readonly width: number;
}

/** An operand that `ls` could access. */
interface Operand {
  readonly name: string;
  readonly node: FsNode;
}

/** A file of a listing: its name, its kind, and its status if `ls` needs and could get it. */
interface ListedFile {
  readonly name: string;
  readonly kind: FsNode["kind"];
  readonly status: FileStatus | undefined;
}

/** One run of `ls`, with the state that `ls.c` keeps in global variables. */
class Listing {
  private exitStatus = 0;
  /** Whether no directory name has been written yet (the static `first` of `print_dir`). */
  private firstHeader = true;
  private readonly all: boolean;
  /** Whether names go to a terminal, where `ls` quotes them like a shell needs them. */
  private readonly quoted: boolean;
  private readonly view: DirectoryView;

  /**
   * @param columns The width of the terminal if `ls` writes in columns; `undefined` if it
   *   writes one name per line (`-1`, `-l`, or not on a terminal).
   * @param long The style of the long format, or `undefined` without `-l`.
   */
  constructor(
    private readonly invocation: CommandInvocation,
    private readonly columns: number | undefined,
    private readonly long: LongStyle | undefined,
  ) {
    this.all = invocation.options.some((option) => option.id === "all");
    this.quoted = invocation.terminal !== undefined;
    this.view = directoryView(invocation.world, invocation.session);
  }

  run(): CommandResult {
    const { operands } = this.invocation;
    if (operands.length === 0) {
      this.listDirectory(".", false);
      return { exitStatus: this.exitStatus };
    }
    const { root, credentials, cwd } = this.view;
    const found: Operand[] = [];
    // `ls` checks whether a name needs quotes before it looks the name up, so operands it
    // cannot access still move the others aside.
    let someQuoted = false;
    for (const operand of operands) {
      someQuoted ||= this.quoteName(operand) !== operand;
      const result = lookup(root, credentials, cwd, operand);
      if (result.ok) {
        found.push({ name: operand, node: result.node });
      } else {
        const reason = LOOKUP_ERROR_MESSAGES[result.error];
        this.fail(`cannot access ${shellQuoteAlways(operand)}: ${reason}`);
      }
    }
    found.sort((a, b) => compareNames(a.name, b.name));
    const gathered = found.map((operand): ListedFile => ({
      name: operand.name,
      kind: operand.node.kind,
      status: fileStatus(operand.node),
    }));
    const files = gathered.filter((file) => file.kind !== "directory");
    const directories = found.filter((operand) => operand.node.kind === "directory");
    let withHeader = true;
    if (files.length > 0) {
      // The columns of the long format are measured over all operands, also the directories:
      // `ls.c` measures every file it gathers before it takes the directories out.
      this.writeFiles(files, gathered, someQuoted);
      if (directories.length > 0) {
        this.invocation.stdout("\n");
      }
    } else if (operands.length === 1) {
      withHeader = false;
    }
    for (const directory of directories) {
      this.listDirectory(directory.name, withHeader);
    }
    return { exitStatus: this.exitStatus };
  }

  /** Writes the entries of the directory `name`, after its name and a colon if `withHeader`. */
  private listDirectory(name: string, withHeader: boolean): void {
    const { world, session, stdout } = this.invocation;
    const opened = openDirectory(world, session, name);
    let entries: readonly DirectoryEntry[] = [];
    if (opened.ok) {
      entries = opened.entries;
    } else if (opened.error !== "ENOENT") {
      const reason = LOOKUP_ERROR_MESSAGES[opened.error];
      this.fail(`cannot open directory ${shellQuoteAlways(name)}: ${reason}`);
      return;
    }
    // Else it is `.` in a working directory that was removed: Linux still opens the directory,
    // and it has no entries any more.
    if (withHeader) {
      stdout(`${this.firstHeader ? "" : "\n"}${this.quoteDirectoryName(name)}:\n`);
      this.firstHeader = false;
    }
    // In the long format, `ls` stats each entry while it reads the directory, so its messages
    // come in the order of readdir(3), before the sorted listing.
    const files = entries
      .filter((entry) => this.all || !entry.name.startsWith("."))
      .map((entry) => this.gatherEntry(name, entry));
    files.sort((a, b) => compareNames(a.name, b.name));
    if (this.long !== undefined) {
      stdout(totalLine(files.map((file) => file.status)));
    }
    if (files.length > 0) {
      this.writeFiles(
        files,
        files,
        files.some((file) => this.quoteName(file.name) !== file.name),
      );
    }
  }

  /**
   * The entry `entry` of the directory `directory`. In the long format, `ls` stats it through
   * the path of the directory; if that fails, it reports the file, sets the exit status to 1
   * and still lists the file, with `?` for what it does not know.
   */
  private gatherEntry(directory: string, entry: DirectoryEntry): ListedFile {
    const unknown: ListedFile = { name: entry.name, kind: entry.kind, status: undefined };
    if (this.long === undefined) {
      return unknown;
    }
    const path = attach(directory, entry.name);
    const { root, credentials, cwd } = this.view;
    const found = lookup(root, credentials, cwd, path);
    if (!found.ok) {
      const reason = LOOKUP_ERROR_MESSAGES[found.error];
      this.minorProblem(`cannot access ${shellQuoteAlways(path)}: ${reason}`);
      return unknown;
    }
    return { ...unknown, status: fileStatus(found.node) };
  }

  /**
   * Writes `files` in the long format, in columns or one per line. In the long format and in
   * columns, if any of `files` (or of the other operands) is quoted, the others get a space in
   * front, so that the names line up inside the quotes (`align_variable_outer_quotes`).
   * `measured` are the files whose statuses set the widths of the columns of the long format.
   */
  private writeFiles(
    files: readonly ListedFile[],
    measured: readonly ListedFile[],
    someQuoted: boolean,
  ): void {
    const { long, columns, invocation } = this;
    if (long !== undefined) {
      const entries = files.map((file): LongEntry => ({
        text: this.alignedName(file.name, someQuoted),
        kind: file.kind,
        status: file.status,
      }));
      const statuses = measured.map((file) => file.status);
      const context = { host: this.host(), style: long, now: invocation.clock.now() };
      invocation.stdout(formatLongListing(entries, statuses, context));
      return;
    }
    if (columns === undefined) {
      invocation.stdout(files.map((file) => `${this.quoteName(file.name)}\n`).join(""));
      return;
    }
    const shown = files.map((file): ShownName => {
      const text = this.alignedName(file.name, someQuoted);
      return { text, width: displayWidth(text) };
    });
    invocation.stdout(layOutInColumns(shown, columns));
  }

  /** The quoted name, with a space in front if it needs no quotes but `someQuoted` others do. */
  private alignedName(name: string, someQuoted: boolean): string {
    const quoted = this.quoteName(name);
    return someQuoted && quoted === name ? ` ${quoted}` : quoted;
  }

  /** The host of the session, whose users and groups name the owners of files. */
  private host(): Host {
    const { world, session } = this.invocation;
    const host = findHost(world, session.host);
    if (host === undefined) {
      throw new Error(`the session's host "${session.host}" is not part of the world`);
    }
    return host;
  }

  /** A file name as `ls` writes it: shell-quoted on a terminal, else as it is. */
  private quoteName(name: string): string {
    return this.quoted ? shellQuote(name) : name;
  }

  /** The name of a listed directory: like a file name, but a `:` needs quotes too. */
  private quoteDirectoryName(name: string): string {
    return this.quoted ? shellQuote(name, ":") : name;
  }

  /** Writes `ls: MESSAGE` to standard error; the exit status becomes 2. */
  private fail(message: string): void {
    this.invocation.stderr(`${this.invocation.name}: ${message}\n`);
    this.exitStatus = FAILURE;
  }

  /** Writes `ls: MESSAGE` to standard error; the exit status becomes 1 unless it is already 2. */
  private minorProblem(message: string): void {
    this.invocation.stderr(`${this.invocation.name}: ${message}\n`);
    this.exitStatus = Math.max(this.exitStatus, MINOR_PROBLEM);
  }
}

/**
 * The path of the entry `name` of the directory `directory`, like `attach` in `ls.c`: the name
 * alone in `.`, else the directory, a slash unless it ends with one, and the name.
 */
function attach(directory: string, name: string): string {
  if (directory === ".") {
    return name;
  }
  return directory.endsWith("/") ? directory + name : `${directory}/${name}`;
}

/**
 * The names in columns, filled from top to bottom, like `print_many_per_line`: the most
 * columns whose lines stay shorter than `lineLength` (`calculate_columns`). Each column is as
 * wide as its widest name plus two cells, except the last; the gaps are filled with tabs and
 * spaces up to the next column (`indent`).
 */
function layOutInColumns(names: readonly ShownName[], lineLength: number): string {
  const widths = columnWidths(names, lineLength);
  const rows = Math.ceil(names.length / widths.length);
  let text = "";
  for (let row = 0; row < rows; row++) {
    let position = 0;
    for (let index = row, column = 0; index < names.length; index += rows, column++) {
      const name = names[index] ?? { text: "", width: 0 };
      text += name.text;
      if (index + rows >= names.length) {
        break;
      }
      const columnWidth = widths[column] ?? 0;
      text += indent(position + name.width, position + columnWidth);
      position += columnWidth;
    }
    text += "\n";
  }
  return text;
}

/**
 * The widths of the columns for `names`, like `calculate_columns` with `by_columns`: for every
 * possible number of columns it adds up the widths while the line stays shorter than
 * `lineLength`, and takes the most columns that fit (at least one).
 */
function columnWidths(names: readonly ShownName[], lineLength: number): readonly number[] {
  const maxIndex =
    Math.floor(lineLength / MIN_COLUMN_WIDTH) + (lineLength % MIN_COLUMN_WIDTH === 0 ? 0 : 1);
  const maxColumns = maxIndex < names.length ? maxIndex : names.length;
  const layouts = Array.from({ length: maxColumns }, (_, i) => ({
    valid: true,
    lineLength: (i + 1) * MIN_COLUMN_WIDTH,
    widths: Array.from({ length: i + 1 }, () => MIN_COLUMN_WIDTH),
  }));
  names.forEach((name, index) => {
    layouts.forEach((layout, i) => {
      if (!layout.valid) {
        return;
      }
      const rows = Math.floor((names.length + i) / (i + 1));
      const column = Math.floor(index / rows);
      const width = name.width + (column === i ? 0 : COLUMN_SEPARATOR_WIDTH);
      const current = layout.widths[column] ?? 0;
      if (current < width) {
        layout.lineLength += width - current;
        layout.widths[column] = width;
        layout.valid = layout.lineLength < lineLength;
      }
    });
  });
  let columns = maxColumns;
  while (columns > 1 && layouts[columns - 1]?.valid !== true) {
    columns--;
  }
  return layouts[columns - 1]?.widths ?? [];
}

/** The tabs and spaces from the cell `from` to the cell `to`: a tab wherever it saves a space. */
function indent(from: number, to: number): string {
  let text = "";
  let position = from;
  while (position < to) {
    if (Math.floor(to / TAB_SIZE) > Math.floor((position + 1) / TAB_SIZE)) {
      text += "\t";
      position += TAB_SIZE - (position % TAB_SIZE);
    } else {
      text += " ";
      position++;
    }
  }
  return text;
}
