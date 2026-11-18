// What `head` and `tail` share (ADR 0059): the headers `==> NAME <==` before each input, the
// messages for invalid counts, the way inputs are opened, and the output of byte ranges, which
// the game can only show if they are valid UTF-8.

import type { CommandInvocation, OptionFailure } from "../command-registry";
import { openForReading } from "../fs-read";
import type { CommandStop } from "../interpreter";
import { localeQuote, shellQuoteAlways } from "../quote";
import { decodeUtf8, encodeUtf8 } from "../utf8";
import { xnumtoumax } from "../xstrtol";
import { LOOKUP_ERROR_MESSAGES } from "./directory-names";

/** The operand that stands for standard input. */
export const STDIN_OPERAND = "-";

/** The name of standard input in headers and messages (`pretty_name`). */
export const STDIN_NAME = "standard input";

/** The suffixes that the counts of `head` and `tail` may have. */
export const COUNT_SUFFIXES = "bkKmMGTPEZYRQ0";

/** The default count of lines. */
export const DEFAULT_COUNT = 10n;

/** The exit status after an error, coreutils' `EXIT_FAILURE`. */
export const FAILURE = 1;

/** When to write headers: for several inputs (the default), always (`-v`) or never (`-q`). */
export type HeaderMode = "multiple" | "always" | "never";

/** The byte that ends a line: a newline, or NUL with `-z`. */
export type LineEnd = 0x0a | 0x00;

export const NEWLINE: LineEnd = 0x0a;
export const NUL: LineEnd = 0x00;

/** What a count counts: lines (`-n`) or bytes (`-c`). */
export type CountUnit = "lines" | "bytes";

/**
 * Reads the number of `-n` or `-c` like `string_to_integer` in head.c and the `-c`/`-n` case
 * of tail.c: `undefined` if it is invalid, `UINTMAX_MAX` if it is too large.
 */
export function readCount(text: string): bigint | undefined {
  return xnumtoumax(text, COUNT_SUFFIXES);
}

/** The error for the invalid count `text` of `unit`: `invalid number of lines: ‘x’`. */
export function invalidCount(unit: CountUnit, text: string): OptionFailure {
  return { message: `invalid number of ${unit}: ${localeQuote(text)}`, tryHelp: false };
}

/** Writes the headers `==> NAME <==`, with an empty line before every header but the first. */
export class HeaderWriter {
  private first = true;

  constructor(
    private readonly enabled: boolean,
    private readonly stdout: (text: string) => void,
  ) {}

  /** Writes the header for `name` if headers are on. */
  write(name: string): void {
    if (!this.enabled) {
      return;
    }
    this.stdout(`${this.first ? "" : "\n"}==> ${name} <==\n`);
    this.first = false;
  }
}

/** Whether headers are written for `operandCount` inputs in `mode`. */
export function printsHeaders(mode: HeaderMode, operandCount: number): boolean {
  return mode === "always" || (mode === "multiple" && operandCount > 1);
}

/**
 * An input after open(2): the bytes of a regular file, a directory (whose reads fail with
 * EISDIR), or an error message for `cannot open NAME for reading`.
 */
export type OpenedInput =
  | { readonly kind: "file"; readonly bytes: readonly number[] }
  | { readonly kind: "directory" }
  | { readonly kind: "failed"; readonly message: string };

/** Opens the file operand `operand` for reading as the command's user. */
export function openInput(invocation: CommandInvocation, operand: string): OpenedInput {
  const opened = openForReading(invocation.world, invocation.session, operand);
  if (!opened.ok) {
    return { kind: "failed", message: LOOKUP_ERROR_MESSAGES[opened.error] };
  }
  switch (opened.opened.kind) {
    case "directory":
      return { kind: "directory" };
    case "file":
      return { kind: "file", bytes: encodeUtf8(opened.opened.content) };
  }
}

/** Writes `NAME: cannot open 'FILE' for reading: MESSAGE`. */
export function cannotOpen(invocation: CommandInvocation, operand: string, message: string): void {
  invocation.stderr(
    `${invocation.name}: cannot open ${shellQuoteAlways(operand)} for reading: ${message}\n`,
  );
}

/** Writes `NAME: error reading 'FILE': Is a directory`, the error of read(2) on a directory. */
export function cannotReadDirectory(invocation: CommandInvocation, name: string): void {
  invocation.stderr(
    `${invocation.name}: error reading ${shellQuoteAlways(name)}: Is a directory\n`,
  );
}

/** The stop for output that is not valid UTF-8, which the game cannot show (ADR 0053). */
export const INVALID_UTF8: CommandStop = { stop: { key: "invalid-utf8-not-simulated" } };

/** The stop for reading from the terminal, which the game does not simulate (ADR 0058). */
export const TERMINAL_INPUT: CommandStop = { stop: { key: "terminal-input-not-simulated" } };

/**
 * Writes `bytes` to standard output. Returns false without writing if they are not valid UTF-8,
 * for example because a byte count cut a character in two.
 */
export function writeBytes(invocation: CommandInvocation, bytes: readonly number[]): boolean {
  const text = decodeUtf8(bytes);
  if (text === undefined) {
    return false;
  }
  if (text !== "") {
    invocation.stdout(text);
  }
  return true;
}

/**
 * Where the last `count` lines of `bytes` start, as `elide_tail_lines_seekable` in head.c and
 * `file_lines` in tail.c find it: after the line end that comes `count` line ends before the
 * end, where a last line without a line end counts as a line. 0 if `bytes` has no more than
 * `count` lines, and the length of `bytes` for a count of 0.
 */
export function lastLinesStart(bytes: readonly number[], count: bigint, lineEnd: LineEnd): number {
  if (count === 0n) {
    return bytes.length;
  }
  let remaining = bytes.length > 0 && bytes[bytes.length - 1] !== lineEnd ? count - 1n : count;
  for (let index = bytes.length - 1; index >= 0; index--) {
    if (bytes[index] === lineEnd) {
      if (remaining === 0n) {
        return index + 1;
      }
      remaining--;
    }
  }
  return 0;
}
