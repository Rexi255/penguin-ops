// The coreutils command `tail` 9.7 (ADR 0059), following `src/tail.c`. `tail` writes the last
// ten lines of each file operand, or of standard input for `-` and without operands. `-n N`
// and `-c N` choose the number of lines or bytes; with a leading `+` (`-n +2`) they choose
// where to start instead, counted from 1. With several inputs each one gets a header
// `==> NAME <==` (`-v` always, `-q` never). The obsolete forms `tail -5`, `tail +5` and
// `tail -5c` are read before the other options when there is at most one file operand. Following
// a file (`-f`, `-F`, `--follow` and the options that only matter then) needs time to pass
// while the command runs, which the game does not simulate (ADR 0047), so they give a notice.

import {
  type CommandInvocation,
  defineCommand,
  type ObsoleteOptions,
  type OptionFailure,
} from "../command-registry";
import type { CommandResult } from "../interpreter";
import type { ParsedOption } from "../options";
import { localeQuote } from "../quote";
import { encodeUtf8 } from "../utf8";
import { UINTMAX_MAX, xstrtoumax } from "../xstrtol";
import {
  cannotOpen,
  cannotReadDirectory,
  type CountUnit,
  DEFAULT_COUNT,
  FAILURE,
  HeaderWriter,
  type HeaderMode,
  INVALID_UTF8,
  invalidCount,
  lastLinesStart,
  type LineEnd,
  NEWLINE,
  NUL,
  openInput,
  printsHeaders,
  readCount,
  STDIN_NAME,
  STDIN_OPERAND,
  TERMINAL_INPUT,
  writeBytes,
} from "./head-tail";

type TailOption =
  | "bytes"
  | "follow"
  | "lines"
  | "max-unchanged-stats"
  | "disable-inotify"
  | "pid"
  | "presume-input-pipe"
  | "quiet"
  | "retry"
  | "sleep-interval"
  | "verbose"
  | "zero-terminated"
  | "help"
  | "version"
  | "follow-name-retry"
  | "digit";

/** The digits, which tail's `getopt` string accepts as options only to reject them. */
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The largest offset of a file, `OFF_T_MAX`; lseek(2) cannot skip more bytes at once. */
const OFF_T_MAX = 2n ** 63n - 1n;

export const tail = defineCommand<TailOption>({
  name: "tail",
  // The `long_options` of coreutils 9.7, then the short options without a long name.
  options: [
    { id: "bytes", short: "c", long: "bytes", argument: "required" },
    { id: "follow", long: "follow", argument: "optional" },
    { id: "lines", short: "n", long: "lines", argument: "required" },
    { id: "max-unchanged-stats", long: "max-unchanged-stats", argument: "required" },
    { id: "disable-inotify", long: "-disable-inotify", argument: "none" },
    { id: "pid", long: "pid", argument: "required" },
    { id: "presume-input-pipe", long: "-presume-input-pipe", argument: "none" },
    { id: "quiet", short: "q", long: "quiet", argument: "none" },
    { id: "retry", long: "retry", argument: "none" },
    { id: "quiet", long: "silent", argument: "none" },
    { id: "sleep-interval", short: "s", long: "sleep-interval", argument: "required" },
    { id: "verbose", short: "v", long: "verbose", argument: "none" },
    { id: "zero-terminated", short: "z", long: "zero-terminated", argument: "none" },
    { id: "help", long: "help", argument: "none" },
    { id: "version", long: "version", argument: "none" },
    { id: "follow", short: "f", argument: "none" },
    { id: "follow-name-retry", short: "F", argument: "none" },
    ...DIGITS.map((digit) => ({ id: "digit" as const, short: digit, argument: "none" as const })),
  ],
  simulated: ["bytes", "lines", "quiet", "verbose", "zero-terminated", "digit"],
  usageErrorStatus: FAILURE,
  obsoleteSyntax: obsoleteTailOptions,
  checkOption: checkTailOption,
  run: (invocation) => new Tail(invocation, tailSettings(invocation.options)).run(),
});

/**
 * The obsolete form of tail.c's `parse_obsolete_option`, as Debian's default POSIX version
 * (200809) allows it: one argument `+N` or `-N` followed by `b` (512-byte blocks), `c` (bytes)
 * or `l` (lines) and then maybe `f` (follow), and at most one file operand after it (or `--` and
 * one). Without digits the count is 10 lines, or 10 blocks with `b`. The form becomes a `-n`
 * or `-c` option with the number (with `+` from the start), then `-f`.
 */
