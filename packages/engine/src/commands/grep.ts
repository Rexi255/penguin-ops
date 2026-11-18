// GNU grep 3.11 (ADR 0064), following `src/grep.c`. grep prints the lines of its files (or of
// standard input) that match one of its patterns. Patterns are basic regular expressions (`-G`,
// the default), extended ones (`-E`) or fixed strings (`-F`), translated in `grep-pattern.ts`.
// `-i` ignores case, `-v` selects the lines that do not match, `-w` and `-x` match whole words or
// lines, `-n` numbers the lines, `-c` counts them, `-l` and `-L` list files, `-q` only sets the
// exit status, `-s` hides messages about files, `-H` and `-h` decide about file names in front
// of the lines, and `-r` searches directories. The exit status is 0 if a line was selected, 1 if
// none was, and 2 after an error.

import { type CommandInvocation, defineCommand } from "../command-registry";
import { openDirectory, openForReading } from "../fs-read";
import {
  literalSource,
  type PatternSyntax,
  translatePattern,
  WORD_CHARACTER,
} from "../grep-pattern";
import type { CommandContext, CommandResult } from "../interpreter";
import { lookup } from "../lookup";
import type { ParsedOption } from "../options";
import { findHost } from "../world";
import { LOOKUP_ERROR_MESSAGES } from "./directory-names";
import { fileNameConcat } from "./file-names";

/** grep's exit statuses. */
const SELECTED = 0;
const NONE_SELECTED = 1;
const TROUBLE = 2;

/** The name of standard input in output and messages. */
const STDIN_NAME = "(standard input)";

type GrepOption =
  | "basic-regexp"
  | "extended-regexp"
  | "fixed-strings"
  | "perl-regexp"
  | "after-context"
  | "before-context"
  | "binary-files"
  | "byte-offset"
  | "context"
  | "color"
  | "count"
  | "devices"
  | "directories"
  | "exclude"
  | "exclude-from"
  | "exclude-dir"
  | "file"
  | "files-with-matches"
  | "files-without-match"
  | "group-separator"
  | "help"
  | "include"
  | "ignore-case"
  | "no-ignore-case"
  | "initial-tab"
  | "label"
  | "line-buffered"
  | "line-number"
  | "line-regexp"
  | "max-count"
  | "no-filename"
  | "no-group-separator"
  | "no-messages"
  | "null"
  | "null-data"
  | "only-matching"
  | "quiet"
  | "recursive"
  | "dereference-recursive"
  | "regexp"
  | "invert-match"
  | "text"
  | "binary"
  | "unix-byte-offsets"
  | "version"
  | "with-filename"
  | "word-regexp"
  | "without-match"
  | "matcher"
  | "context-digit";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The options that choose how patterns are read. */
const MATCHERS: ReadonlySet<GrepOption> = new Set([
  "basic-regexp",
  "extended-regexp",
  "fixed-strings",
  "perl-regexp",
  "matcher",
]);

