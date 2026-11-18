// The coreutils command `head` 9.7 (ADR 0059), following `src/head.c`. `head` writes the first
// ten lines of each file operand, or of standard input for `-` and without operands. `-n N`
// and `-c N` choose the number of lines or bytes; with a leading `-` (`-n -2`) they choose how
// many to leave out at the end. With several inputs each one gets a header `==> NAME <==`
// (`-v` always, `-q` never). The obsolete form `head -5` (and `-5c`, `-2k`, `-3qv`) is read
// before the other options, as in head.c.

import {
  type CommandInvocation,
  defineCommand,
  type ObsoleteOptions,
  type OptionFailure,
} from "../command-registry";
import type { CommandResult } from "../interpreter";
import type { ParsedOption } from "../options";
import { encodeUtf8 } from "../utf8";
import { UINTMAX_MAX } from "../xstrtol";
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

type HeadOption =
  | "bytes"
  | "lines"
  | "presume-input-pipe"
  | "quiet"
  | "verbose"
  | "zero-terminated"
  | "help"
  | "version"
  | "digit";

/** The digits, which head's `getopt` string accepts as options only to reject them. */
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The size of head.c's read buffer (`BUFSIZ` of glibc), which matters for pipes. */
const BUFSIZ = 8192;

export const head = defineCommand<HeadOption>({
  name: "head",
  // The `long_options` of coreutils 9.7, then the digits of the `getopt` string.
  options: [
    { id: "bytes", short: "c", long: "bytes", argument: "required" },
    { id: "lines", short: "n", long: "lines", argument: "required" },
    { id: "presume-input-pipe", long: "-presume-input-pipe", argument: "none" },
    { id: "quiet", short: "q", long: "quiet", argument: "none" },
    { id: "quiet", long: "silent", argument: "none" },
    { id: "verbose", short: "v", long: "verbose", argument: "none" },
    { id: "zero-terminated", short: "z", long: "zero-terminated", argument: "none" },
    { id: "help", long: "help", argument: "none" },
    { id: "version", long: "version", argument: "none" },
    ...DIGITS.map((digit) => ({ id: "digit" as const, short: digit, argument: "none" as const })),
  ],
  simulated: ["bytes", "lines", "quiet", "verbose", "zero-terminated", "digit"],
  usageErrorStatus: FAILURE,
  obsoleteSyntax: obsoleteHeadOptions,
  checkOption: checkHeadOption,
  run: (invocation) => new Head(invocation, headSettings(invocation.options)).run(),
});

/**
 * The obsolete form of head.c: a first argument of a dash, digits and option letters. `c`
 * counts bytes, `b`, `k` and `m` bytes with that multiplier, `l` lines; `q`, `v` and `z` are
 * the options of those names. Any other letter is an error. The form becomes a `-n` or `-c`
 * option with the number (and the multiplier), then `-q` or `-v`, then `-z`.
 */
function obsoleteHeadOptions(args: readonly string[]): ObsoleteOptions<HeadOption> | undefined {
  const first = args[0];
  const match = first === undefined ? null : /^-(\d+)(.*)$/su.exec(first);
  if (match === null) {
    return undefined;
  }
  const digits = match[1] ?? "";
  let unit: CountUnit = "lines";
  let multiplier = "";
  let header: ParsedOption<HeadOption> | undefined;
  let zero: ParsedOption<HeadOption> | undefined;
  for (const letter of match[2] ?? "") {
    switch (letter) {
      case "c":
        unit = "bytes";
        multiplier = "";
        break;
      case "b":
      case "k":
      case "m":
        unit = "bytes";
        multiplier = letter;
        break;
      case "l":
        unit = "lines";
        break;
      case "q":
        header = { id: "quiet", name: "-q", argument: undefined };
        break;
      case "v":
        header = { id: "verbose", name: "-v", argument: undefined };
        break;
      case "z":
        zero = { id: "zero-terminated", name: "-z", argument: undefined };
        break;
      default:
        return {
          ok: false,
          failure: { message: `invalid trailing option -- ${letter}`, tryHelp: true },
        };
    }
  }
  const count: ParsedOption<HeadOption> =
    unit === "lines"
      ? { id: "lines", name: "-n", argument: digits + multiplier }
      : { id: "bytes", name: "-c", argument: digits + multiplier };
  const options = [count, header, zero].filter((option) => option !== undefined);
  return { ok: true, options, args: args.slice(1) };
}

/** Rejects digits as options and invalid counts, in the order head.c reads its options. */
function checkHeadOption(option: ParsedOption<HeadOption>): OptionFailure | undefined {
  switch (option.id) {
    case "digit":
      return { message: `invalid trailing option -- ${option.name.slice(1)}`, tryHelp: true };
    case "bytes":
    case "lines": {
      const count = countArgument(option.argument ?? "");
      return readCount(count.text) === undefined ? invalidCount(option.id, count.text) : undefined;
    }
    case "presume-input-pipe":
    case "quiet":
    case "verbose":
    case "zero-terminated":
    case "help":
    case "version":
      return undefined;
  }
}

/** The argument of `-n` or `-c` without a leading `-`, which means "all but the last". */
function countArgument(argument: string): { readonly text: string; readonly elide: boolean } {
  const elide = argument.startsWith("-");
  return { text: elide ? argument.slice(1) : argument, elide };
}

/** What `head` writes, after all options. */
interface HeadSettings {
  readonly unit: CountUnit;
  /** The number of units to write, or to leave out with `elide`; `UINTMAX_MAX` is unlimited. */
  readonly count: bigint;
  readonly elide: boolean;
  readonly headerMode: HeaderMode;
  readonly lineEnd: LineEnd;
}

