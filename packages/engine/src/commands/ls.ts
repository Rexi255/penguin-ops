// The coreutils command `ls` 9.7 (ADR 0054), following `src/ls.c` without the long format
// (ROADMAP M1.8b-2). `ls` looks up every operand first and reports those it cannot access, then
// lists the other files and then the contents of the directories, each sorted by name. On a
// terminal it writes the names in columns as wide as the terminal, quoted where a shell would
// need quotes; into a pipe or a file it writes one name per line, as they are. The game runs
// `ls` without Debian's `alias ls='ls --color=auto'`, so there are no colours.

import { compareNames } from "../collation";
import { type CommandInvocation, defineCommand } from "../command-registry";
import { displayWidth } from "../display-width";
import { openDirectory } from "../fs-read";
import type { CommandResult } from "../interpreter";
import { lookup } from "../lookup";
import { shellQuote, shellQuoteAlways } from "../quote";
import type { Session } from "../session";
import { directoryView, LOOKUP_ERROR_MESSAGES } from "./directory-names";

/** The exit status of `ls` after a serious problem, such as an operand it cannot access. */
const FAILURE = 2;

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
  simulated: ["all", "one-per-line"],
  usageErrorStatus: FAILURE,
  run: (invocation) => {
    const oneColumn = invocation.options.some((option) => option.id === "one-per-line");
    const columns = oneColumn ? undefined : invocation.terminal?.columns;
    const variable = variableNotSimulated(invocation.session, columns !== undefined);
    if (variable !== undefined) {
      return { stop: { key: "variable-not-simulated", variable } };
    }
    return new Listing(invocation, columns).run();
  },
});

/**
 * The first environment variable that would change what `ls` writes and that the game does not
 * simulate: `TABSIZE` changes the tab stops between columns, `QUOTING_STYLE` the quoting of
 * names. The game has no exported variables yet, so a shell variable counts too.
 */
function variableNotSimulated(session: Session, inColumns: boolean): string | undefined {
  if (inColumns && session.variables.has("TABSIZE")) {
    return "TABSIZE";
  }
  return session.variables.has("QUOTING_STYLE") ? "QUOTING_STYLE" : undefined;
}

/** A name as `ls` writes it, and how many cells it takes on the terminal. */
interface ShownName {
  readonly text: string;
  readonly width: number;
}

/** An operand that `ls` could access. */
interface Operand {
  readonly name: string;
  readonly isDirectory: boolean;
}

/** One run of `ls`, with the state that `ls.c` keeps in global variables. */
class Listing {
  private exitStatus = 0;
  /** Whether no directory name has been written yet (the static `first` of `print_dir`). */
  private firstHeader = true;
  private readonly all: boolean;
  /** Whether names go to a terminal, where `ls` quotes them like a shell needs them. */
  private readonly quoted: boolean;

  /**
   * @param columns The width of the terminal if `ls` writes in columns; `undefined` if it
   *   writes one name per line (`-1`, or not on a terminal).
   */
  constructor(
    private readonly invocation: CommandInvocation,
    private readonly columns: number | undefined,
  ) {
    this.all = invocation.options.some((option) => option.id === "all");
    this.quoted = invocation.terminal !== undefined;
  }

  run(): CommandResult {
    const { operands } = this.invocation;
    if (operands.length === 0) {
      this.listDirectory(".", false);
      return { exitStatus: this.exitStatus };
    }
    const view = directoryView(this.invocation.world, this.invocation.session);
    const found: Operand[] = [];
    // `ls` checks whether a name needs quotes before it looks the name up, so operands it
    // cannot access still move the others aside.
    let someQuoted = false;
    for (const operand of operands) {
      someQuoted ||= this.quoteName(operand) !== operand;
      const result = lookup(view.root, view.credentials, view.cwd, operand);
      if (result.ok) {
        found.push({ name: operand, isDirectory: result.node.kind === "directory" });
      } else {
        const reason = LOOKUP_ERROR_MESSAGES[result.error];
        this.fail(`cannot access ${shellQuoteAlways(operand)}: ${reason}`);
      }
    }
    found.sort((a, b) => compareNames(a.name, b.name));
    const files = found.filter((operand) => !operand.isDirectory).map((operand) => operand.name);
    const directories = found.filter((operand) => operand.isDirectory);
    let withHeader = true;
    if (files.length > 0) {
      this.writeNames(files, someQuoted);
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
    if (!opened.ok) {
      // Only `.` in a working directory that was removed is not found: Linux still opens the
      // directory, and it has no entries any more.
      if (opened.error !== "ENOENT") {
        const reason = LOOKUP_ERROR_MESSAGES[opened.error];
        this.fail(`cannot open directory ${shellQuoteAlways(name)}: ${reason}`);
      }
      return;
    }
    if (withHeader) {
      stdout(`${this.firstHeader ? "" : "\n"}${this.quoteDirectoryName(name)}:\n`);
      this.firstHeader = false;
    }
    const names = opened.names.filter((entry) => this.all || !entry.startsWith("."));
    if (names.length === 0) {
      return;
    }
    names.sort(compareNames);
    this.writeNames(
      names,
      names.some((entry) => this.quoteName(entry) !== entry),
    );
  }

  /**
   * Writes `names` in columns or one per line. In columns, if any of `names` (or of the other
   * operands) is quoted, the others get a space in front, so that the names line up inside the
   * quotes (`align_variable_outer_quotes`).
   */
  private writeNames(names: readonly string[], someQuoted: boolean): void {
    const columns = this.columns;
    if (columns === undefined) {
      this.invocation.stdout(names.map((name) => `${this.quoteName(name)}\n`).join(""));
      return;
    }
    const shown = names.map((name): ShownName => {
      const quoted = this.quoteName(name);
      const text = someQuoted && quoted === name ? ` ${quoted}` : quoted;
      return { text, width: displayWidth(text) };
    });
    this.invocation.stdout(layOutInColumns(shown, columns));
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