export const grep = defineCommand<GrepOption>({
  name: "grep",
  // The `long_options` of grep 3.11, then the short options without a long name.
  options: [
    { id: "basic-regexp", short: "G", long: "basic-regexp", argument: "none" },
    { id: "extended-regexp", short: "E", long: "extended-regexp", argument: "none" },
    { id: "fixed-strings", long: "fixed-regexp", argument: "none" },
    { id: "fixed-strings", short: "F", long: "fixed-strings", argument: "none" },
    { id: "perl-regexp", short: "P", long: "perl-regexp", argument: "none" },
    { id: "after-context", short: "A", long: "after-context", argument: "required" },
    { id: "before-context", short: "B", long: "before-context", argument: "required" },
    { id: "binary-files", long: "binary-files", argument: "required" },
    { id: "byte-offset", short: "b", long: "byte-offset", argument: "none" },
    { id: "context", short: "C", long: "context", argument: "required" },
    { id: "color", long: "color", argument: "optional" },
    { id: "color", long: "colour", argument: "optional" },
    { id: "count", short: "c", long: "count", argument: "none" },
    { id: "devices", short: "D", long: "devices", argument: "required" },
    { id: "directories", short: "d", long: "directories", argument: "required" },
    { id: "exclude", long: "exclude", argument: "required" },
    { id: "exclude-from", long: "exclude-from", argument: "required" },
    { id: "exclude-dir", long: "exclude-dir", argument: "required" },
    { id: "file", short: "f", long: "file", argument: "required" },
    { id: "files-with-matches", short: "l", long: "files-with-matches", argument: "none" },
    { id: "files-without-match", short: "L", long: "files-without-match", argument: "none" },
    { id: "group-separator", long: "group-separator", argument: "required" },
    { id: "help", long: "help", argument: "none" },
    { id: "include", long: "include", argument: "required" },
    { id: "ignore-case", short: "i", long: "ignore-case", argument: "none" },
    { id: "no-ignore-case", long: "no-ignore-case", argument: "none" },
    { id: "initial-tab", short: "T", long: "initial-tab", argument: "none" },
    { id: "label", long: "label", argument: "required" },
    { id: "line-buffered", long: "line-buffered", argument: "none" },
    { id: "line-number", short: "n", long: "line-number", argument: "none" },
    { id: "line-regexp", short: "x", long: "line-regexp", argument: "none" },
    { id: "max-count", short: "m", long: "max-count", argument: "required" },
    { id: "no-filename", short: "h", long: "no-filename", argument: "none" },
    { id: "no-group-separator", long: "no-group-separator", argument: "none" },
    { id: "no-messages", short: "s", long: "no-messages", argument: "none" },
    { id: "null", short: "Z", long: "null", argument: "none" },
    { id: "null-data", short: "z", long: "null-data", argument: "none" },
    { id: "only-matching", short: "o", long: "only-matching", argument: "none" },
    { id: "quiet", short: "q", long: "quiet", argument: "none" },
    { id: "recursive", short: "r", long: "recursive", argument: "none" },
    { id: "dereference-recursive", short: "R", long: "dereference-recursive", argument: "none" },
    { id: "regexp", short: "e", long: "regexp", argument: "required" },
    { id: "invert-match", short: "v", long: "invert-match", argument: "none" },
    { id: "quiet", long: "silent", argument: "none" },
    { id: "text", short: "a", long: "text", argument: "none" },
    { id: "binary", short: "U", long: "binary", argument: "none" },
    { id: "unix-byte-offsets", short: "u", long: "unix-byte-offsets", argument: "none" },
    { id: "version", short: "V", long: "version", argument: "none" },
    { id: "with-filename", short: "H", long: "with-filename", argument: "none" },
    { id: "word-regexp", short: "w", long: "word-regexp", argument: "none" },
    { id: "without-match", short: "I", argument: "none" },
    { id: "matcher", short: "X", argument: "required" },
    { id: "ignore-case", short: "y", argument: "none" },
    ...DIGITS.map((digit) => ({
      id: "context-digit" as const,
      short: digit,
      argument: "none" as const,
    })),
  ],
  simulated: [
    "basic-regexp",
    "extended-regexp",
    "fixed-strings",
    "count",
    "files-with-matches",
    "files-without-match",
    "ignore-case",
    "no-ignore-case",
    "line-number",
    "line-regexp",
    "no-filename",
    "no-messages",
    "quiet",
    "recursive",
    "dereference-recursive",
    "regexp",
    "invert-match",
    "with-filename",
    "word-regexp",
  ],
  usageErrorStatus: TROUBLE,
  checkOption: (option, before) => {
    const earlier = before.findLast((other) => MATCHERS.has(other.id));
    return MATCHERS.has(option.id) && earlier !== undefined && earlier.id !== option.id
      ? { message: "conflicting matchers specified", tryHelp: false }
      : undefined;
  },
  usageErrorNote: (context) => usageLine(context),
  run: (invocation) => new Grep(invocation).run(),
});