function obsoleteTailOptions(args: readonly string[]): ObsoleteOptions<TailOption> | undefined {
  const [first, second] = args;
  const oneFile =
    args.length === 1 ||
    (args.length === 2 && second !== undefined && !(second.startsWith("-") && second !== "-")) ||
    ((args.length === 2 || args.length === 3) && second === "--");
  if (first === undefined || !oneFile) {
    return undefined;
  }
  const fromStart = first.startsWith("+");
  if (!fromStart) {
    // "-" is standard input, and "-c" needs an argument.
    const rest = first.slice(1);
    if (!first.startsWith("-") || rest.slice(rest.startsWith("c") ? 1 : 0) === "") {
      return undefined;
    }
  }
  const match = /^[+-](\d*)([bcl]?)(f?)$/su.exec(first);
  if (match === null) {
    return undefined;
  }
  const digits = match[1] ?? "";
  const unitLetter = match[2] ?? "";
  const unit: CountUnit = unitLetter === "b" || unitLetter === "c" ? "bytes" : "lines";
  let count = unitLetter === "b" ? DEFAULT_COUNT * 512n : DEFAULT_COUNT;
  if (digits !== "") {
    // tail.c reads from the digits to the end of the argument and allows only the suffix `b`.
    const read = xstrtoumax(first.slice(1), "b");
    if (read.status === "overflow" || read.status === "invalid-suffix-overflow") {
      const reason = read.digitsOverflow ? ": Numerical result out of range" : "";
      return {
        ok: false,
        failure: { message: `invalid number: ${localeQuote(first)}${reason}`, tryHelp: false },
      };
    }
    count = read.value;
  }
  const argument = (fromStart ? "+" : "") + count.toString();
  const options: ParsedOption<TailOption>[] = [
    unit === "lines"
      ? { id: "lines", name: "-n", argument }
      : { id: "bytes", name: "-c", argument },
  ];
  if (match[3] === "f") {
    options.push({ id: "follow", name: "-f", argument: undefined });
  }
  return { ok: true, options, args: args.slice(1) };
}

/** Rejects digits as options and invalid counts, in the order tail.c reads its options. */
function checkTailOption(option: ParsedOption<TailOption>): OptionFailure | undefined {
  switch (option.id) {
    case "digit":
      return {
        message: `option used in invalid context -- ${option.name.slice(1)}`,
        tryHelp: false,
      };
    case "bytes":
    case "lines": {
      const count = countArgument(option.argument ?? "");
      return readCount(count.text) === undefined ? invalidCount(option.id, count.text) : undefined;
    }
    case "follow":
    case "max-unchanged-stats":
    case "disable-inotify":
    case "pid":
    case "presume-input-pipe":
    case "quiet":
    case "retry":
    case "sleep-interval":
    case "verbose":
    case "zero-terminated":
    case "help":
    case "version":
    case "follow-name-retry":
      return undefined;
  }
}

/**
 * The argument of `-n` or `-c` as tail.c reads it: a leading `+` stays and means "from the
 * start", a leading `-` is dropped.
 */
function countArgument(argument: string): { readonly text: string; readonly fromStart: boolean } {
  if (argument.startsWith("+")) {
    return { text: argument, fromStart: true };
  }
  return { text: argument.startsWith("-") ? argument.slice(1) : argument, fromStart: false };
}

/** What `tail` writes, after all options. */
interface TailSettings {
  readonly unit: CountUnit;
  /**
   * From the end, the number of units to write; from the start, the number of units to skip
   * (one less than the number written, except for 0). `UINTMAX_MAX` is unlimited.
   */
  readonly count: bigint;
  readonly fromStart: boolean;
  readonly headerMode: HeaderMode;
  readonly lineEnd: LineEnd;
}

function tailSettings(options: readonly ParsedOption<TailOption>[]): TailSettings {
  let unit: CountUnit = "lines";
  let count = DEFAULT_COUNT;
  let fromStart = false;
  let headerMode: HeaderMode = "multiple";
  let lineEnd: LineEnd = NEWLINE;
  for (const option of options) {
    switch (option.id) {
      case "bytes":
      case "lines": {
        const argument = countArgument(option.argument ?? "");
        const value = readCount(argument.text);
        if (value === undefined) {
          throw new Error(`checkTailOption lets the invalid count "${argument.text}" pass`);
        }
        unit = option.id;
        count = value;
        // A `+` stays once set, as tail.c never resets `from_start`.
        fromStart ||= argument.fromStart;
        break;
      }
      case "quiet":
        headerMode = "never";
        break;
      case "verbose":
        headerMode = "always";
        break;
      case "zero-terminated":
        lineEnd = NUL;
        break;
      case "digit":
      case "follow":
      case "max-unchanged-stats":
      case "disable-inotify":
      case "pid":
      case "presume-input-pipe":
      case "retry":
      case "sleep-interval":
      case "help":
      case "version":
      case "follow-name-retry":
        // Digits are rejected by checkTailOption; the others are not simulated.
        break;
    }
  }
  // "To start printing with item N_UNITS from the start of the file, skip N_UNITS - 1 items."
  if (fromStart && count > 0n && count < UINTMAX_MAX) {
    count -= 1n;
  }
  return { unit, count, fromStart, headerMode, lineEnd };
}

