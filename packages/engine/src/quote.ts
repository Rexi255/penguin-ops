// Quoting of arguments in coreutils messages (ADR 0053), like gnulib's `quote` with the
// `locale_quoting_style` in Debian 13's default English UTF-8 locale. English has no
// translation for the quote marks, so gnulib uses the typographic quotes of UTF-8: `whoami a`
// writes "whoami: extra operand ‘a’".

import { encodeUtf8 } from "./utf8";

const LEFT_QUOTE = "‘";
const RIGHT_QUOTE = "’";

/** The C escapes that gnulib writes for control characters with a name of their own. */
const NAMED_ESCAPES: ReadonlyMap<string, string> = new Map([
  ["\x07", "\\a"],
  ["\b", "\\b"],
  ["\f", "\\f"],
  ["\n", "\\n"],
  ["\r", "\\r"],
  ["\t", "\\t"],
  ["\v", "\\v"],
  ["\\", "\\\\"],
  [RIGHT_QUOTE, `\\${RIGHT_QUOTE}`],
]);

/**
 * Characters that glibc's `iswprint` rejects in a UTF-8 locale: control characters, line and
 * paragraph separators, surrogates and unassigned code points. The list of assigned code points
 * comes from the JavaScript engine's Unicode version, which may differ slightly from glibc's.
 */
const NOT_PRINTABLE = /^[\p{Cc}\p{Zl}\p{Zp}\p{Cs}\p{Cn}]$/u;

/**
 * Returns `text` in quotes as the coreutils' `quote` writes it in messages such as
 * "extra operand ‘a’". Inside the quotes, a backslash and the closing quote get a backslash,
 * control characters with a C escape get it (`\n`, `\t`), and every other character that is not
 * printable is written as octal escapes of its UTF-8 bytes (`\033`).
 */
export function localeQuote(text: string): string {
  let quoted = LEFT_QUOTE;
  for (const character of text) {
    quoted += escapeCharacter(character);
  }
  return quoted + RIGHT_QUOTE;
}

function escapeCharacter(character: string): string {
  const named = NAMED_ESCAPES.get(character);
  if (named !== undefined) {
    return named;
  }
  if (!NOT_PRINTABLE.test(character)) {
    return character;
  }
  return encodeUtf8(character)
    .map((byte) => `\\${byte.toString(8).padStart(3, "0")}`)
    .join("");
}