function usageLine(context: CommandContext): string {
  return `Usage: ${context.name} [OPTION]... PATTERNS [FILE]...\n`;
}

/** One input of grep: the name it shows, its text, and the canonical path of a file. */
interface GrepInput {
  readonly name: string;
  readonly text: string;
  readonly path?: string;
}

/** grep found a selected line with `-q` and exits at once. */
class QuietMatch extends Error {
  constructor() {
    super("grep -q found a line");
  }
}

/** grep reached the terminal as standard input, which the game cannot read. */
class TerminalInput extends Error {
  constructor() {
    super("grep reads the terminal");
  }
}

/** The settings of one run, from the options. */
interface GrepSettings {
  readonly syntax: PatternSyntax | "fixed";
  readonly patterns: readonly string[] | undefined;
  readonly ignoreCase: boolean;
  readonly invert: boolean;
  readonly words: boolean;
  readonly lines: boolean;
  readonly lineNumbers: boolean;
  readonly count: boolean;
  readonly list: "none" | "matching" | "nonmatching";
  readonly quiet: boolean;
  readonly suppressErrors: boolean;
  readonly recursive: boolean;
  readonly filenames: "always" | "never" | "default";
}

function grepSettings(options: readonly ParsedOption<GrepOption>[]): GrepSettings {
  let syntax: GrepSettings["syntax"] = "basic";
  let patterns: string[] | undefined;
  let ignoreCase = false;
  let list: GrepSettings["list"] = "none";
  let filenames: GrepSettings["filenames"] = "default";
  const has = (id: GrepOption): boolean => options.some((option) => option.id === id);
  for (const option of options) {
    const id = option.id;
    if (id === "basic-regexp" || id === "extended-regexp") {
      syntax = id === "basic-regexp" ? "basic" : "extended";
    } else if (id === "fixed-strings") {
      syntax = "fixed";
    } else if (id === "regexp") {
      patterns = [...(patterns ?? []), ...(option.argument ?? "").split("\n")];
    } else if (id === "ignore-case" || id === "no-ignore-case") {
      ignoreCase = id === "ignore-case";
    } else if (id === "files-with-matches" || id === "files-without-match") {
      list = id === "files-with-matches" ? "matching" : "nonmatching";
    } else if (id === "with-filename" || id === "no-filename") {
      filenames = id === "with-filename" ? "always" : "never";
    }
  }
  const quiet = has("quiet");
  return {
    syntax,
    patterns,
    ignoreCase,
    invert: has("invert-match"),
    words: has("word-regexp"),
    lines: has("line-regexp"),
    lineNumbers: has("line-number"),
    // -q overrides -l and -L, which in turn override -c.
    count: has("count") && !quiet && list === "none",
    list: quiet ? "none" : list,
    quiet,
    suppressErrors: has("no-messages"),
    recursive: has("recursive") || has("dereference-recursive"),
    filenames,
  };
}

/** One run of grep. */
class Grep {
  private readonly settings: GrepSettings;
  private matchers: readonly RegExp[] = [];
  /** Whether an error happened, which makes the exit status 2. */
  private errorSeen = false;
  /** Whether grep has selected a line in any file. */
  private selectedAny = false;
  private showNames = false;
  /** Whether no file name is shown before the first "./" with `-r` and no operands. */
  private omitDotSlash = false;

  constructor(private readonly invocation: CommandInvocation<GrepOption>) {
    this.settings = grepSettings(invocation.options);
  }