/** One run of `tail` over its operands. */
class Tail {
  private readonly headers: HeaderWriter;
  /** Whether an earlier `-` read standard input to its end. */
  private stdinRead = false;
  private failed = false;

  constructor(
    private readonly invocation: CommandInvocation<TailOption>,
    private readonly settings: TailSettings,
  ) {
    const operands = invocation.operands.length === 0 ? 1 : invocation.operands.length;
    this.headers = new HeaderWriter(printsHeaders(settings.headerMode, operands), (text) => {
      invocation.stdout(text);
    });
  }

  run(): CommandResult {
    const { count, fromStart } = this.settings;
    // "Don't read anything if we'll never output anything."
    if (count === (fromStart ? UINTMAX_MAX : 0n)) {
      return { exitStatus: 0 };
    }
    const operands =
      this.invocation.operands.length === 0 ? [STDIN_OPERAND] : this.invocation.operands;
    for (const operand of operands) {
      const ended = operand === STDIN_OPERAND ? this.tailStdin() : this.tailFile(operand);
      if (ended !== undefined) {
        return ended;
      }
    }
    return { exitStatus: this.failed ? FAILURE : 0 };
  }

  private tailStdin(): CommandResult | undefined {
    this.headers.write(STDIN_NAME);
    const stdin = this.invocation.stdin;
    switch (stdin.kind) {
      case "terminal":
        return TERMINAL_INPUT;
      case "directory":
        return this.readDirectory(STDIN_NAME);
      case "text": {
        // tail reads standard input to its end, so a later `-` finds nothing.
        const bytes = this.stdinRead ? [] : encodeUtf8(stdin.text);
        this.stdinRead = true;
        return this.write(bytes);
      }
    }
  }

  private tailFile(operand: string): CommandResult | undefined {
    const opened = openInput(this.invocation, operand);
    switch (opened.kind) {
      case "failed":
        cannotOpen(this.invocation, operand, opened.message);
        this.failed = true;
        return undefined;
      case "directory":
        this.headers.write(operand);
        return this.readDirectory(operand);
      case "file":
        this.headers.write(operand);
        return this.write(opened.bytes);
    }
  }

  /**
   * Reads from a directory, which fails with EISDIR. Most ways of reading write the error and
   * go on with the next input, but `dump_remainder` exits at once: tail.c reaches it for `-c`
   * after a successful lseek(2), which ext4 allows on directories, and for `-n +1` and `-n +0`,
   * which skip nothing.
   */
  private readDirectory(name: string): CommandResult | undefined {
    cannotReadDirectory(this.invocation, name);
    const { unit, count, fromStart } = this.settings;
    const exitsAtOnce = unit === "bytes" ? count <= OFF_T_MAX : fromStart && count === 0n;
    if (exitsAtOnce) {
      return { exitStatus: FAILURE };
    }
    this.failed = true;
    return undefined;
  }

  /** Writes the part of `bytes` that the settings select. */
  private write(bytes: readonly number[]): CommandResult | undefined {
    const output = bytes.slice(this.start(bytes));
    return writeBytes(this.invocation, output) ? undefined : INVALID_UTF8;
  }

  /** Where the output starts in `bytes`. */
  private start(bytes: readonly number[]): number {
    const { unit, count, fromStart, lineEnd } = this.settings;
    const length = bytes.length;
    if (unit === "bytes") {
      const units = count > BigInt(length) ? length : Number(count);
      return fromStart ? units : length - units;
    }
    if (!fromStart) {
      return lastLinesStart(bytes, count, lineEnd);
    }
    // start_lines: skip `count` line ends; with fewer, nothing is written.
    let remaining = count;
    if (remaining === 0n) {
      return 0;
    }
    for (let index = 0; index < length; index++) {
      if (bytes[index] === lineEnd) {
        remaining--;
        if (remaining === 0n) {
          return index + 1;
        }
      }
    }
    return length;
  }
}
