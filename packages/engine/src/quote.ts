// Quoting of names in coreutils output and messages (ADR 0053, ADR 0054), like gnulib's
// `quotearg` in Debian 13's default English UTF-8 locale.
//
// - `localeQuote` is gnulib's `quote` with the `locale_quoting_style`. English has no
//   translation for the quote marks, so gnulib uses the typographic quotes of UTF-8: `whoami a`
//   writes "whoami: extra operand ‘a’".
// - `shellQuoteAlways` is the `shell_escape_always_quoting_style` of the coreutils' `quoteaf`,
//   which `ls`, `cp`, `mv` and `rm` use for file names in messages: "cannot access 'x'".
// - `shellQuote` is the `shell_escape_quoting_style` that `ls` uses for names on a terminal: it
//   quotes only names that the shell would not read back as they are.

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
    quoted += localeEscape(character);
  }
  return quoted + RIGHT_QUOTE;
}

function localeEscape(character: string): string {
  if (character === "\\" || character === RIGHT_QUOTE) {
    return `\\${character}`;
  }
  return escapeSequence(character) ?? character;
}

/**
 * The escape of a character that is not printable: its C escape (`\n`) or the octal escapes of
 * its UTF-8 bytes (`\033`). `undefined` for a printable character.
 */
function escapeSequence(character: string): string | undefined {
  const named = NAMED_ESCAPES.get(character);
  if (named !== undefined) {
    return named;
  }
  if (!NOT_PRINTABLE.test(character)) {
    return undefined;
  }
  return encodeUtf8(character)
    .map((byte) => `\\${byte.toString(8).padStart(3, "0")}`)
    .join("");
}

/** Characters that need no quotes in any quoting style of gnulib. */
const SHELL_SAFE = /^[%+,\-./0-9:A-Z\]_a-z]$/u;

/** Characters that gnulib treats as special to a shell anywhere in a word. */
const SHELL_SPECIAL: ReadonlySet<string> = new Set(Array.from('!"$&()*;<=>[^`|?\\'));

/**
 * How gnulib's shell quoting sees one character: whether it makes the name need quotes, and
 * whether it still allows writing a name with an apostrophe in double quotes (`"it's"`).
 */
interface ShellCharacter {
  readonly needsQuotes: boolean;
  readonly apostropheFriendly: boolean;
}

const PLAIN: ShellCharacter = { needsQuotes: false, apostropheFriendly: true };
const PLAIN_UNFRIENDLY: ShellCharacter = { needsQuotes: false, apostropheFriendly: false };
const QUOTED: ShellCharacter = { needsQuotes: true, apostropheFriendly: true };
const QUOTED_UNFRIENDLY: ShellCharacter = { needsQuotes: true, apostropheFriendly: false };

/**
 * Classifies `character` at the code point `index` of `text` like the `switch` of gnulib's
 * `quotearg_buffer_restyled`: `{` and `}` matter only as the whole name, `#` and `~` only at the
 * start; other printable characters (also `@` and letters outside ASCII) need no quotes.
 */
function shellCharacter(character: string, index: number, text: string): ShellCharacter {
  if (SHELL_SAFE.test(character)) {
    return PLAIN;
  }
  switch (character) {
    case "{":
    case "}":
      return text === character ? QUOTED : PLAIN_UNFRIENDLY;
    case "#":
    case "~":
      return index === 0 ? QUOTED : PLAIN_UNFRIENDLY;
    case " ":
    case "'":
      return QUOTED;
    default:
      if (SHELL_SPECIAL.has(character) || escapeSequence(character) !== undefined) {
        return QUOTED_UNFRIENDLY;
      }
      return PLAIN;
  }
}

/**
 * Returns `text` quoted for a shell like gnulib's `shell_escape_always_quoting_style`, as the
 * coreutils' `quoteaf` writes file names in messages:
 *
 * - The name goes into single quotes: `'my file'`. A single quote inside becomes `'\''`.
 * - A name with a single quote and otherwise only harmless characters (letters, digits,
 *   `%+,-./:]_@`, spaces, a leading `#` or `~`) goes into double quotes instead: `"it's"`.
 * - Characters that are not printable become ANSI-C escapes in `$'…'`: a newline in `a⏎b`
 *   gives `'a'$'\n''b'`; other control characters give octal escapes of their bytes (`\033`).
 */
export function shellQuoteAlways(text: string): string {
  const characters = Array.from(text);
  const friendly = characters.every(
    (character, index) => shellCharacter(character, index, text).apostropheFriendly,
  );
  if (friendly && characters.includes("'")) {
    return `"${text}"`;
  }
  let quoted = "'";
  let inEscapes = false;
  for (const character of characters) {
    const escape = escapeSequence(character);
    if (escape !== undefined) {
      if (!inEscapes) {
        quoted += "'$'";
        inEscapes = true;
      }
      quoted += escape;
    } else if (character === "'") {
      quoted += "'\\''";
      inEscapes = false;
    } else {
      if (inEscapes) {
        quoted += "''";
        inEscapes = false;
      }
      quoted += character;
    }
  }
  return `${quoted}'`;
}

/**
 * Returns `text` as gnulib's `shell_escape_quoting_style` writes it, the style of `ls` on a
 * terminal: unchanged if a shell reads it back as it is, else quoted like `shellQuoteAlways`.
 * A name needs quotes if it is empty or has a space, a single quote, one of
 * ``!"$&()*;<=>[\^`|?``, a leading `#` or `~`, is `{` or `}` alone, or has a character that is
 * not printable. The characters in `alsoQuote` need quotes too (`ls` adds `:` for the names of
 * directories it lists).
 */
export function shellQuote(text: string, alsoQuote = ""): string {
  const needsQuotes =
    text === "" ||
    Array.from(text).some(
      (character, index) =>
        shellCharacter(character, index, text).needsQuotes || alsoQuote.includes(character),
    );
  return needsQuotes ? shellQuoteAlways(text) : text;
}