  run(): CommandResult {
    const { name } = this.invocation;
    let operands = [...this.invocation.operands];
    let patterns = this.settings.patterns;
    if (patterns === undefined) {
      const first = operands.shift();
      if (first === undefined) {
        this.invocation.stderr(
          `${usageLine(this.invocation)}Try '${name} --help' for more information.\n`,
        );
        return { exitStatus: TROUBLE };
      }
      patterns = first.split("\n");
    }
    if (!this.compile(patterns)) {
      return { exitStatus: TROUBLE };
    }
    const { invert, lines, words, list } = this.settings;
    // "If it is easy to see that matching cannot succeed", grep reads nothing.
    const empty = patterns.every((pattern) => pattern === "");
    if (empty && invert && !lines && !words && list !== "nonmatching") {
      return { exitStatus: NONE_SELECTED };
    }
    const explicitNames = this.settings.filenames;
    let recursiveDefault = false;
    if (operands.length === 0) {
      if (this.settings.recursive) {
        operands = ["."];
        this.omitDotSlash = true;
      } else {
        operands = ["-"];
      }
    }
    if (explicitNames === "default") {
      if (this.invocation.operands.length - (this.settings.patterns === undefined ? 1 : 0) <= 1) {
        recursiveDefault = this.settings.recursive;
        this.showNames = false;
      } else {
        this.showNames = true;
      }
    } else {
      this.showNames = explicitNames === "always";
    }
    try {
      for (const operand of operands) {
        this.searchOperand(operand, recursiveDefault);
      }
    } catch (failure) {
      if (failure instanceof QuietMatch) {
        return { exitStatus: SELECTED };
      }
      if (failure instanceof TerminalInput) {
        return { stop: { key: "terminal-input-not-simulated" } };
      }
      throw failure;
    }
    if (this.errorSeen) {
      return { exitStatus: TROUBLE };
    }
    return { exitStatus: this.selectedAny ? SELECTED : NONE_SELECTED };
  }

  /**
   * Translates the patterns like GEAcompile: glibc's errors for every pattern first (each on its
   * own line), then dfa's warnings and errors in the order of the patterns. Returns false after
   * an error.
   */
  private compile(patterns: readonly string[]): boolean {
    const { syntax, ignoreCase, words, lines } = this.settings;
    const flags = ignoreCase ? "iu" : "u";
    const wrap = (source: string): string => {
      if (lines) {
        return `^(?:${source})$`;
      }
      if (words) {
        return `(?<!${WORD_CHARACTER})(?:${source})(?!${WORD_CHARACTER})`;
      }
      return source;
    };
    if (syntax === "fixed") {
      this.matchers = patterns.map((pattern) => new RegExp(wrap(literalSource(pattern)), flags));
      return true;
    }
    const translations = patterns.map((pattern) => translatePattern(pattern, syntax));
    let regcompFailed = false;
    for (const translation of translations) {
      if (!translation.ok && translation.stage === "regcomp") {
        this.message(translation.error);
        regcompFailed = true;
      }
    }
    if (regcompFailed) {
      return false;
    }
    const matchers: RegExp[] = [];
    for (const translation of translations) {
      if (!translation.ok) {
        this.message(translation.error);
        return false;
      }
      for (const warning of translation.warnings) {
        this.message(`warning: ${warning}`);
      }
      matchers.push(new RegExp(wrap(translation.source), flags));
    }
    this.matchers = matchers;
    return true;
  }

  /** grep_command_line_arg: standard input for `-`, else a file or directory. */
  private searchOperand(operand: string, recursiveDefault: boolean): void {
    if (operand === "-") {
      if (recursiveDefault) {
        this.showNames = false;
      }
      this.searchStdin();
      return;
    }
    const { world, session } = this.invocation;
    const host = findHost(world, session.host);
    if (host === undefined) {
      throw new Error(`the session's host "${session.host}" is not part of the world`);
    }
    const found = lookup(host.root, session.credentials, session.cwd, operand);
    if (recursiveDefault) {
      // "Don't output file names if invoked as 'grep -r PATTERN NONDIRECTORY'."
      this.showNames = found.ok && found.node.kind === "directory";
    }
    if (found.ok && found.node.kind === "directory" && this.settings.recursive) {
      this.searchDirectory(operand);
      return;
    }
    this.searchFile(operand);
  }

