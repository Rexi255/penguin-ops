// The bash builtin `echo` (ADR 0053), following bash 5.2's `echo_builtin` with Debian's
// defaults (`xpg_echo` off). Unlike the other builtins it has no option parser: leading words
// made only of the letters `n`, `e` and `E` after a dash are options, and the first other word
// (also `-`, `--` or `--help`) starts the text. `-e` turns on the escapes of `ansicstr`, which
// work on bytes; the result must be valid UTF-8, because the game holds text only.

import type { RegisteredCommand } from "../command-registry";
import { decodeUtf8, encodeCodePoint, encodeUtf8, isScalarValue } from "../utf8";

/** The letters an option word of `echo` may consist of. */
const OPTION_LETTERS = new Set(["n", "e", "E"]);

/** The bytes of the simple escapes of `echo -e`. */
const SIMPLE_ESCAPES: ReadonlyMap<string, number> = new Map([
  ["a", 0x07],
  ["b", 0x08],
  ["e", 0x1b],
  ["E", 0x1b],
  ["f", 0x0c],
  ["n", 0x0a],
  ["r", 0x0d],
  ["t", 0x09],
  ["v", 0x0b],
  ["\\", 0x5c],
]);

/** A byte that never occurs in valid UTF-8; it marks output that cannot be text. */
const INVALID_BYTE = 0xff;

export const echo: RegisteredCommand = {
  name: "echo",
  run: ({ args, stdout }) => {
    let newline = true;
    let escapes = false;
    let index = 0;
    for (; index < args.length; index++) {
      const letters = Array.from(args[index] ?? "");
      if (letters[0] !== "-" || letters.length === 1) {
        break;
      }
      const flags = letters.slice(1);
      if (!flags.every((letter) => OPTION_LETTERS.has(letter))) {
        break;
      }
      for (const flag of flags) {
        if (flag === "n") {
          newline = false;
        } else {
          escapes = flag === "e";
        }
      }
    }
    const words = args.slice(index);
    if (!escapes) {
      stdout(words.join(" ") + (newline ? "\n" : ""));
      return { exitStatus: 0 };
    }
    const bytes: number[] = [];
    for (const [position, word] of words.entries()) {
      const translated = translateEscapes(word);
      bytes.push(...translated.bytes);
      if (translated.stop) {
        newline = false;
        break;
      }
      if (position < words.length - 1) {
        bytes.push(0x20);
      }
    }
    if (newline) {
      bytes.push(0x0a);
    }
    const text = decodeUtf8(bytes);
    if (text === undefined) {
      return { stop: { key: "invalid-utf8-not-simulated" } };
    }
    stdout(text);
    return { exitStatus: 0 };
  },
};

/** The bytes of one word after the escapes of `echo -e`, and whether `\c` ended the output. */
interface Translated {
  readonly bytes: readonly number[];
  readonly stop: boolean;
}

/**
 * Bash's `ansicstr` for `echo -e`: `\a`, `\b`, `\e`, `\E`, `\f`, `\n`, `\r`, `\t`, `\v` and
 * `\\`; `\0` with up to three octal digits; `\x` with up to two hexadecimal digits; `\u` and `\U`
 * with up to four and eight hexadecimal digits for a Unicode character; `\c` ends all output.
 * Every other backslash stays, also before `1` to `7` and a backslash at the end. Octal and
 * hexadecimal values above 255 keep their lowest eight bits.
 */
function translateEscapes(word: string): Translated {
  const characters = Array.from(word);
  const bytes: number[] = [];
  let index = 0;
  const digits = (pattern: RegExp, maximum: number): string => {
    let taken = "";
    while (taken.length < maximum && pattern.test(characters[index] ?? "")) {
      taken += characters[index] ?? "";
      index++;
    }
    return taken;
  };
  while (index < characters.length) {
    const character = characters[index] ?? "";
    index++;
    if (character !== "\\" || index === characters.length) {
      bytes.push(...encodeUtf8(character));
      continue;
    }
    const escape = characters[index] ?? "";
    index++;
    const simple = SIMPLE_ESCAPES.get(escape);
    if (simple !== undefined) {
      bytes.push(simple);
    } else if (escape === "c") {
      return { bytes, stop: true };
    } else if (escape === "0") {
      bytes.push(Number.parseInt(`0${digits(/^[0-7]$/u, 3)}`, 8) & 0xff);
    } else if (escape === "x") {
      const hex = digits(/^[0-9a-fA-F]$/u, 2);
      bytes.push(...(hex === "" ? encodeUtf8("\\x") : [Number.parseInt(hex, 16)]));
    } else if (escape === "u" || escape === "U") {
      const hex = digits(/^[0-9a-fA-F]$/u, escape === "u" ? 4 : 8);
      bytes.push(...(hex === "" ? encodeUtf8(`\\${escape}`) : unicodeBytes(hex)));
    } else {
      bytes.push(...encodeUtf8(`\\${escape}`));
    }
  }
  return { bytes, stop: false };
}

/**
 * The UTF-8 bytes of the code point written as `hex`. A surrogate or a value above U+10FFFF has
 * no valid UTF-8 form; bash writes invalid bytes for it, so the output is marked invalid.
 */
function unicodeBytes(hex: string): number[] {
  const codePoint = Number.parseInt(hex, 16);
  return isScalarValue(codePoint) ? encodeCodePoint(codePoint) : [INVALID_BYTE];
}