function headSettings(options: readonly ParsedOption<HeadOption>[]): HeadSettings {
  let unit: CountUnit = "lines";
  let count = DEFAULT_COUNT;
  let elide = false;
  let headerMode: HeaderMode = "multiple";
  let lineEnd: LineEnd = NEWLINE;
  for (const option of options) {
    switch (option.id) {
      case "bytes":
      case "lines": {
        const argument = countArgument(option.argument ?? "");
        const value = readCount(argument.text);
        if (value === undefined) {
          throw new Error(`checkHeadOption lets the invalid count "${argument.text}" pass`);
        }
        unit = option.id;
        count = value;
        elide = argument.elide;
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
      case "presume-input-pipe":
      case "help":
      case "version":
        // Digits are rejected by checkHeadOption; the others are not simulated.
        break;
    }
  }
  return { unit, count, elide, headerMode, lineEnd };
}

/** What `head` takes from one input: the bytes it writes and how many it reads. */
interface Selection {
  readonly output: readonly number[];
  /** The bytes read from the input, which a later `-` of the same standard input skips. */
  readonly consumed: number;
}

/** One run of `head` over its operands. */
class Head {
  private readonly headers: HeaderWriter;
  /** The bytes of standard input that earlier `-` operands have read. */
  private stdinOffset = 0;
  private failed = false;

  constructor(
    private readonly invocation: CommandInvocation<HeadOption>,
    private readonly settings: HeadSettings,
  ) {
    const operands = invocation.operands.length === 0 ? 1 : invocation.operands.length;
    this.headers = new HeaderWriter(printsHeaders(settings.headerMode, operands), (text) => {
      invocation.stdout(text);
    });
  }

  run(): CommandResult {
    const operands =
      this.invocation.operands.length === 0 ? [STDIN_OPERAND] : this.invocation.operands;
    for (const operand of operands) {
      const stopped = operand === STDIN_OPERAND ? this.headStdin() : this.headFile(operand);
      if (stopped !== undefined) {
        return stopped;
      }
    }
    return { exitStatus: this.failed ? FAILURE : 0 };
  }

  private headStdin(): CommandResult | undefined {
    this.headers.write(STDIN_NAME);
    if (!this.reads()) {
      return undefined;
    }
    const stdin = this.invocation.stdin;
    switch (stdin.kind) {
      case "terminal":
        return TERMINAL_INPUT;
      case "directory":
        this.failDirectory(STDIN_NAME);
        return undefined;
      case "text": {
        const bytes = encodeUtf8(stdin.text).slice(this.stdinOffset);
        // A file from `<` can seek back to the end of what head wrote; a pipe cannot.
        const selection = this.select(bytes, stdin.file === undefined);
        this.stdinOffset += selection.consumed;
        return this.write(selection.output);
      }
    }
  }

  private headFile(operand: string): CommandResult | undefined {
    const opened = openInput(this.invocation, operand);
    switch (opened.kind) {
      case "failed":
        cannotOpen(this.invocation, operand, opened.message);
        this.failed = true;
        return undefined;
      case "directory":
        this.headers.write(operand);
        if (this.reads()) {
          this.failDirectory(operand);
        }
        return undefined;
      case "file":
        this.headers.write(operand);
        return this.write(this.select(opened.bytes, false).output);
    }
  }

  /**
   * Whether head reads from its input at all: not for zero lines or bytes, and not when it
   * leaves out an unlimited number at the end.
   */
  private reads(): boolean {
    const { count, elide } = this.settings;
    return elide ? count !== UINTMAX_MAX : count !== 0n;
  }

  /** The part of `bytes` that head writes; `pipe` tells how much it reads to get there. */
  private select(bytes: readonly number[], pipe: boolean): Selection {
    const { unit, count, elide, lineEnd } = this.settings;
    if (elide) {
      const end =
        unit === "bytes"
          ? Math.max(0, bytes.length - clamp(count, bytes.length))
          : lastLinesStart(bytes, count, lineEnd);
      // Leaving out the end means reading to the end; a file seeks back.
      return { output: bytes.slice(0, end), consumed: pipe ? bytes.length : end };
    }
    if (unit === "bytes") {
      const end = clamp(count, bytes.length);
      return { output: bytes.slice(0, end), consumed: end };
    }
    const end = endOfFirstLines(bytes, count, lineEnd);
    if (end === undefined) {
      return { output: bytes, consumed: bytes.length };
    }
    // head_lines reads whole buffers; a pipe cannot give back what it read past the line.
    const consumed = pipe ? Math.min(bytes.length, Math.ceil(end / BUFSIZ) * BUFSIZ) : end;
    return { output: bytes.slice(0, end), consumed };
  }

  private write(bytes: readonly number[]): CommandResult | undefined {
    return writeBytes(this.invocation, bytes) ? undefined : INVALID_UTF8;
  }

  private failDirectory(name: string): void {
    cannotReadDirectory(this.invocation, name);
    this.failed = true;
  }
}

/** `count` as a number of at most `limit`. */
function clamp(count: bigint, limit: number): number {
  return count > BigInt(limit) ? limit : Number(count);
}

/**
 * The end of the first `count` lines of `bytes` (after the line end that closes the last of
 * them; 0 for a count of 0), or `undefined` if `bytes` has fewer line ends.
 */
function endOfFirstLines(
  bytes: readonly number[],
  count: bigint,
  lineEnd: LineEnd,
): number | undefined {
  if (count === 0n) {
    return 0;
  }
  let remaining = count;
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === lineEnd) {
      remaining--;
      if (remaining === 0n) {
        return index + 1;
      }
    }
  }
  return undefined;
}