  private searchStdin(): void {
    const stdin = this.invocation.stdin;
    switch (stdin.kind) {
      case "terminal":
        throw new TerminalInput();
      case "directory":
        this.fileError(STDIN_NAME, "Is a directory");
        return;
      case "text":
        this.search({ name: STDIN_NAME, text: stdin.text });
        return;
    }
  }

  /** Opens and searches the file at `path`, shown as `name`. */
  private searchFile(path: string, name = path): void {
    const opened = openForReading(this.invocation.world, this.invocation.session, path);
    if (!opened.ok) {
      this.fileError(name, LOOKUP_ERROR_MESSAGES[opened.error]);
      return;
    }
    switch (opened.opened.kind) {
      case "directory":
        // open(2) works, but read(2) fails.
        this.fileError(name, "Is a directory");
        return;
      case "file":
        this.search({ name, text: opened.opened.content, path: opened.opened.path });
        return;
    }
  }

  /** fts' walk of a directory for `-r`, in the order of its entries. */
  private searchDirectory(path: string): void {
    const listed = openDirectory(this.invocation.world, this.invocation.session, path);
    if (!listed.ok) {
      this.fileError(this.displayName(path), LOOKUP_ERROR_MESSAGES[listed.error]);
      return;
    }
    for (const entry of listed.entries) {
      if (entry.name === "." || entry.name === "..") {
        continue;
      }
      const child = fileNameConcat(path, entry.name);
      if (entry.kind === "directory") {
        this.searchDirectory(child);
      } else {
        this.searchFile(child, this.displayName(child));
      }
    }
  }

  /** The name grep shows for `path`: without "./" when it searches "." by itself. */
  private displayName(path: string): string {
    return this.omitDotSlash && path.startsWith("./") ? path.slice(2) : path;
  }

  /** grep and grepdesc for one input with lines. */
  private search(input: GrepInput): void {
    const { count, list, quiet, invert, lineNumbers } = this.settings;
    const outQuiet = count || list !== "none" || quiet;
    const output = this.invocation.stdoutFile;
    if (
      !outQuiet &&
      input.path !== undefined &&
      output?.host === this.invocation.session.host &&
      output.path === input.path
    ) {
      this.message(`${input.name}: input file is also the output`, true);
      this.errorSeen = true;
      return;
    }
    const lines = input.text.split("\n");
    if (lines.at(-1) === "") {
      lines.pop();
    }
    const binary = input.text.includes("\0");
    let selected = 0;
    for (const [index, line] of lines.entries()) {
      const matches = this.matchers.some((matcher) => matcher.test(line));
      if (matches === invert) {
        continue;
      }
      selected++;
      this.selectedAny = true;
      if (quiet) {
        throw new QuietMatch();
      }
      // -l and -L need one line; a binary file shows no lines, only a message at the end.
      if (list !== "none" || (binary && !outQuiet)) {
        break;
      }
      if (!count) {
        const prefix =
          (this.showNames ? `${input.name}:` : "") + (lineNumbers ? `${String(index + 1)}:` : "");
        this.invocation.stdout(`${prefix}${line}\n`);
      }
    }
    if (binary && selected > 0 && !outQuiet) {
      this.message(`${input.name}: binary file matches`);
    }
    if (count) {
      this.invocation.stdout(`${this.showNames ? `${input.name}:` : ""}${String(selected)}\n`);
    }
    if ((list === "matching" && selected > 0) || (list === "nonmatching" && selected === 0)) {
      this.invocation.stdout(`${input.name}\n`);
    }
  }

  /** `suppressible_error`: `grep: NAME: MESSAGE` unless `-s`; the exit status becomes 2. */
  private fileError(name: string, message: string): void {
    this.message(`${name}: ${message}`, true);
    this.errorSeen = true;
  }

  /** Writes `grep: MESSAGE`; `suppressible` messages are left out with `-s`. */
  private message(text: string, suppressible = false): void {
    if (suppressible && this.settings.suppressErrors) {
      return;
    }
    this.invocation.stderr(`${this.invocation.name}: ${text}\n`);
  }
}
