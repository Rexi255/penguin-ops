// The formatting options of `cat` (ADR 0058), following the function `cat` in coreutils 9.7's
// `src/cat.c`. Its state lives as long as the command: line numbers go on counting from one
// file to the next, a file that ends in the middle of a line continues that line in the next
// file, and a carriage return at the very end of a file waits for the next character to decide
// whether `-E` shows it as `^M`.

import { encodeUtf8 } from "../utf8";

/** What the options ask `cat` to do with the content, like the flags in `cat.c`'s `main`. */
export interface CatFormat {
  /** Number output lines (`-n`, and `-b`). */
  readonly number: boolean;
  /** Number only nonempty lines (`-b`); needs `number`. */
  readonly numberNonblank: boolean;
  /** Write only one of several empty lines in a row (`-s`). */
  readonly squeezeBlank: boolean;
  /** Show control characters and bytes above 127 with `^` and `M-` (`-v`). */
  readonly showNonprinting: boolean;
  /** Write `$` before every line break (`-E`). */
  readonly showEnds: boolean;
  /** Show tabs as `^I` (`-T`). */
  readonly showTabs: boolean;
}

/** The width of a line number, before it grows past 999999. */
const LINE_NUMBER_WIDTH = 6;

/** The byte value of `DEL`, which `-v` shows as `^?`. */
const DELETE = 127;

/** The bytes from 128 on, which `-v` shows with `M-` and the byte 128 lower. */
const META = 128;

/** The first byte that is not a control character. */
const SPACE = 32;

/** The byte value of a tab. */
const TAB = 9;

/** The distance from a control character to the letter after `^`: 1 + 64 gives `A`. */
const CARET_OFFSET = 64;

/**
 * Formats the content of `cat`'s inputs, one after the other. `formatInput` returns the output of
 * one input; `finish` returns what is left after the last one.
 */
export class CatFormatter {
  /**
   * `cat.c`'s `newlines`: -1 in the middle of a line, 0 at the start of a line after a nonempty
   * one (and at the very start), 1 after one empty line, 2 after two or more.
   */
  private newlines = 0;
  /** Whether a carriage return at the end of the last input waits for the next character. */
  private pendingCarriageReturn = false;
  private lineNumber = 0;

  constructor(private readonly options: CatFormat) {}

  /** Returns the output for the content of one input. */
  formatInput(content: string): string {
    const characters = Array.from(content);
    let output = "";
    characters.forEach((character, index) => {
      if (character === "\n") {
        output += this.lineBreak();
      } else {
        output += this.lineStart() + this.convert(character, characters[index + 1]);
      }
    });
    return output;
  }

  /** Returns what is left after the last input: a carriage return that still waits. */
  finish(): string {
    if (!this.pendingCarriageReturn) {
      return "";
    }
    this.pendingCarriageReturn = false;
    return "\r";
  }

  /** The output for a line break: a number for an empty line, `$`, or nothing for `-s`. */
  private lineBreak(): string {
    let output = "";
    this.newlines += 1;
    if (this.newlines > 0) {
      if (this.newlines >= 2) {
        this.newlines = 2;
        if (this.options.squeezeBlank) {
          return "";
        }
      }
      if (this.options.number && !this.options.numberNonblank) {
        output += this.nextLineNumber();
      }
    }
    if (this.options.showEnds) {
      if (this.pendingCarriageReturn) {
        output += "^M";
        this.pendingCarriageReturn = false;
      }
      output += "$";
    }
    return `${output}\n`;
  }

  /** The output before a character that is not a line break: a waiting `\r`, a line number. */
  private lineStart(): string {
    let output = "";
    if (this.pendingCarriageReturn) {
      output += "\r";
      this.pendingCarriageReturn = false;
    }
    if (this.newlines >= 0 && this.options.number) {
      output += this.nextLineNumber();
    }
    this.newlines = -1;
    return output;
  }

  /** The output for `character`, which is not a line break; `next` is the one after it. */
  private convert(character: string, next: string | undefined): string {
    if (this.options.showNonprinting) {
      return encodeUtf8(character)
        .map((byte) => this.nonprinting(byte))
        .join("");
    }
    if (character === "\t" && this.options.showTabs) {
      return "^I";
    }
    if (character === "\r" && this.options.showEnds) {
      if (next === undefined) {
        // The end of the input: only the next input knows whether a line break follows.
        this.pendingCarriageReturn = true;
        return "";
      }
      if (next === "\n") {
        return "^M";
      }
    }
    return character;
  }

  /** One byte in the `^` and `M-` notation of `-v`. */
  private nonprinting(byte: number): string {
    if (byte >= SPACE) {
      if (byte < DELETE) {
        return String.fromCharCode(byte);
      }
      if (byte === DELETE) {
        return "^?";
      }
      const low = byte - META;
      if (low >= SPACE) {
        // `cat.c` writes `M-^?` for the byte 255, which UTF-8 text never contains.
        return `M-${String.fromCharCode(low)}`;
      }
      return `M-^${String.fromCharCode(low + CARET_OFFSET)}`;
    }
    if (byte === TAB && !this.options.showTabs) {
      return "\t";
    }
    return `^${String.fromCharCode(byte + CARET_OFFSET)}`;
  }

  /** The next line number, right-aligned in six columns and followed by a tab. */
  private nextLineNumber(): string {
    this.lineNumber += 1;
    return `${String(this.lineNumber).padStart(LINE_NUMBER_WIDTH, " ")}\t`;
  }
}
