// Lexer of the shell (ADR 0007, ADR 0044): turns one input text into tokens like bash. Words
// keep their parts with the information whether each part was quoted, because the interpreter
// may only expand tildes and globs and split words where the input was not quoted. The lexer
// knows every bash operator, so that words end exactly where bash ends them; the parser decides
// which of them the game supports. Features the game does not simulate yet stop the lexer with
// an "unsupported" error instead of being read wrongly.

/** Operators that end or connect commands, and the parentheses of subshells. */
export type ControlOperator =
  "&&" | "||" | ";;&" | ";;" | ";&" | "|&" | "&" | ";" | "|" | "(" | ")";

/** Operators that redirect input or output. */
export type RedirectionOperator =
  "<<<" | "<<-" | "<<" | "<>" | "<&" | "<" | "&>>" | "&>" | ">>" | ">&" | ">|" | ">";

/** Text of a word. `quoted` is true for text from single or double quotes or after a backslash. */
export interface TextPart {
  readonly kind: "text";
  readonly text: string;
  readonly quoted: boolean;
}

/**
 * A parameter: `$name`, `${name}`, a positional parameter (`$1`, `${10}`) or a special parameter
 * (`$?`, `$$`, `$!`, `$#`, `$@`, `$*`, `$-`, `$0`). `quoted` is true inside double quotes.
 */
export interface ParameterPart {
  readonly kind: "parameter";
  readonly name: string;
  readonly quoted: boolean;
}

/**
 * A tilde prefix at the start of a word: `~` (empty `user`), `~name`, `~+` or `~-`. It ends before
 * the first slash. The interpreter expands it; an unknown user name stays literal text.
 */
export interface TildePart {
  readonly kind: "tilde";
  readonly user: string;
}

/** One part of a word. Adjacent text parts with the same `quoted` value are merged. */
export type WordPart = TextPart | ParameterPart | TildePart;

/** Where a token was found: offsets into the input, `end` exclusive, and the source text. */
interface TokenSource {
  readonly start: number;
  readonly end: number;
  readonly raw: string;
}

/** A word with its parts. Quotes, backslashes and line continuations are removed from the parts. */
export interface WordToken extends TokenSource {
  readonly kind: "word";
  readonly parts: readonly WordPart[];
}

/** A control operator such as `|`, `&&` or `;`. */
export interface ControlToken extends TokenSource {
  readonly kind: "control";
  readonly operator: ControlOperator;
}

/**
 * A redirection operator. `fd` holds the digits directly before a `<` or `>` operator (`2>`), as
 * written; the interpreter checks the range of the file descriptor.
 */
export interface RedirectionToken extends TokenSource {
  readonly kind: "redirection";
  readonly operator: RedirectionOperator;
  readonly fd: string | undefined;
}

/** An unquoted line break; it ends a command like `;`. */
export interface NewlineToken extends TokenSource {
  readonly kind: "newline";
}

/** One token of the input. */
export type Token = WordToken | ControlToken | RedirectionToken | NewlineToken;

/**
 * What the input still needs: a closing quote, the `}` of `${`, or another line after a
 * backslash at the very end. An interactive shell asks for the next line; at the end of a
 * script bash reports "unexpected EOF while looking for matching …".
 */
export type MissingInput = "single-quote" | "double-quote" | "closing-brace" | "next-line";

/** Bash features that the game does not simulate yet. The UI explains them with a game notice. */
export type UnsupportedFeature =
  | "command-substitution"
  | "arithmetic-expansion"
  | "parameter-expansion"
  | "process-substitution"
  | "ansi-c-quoting"
  | "locale-quoting"
  | "history-expansion";

/** Why the input could not be split into tokens. `start` is the offset where the problem begins. */
export type LexError =
  | { readonly kind: "incomplete"; readonly missing: MissingInput; readonly start: number }
  | { readonly kind: "unsupported"; readonly feature: UnsupportedFeature; readonly start: number };

/** The result of `lex`: all tokens of the input, or the first error. */
export type LexResult =
  | { readonly ok: true; readonly tokens: readonly Token[] }
  | { readonly ok: false; readonly error: LexError };

type Operator =
  | { readonly kind: "control"; readonly operator: ControlOperator }
  | { readonly kind: "redirection"; readonly operator: RedirectionOperator };

/** Every operator of bash, longest first, so that the first match is the longest. */
const OPERATORS: readonly Operator[] = [
  { kind: "control", operator: ";;&" },
  { kind: "redirection", operator: "<<<" },
  { kind: "redirection", operator: "<<-" },
  { kind: "redirection", operator: "&>>" },
  { kind: "control", operator: "&&" },
  { kind: "control", operator: "||" },
  { kind: "control", operator: ";;" },
  { kind: "control", operator: ";&" },
  { kind: "control", operator: "|&" },
  { kind: "redirection", operator: "<<" },
  { kind: "redirection", operator: "<>" },
  { kind: "redirection", operator: "<&" },
  { kind: "redirection", operator: "&>" },
  { kind: "redirection", operator: ">>" },
  { kind: "redirection", operator: ">&" },
  { kind: "redirection", operator: ">|" },
  { kind: "control", operator: "&" },
  { kind: "control", operator: ";" },
  { kind: "control", operator: "|" },
  { kind: "control", operator: "(" },
  { kind: "control", operator: ")" },
  { kind: "redirection", operator: "<" },
  { kind: "redirection", operator: ">" },
];

/** Characters that start an operator and end a word. */
const OPERATOR_START = new Set(["|", "&", ";", "(", ")", "<", ">"]);

/** Special parameters that consist of one character after `$`. */
const SPECIAL_PARAMETERS = new Set(["?", "$", "!", "#", "@", "*", "-"]);

/** Characters after `!` that keep bash from starting a history expansion. */
const HISTORY_SAFE_FOLLOWERS = new Set(["", " ", "\t", "\n", "=", "("]);

/** Characters that cannot be part of a tilde prefix that bash expands. */
const TILDE_PREFIX_STOPPERS = new Set(["'", '"', "\\", "$", "`", "!"]);

const NAME_START = /^[A-Za-z_]$/;
const NAME_CHARACTER = /^[A-Za-z0-9_]$/;
const DIGITS = /^[0-9]+$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Carries a lex error from deep inside the lexer to `lex`, which returns it as a value. */
class LexFailure extends Error {
  constructor(readonly error: LexError) {
    super(`lex error: ${error.kind}`);
  }
}

/** The word that is being read: where it started and its parts so far. */
interface OpenWord {
  readonly start: number;
  readonly parts: WordPart[];
}

/**
 * Splits `input` into tokens like bash:
 *
 * - blanks (space, tab) separate words; an unquoted line break becomes a `newline` token;
 * - `#` at the start of a word starts a comment up to the end of the line;
 * - single quotes keep everything literally; double quotes keep everything except `$` and the
 *   backslash before `$`, `` ` ``, `"`, `\` and a line break;
 * - an unquoted backslash quotes the next character; a backslash before a line break removes
 *   both (line continuation);
 * - `$name`, `${name}`, positional and special parameters become parameter parts;
 * - an unquoted `~` at the start of a word becomes a tilde part (up to the first slash) if the
 *   prefix contains no quotes or expansions;
 * - the longest bash operator wins (`>>` before `>`); digits directly before `<` or `>` become
 *   the file descriptor of the redirection.
 *
 * Unterminated quotes, an unterminated `${` and a backslash at the end of the input give an
 * "incomplete" error. Command substitution, arithmetic expansion, parameter expansion with
 * operators (`${x:-y}`), process substitution, `$'…'`, `$"…"` and history expansion (`!!`) give
 * an "unsupported" error. Tildes after `=` in assignments are found by the parser.
 */
export function lex(input: string): LexResult {
  try {
    return { ok: true, tokens: new Lexer(input).run() };
  } catch (failure) {
    if (failure instanceof LexFailure) {
      return { ok: false, error: failure.error };
    }
    throw failure;
  }
}

class Lexer {
  private readonly tokens: Token[] = [];
  private position = 0;
  private word: OpenWord | undefined;
  /** How many non-empty parts were appended so far; tells whether `""` had any content. */
  private contentCount = 0;

  constructor(private readonly input: string) {}

  run(): readonly Token[] {
    while (this.position < this.input.length) {
      this.step();
    }
    this.finishWord();
    return this.tokens;
  }

  private char(offset = 0): string {
    return this.input.charAt(this.position + offset);
  }

  private step(): void {
    const c = this.char();
    if (c === " " || c === "\t") {
      this.finishWord();
      this.position += 1;
    } else if (c === "\n") {
      this.finishWord();
      this.pushNewline();
    } else if (c === "#" && this.word === undefined) {
      this.skipComment();
    } else if (OPERATOR_START.has(c)) {
      this.readOperator();
    } else if (c === "\\") {
      this.readBackslash();
    } else if (c === "'") {
      this.readSingleQuoted();
    } else if (c === '"') {
      this.readDoubleQuoted();
    } else if (c === "$") {
      this.readDollar(false);
    } else if (c === "`") {
      this.fail({ kind: "unsupported", feature: "command-substitution", start: this.position });
    } else if (c === "!") {
      this.readExclamationMark(false);
    } else if (c === "~" && this.word === undefined) {
      this.readTilde();
    } else {
      this.appendText(c, false);
      this.position += 1;
    }
  }

  private fail(error: LexError): never {
    throw new LexFailure(error);
  }

  private openWord(): OpenWord {
    this.word ??= { start: this.position, parts: [] };
    return this.word;
  }

  private appendText(text: string, quoted: boolean): void {
    if (text !== "") {
      this.contentCount += 1;
    }
    const parts = this.openWord().parts;
    const last = parts.at(-1);
    if (last?.kind === "text" && last.quoted === quoted) {
      parts[parts.length - 1] = { kind: "text", text: last.text + text, quoted };
    } else {
      parts.push({ kind: "text", text, quoted });
    }
  }

  private finishWord(): void {
    const word = this.word;
    if (word === undefined) {
      return;
    }
    this.word = undefined;
    this.tokens.push({
      kind: "word",
      parts: word.parts,
      start: word.start,
      end: this.position,
      raw: this.input.slice(word.start, this.position),
    });
  }

  private pushNewline(): void {
    const start = this.position;
    this.position += 1;
    this.tokens.push({ kind: "newline", start, end: this.position, raw: "\n" });
  }

  private skipComment(): void {
    const lineEnd = this.input.indexOf("\n", this.position);
    this.position = lineEnd === -1 ? this.input.length : lineEnd;
  }

  private readOperator(): void {
    const start = this.position;
    const match = OPERATORS.find(({ operator }) => this.input.startsWith(operator, start));
    if (match === undefined) {
      throw new Error(`no operator starts at offset ${String(start)}`);
    }
    const end = start + match.operator.length;
    if ((match.operator === "<" || match.operator === ">") && this.input.charAt(end) === "(") {
      this.fail({ kind: "unsupported", feature: "process-substitution", start });
    }
    if (match.kind === "control") {
      this.finishWord();
      this.position = end;
      this.tokens.push({
        kind: "control",
        operator: match.operator,
        start,
        end,
        raw: match.operator,
      });
      return;
    }
    const fd = this.takeFileDescriptor(match.operator);
    const tokenStart = fd === undefined ? start : start - fd.length;
    this.finishWord();
    this.position = end;
    this.tokens.push({
      kind: "redirection",
      operator: match.operator,
      fd,
      start: tokenStart,
      end,
      raw: this.input.slice(tokenStart, end),
    });
  }

  /** Takes the open word as the file descriptor of `operator` if it is only unquoted digits. */
  private takeFileDescriptor(operator: RedirectionOperator): string | undefined {
    const word = this.word;
    if (word === undefined || operator.startsWith("&")) {
      return undefined;
    }
    const raw = this.input.slice(word.start, this.position);
    if (!DIGITS.test(raw)) {
      return undefined;
    }
    this.word = undefined;
    return raw;
  }

  private readBackslash(): void {
    const next = this.char(1);
    if (next === "") {
      this.fail({ kind: "incomplete", missing: "next-line", start: this.position });
    }
    if (next !== "\n") {
      this.appendText(next, true);
    }
    this.position += 2;
  }

  private readSingleQuoted(): void {
    const start = this.position;
    const close = this.input.indexOf("'", start + 1);
    if (close === -1) {
      this.fail({ kind: "incomplete", missing: "single-quote", start });
    }
    this.appendText(this.input.slice(start + 1, close), true);
    this.position = close + 1;
  }

  private readDoubleQuoted(): void {
    const start = this.position;
    const contentBefore = this.contentCount;
    this.openWord();
    this.position += 1;
    for (;;) {
      const c = this.char();
      if (c === "") {
        this.fail({ kind: "incomplete", missing: "double-quote", start });
      } else if (c === '"') {
        if (this.contentCount === contentBefore) {
          // `""` is an empty argument, so the word needs a part even without content.
          this.appendText("", true);
        }
        this.position += 1;
        return;
      } else if (c === "\\") {
        this.readBackslashInDoubleQuotes(start);
      } else if (c === "$") {
        this.readDollar(true);
      } else if (c === "`") {
        this.fail({ kind: "unsupported", feature: "command-substitution", start: this.position });
      } else if (c === "!") {
        this.readExclamationMark(true);
      } else {
        this.appendText(c, true);
        this.position += 1;
      }
    }
  }

  private readBackslashInDoubleQuotes(quoteStart: number): void {
    const next = this.char(1);
    if (next === "") {
      this.fail({ kind: "incomplete", missing: "double-quote", start: quoteStart });
    }
    if (next === "$" || next === "`" || next === '"' || next === "\\") {
      this.appendText(next, true);
    } else if (next !== "\n") {
      // Bash keeps the backslash before other characters, also before "!", where it stops the
      // history expansion.
      this.appendText(`\\${next}`, true);
    }
    this.position += 2;
  }

  private readDollar(quoted: boolean): void {
    const start = this.position;
    const next = this.char(1);
    if (next === "(") {
      const feature = this.char(2) === "(" ? "arithmetic-expansion" : "command-substitution";
      this.fail({ kind: "unsupported", feature, start });
    } else if (next === "[") {
      this.fail({ kind: "unsupported", feature: "arithmetic-expansion", start });
    } else if (next === "{") {
      this.readBracedParameter(quoted);
    } else if (NAME_START.test(next)) {
      let end = start + 2;
      while (NAME_CHARACTER.test(this.input.charAt(end))) {
        end += 1;
      }
      this.appendParameter(this.input.slice(start + 1, end), quoted, end);
    } else if (DIGITS.test(next) || SPECIAL_PARAMETERS.has(next)) {
      this.appendParameter(next, quoted, start + 2);
    } else if (!quoted && next === "'") {
      this.fail({ kind: "unsupported", feature: "ansi-c-quoting", start });
    } else if (!quoted && next === '"') {
      this.fail({ kind: "unsupported", feature: "locale-quoting", start });
    } else {
      this.appendText("$", quoted);
      this.position += 1;
    }
  }

  private readBracedParameter(quoted: boolean): void {
    const start = this.position;
    const close = this.input.indexOf("}", start + 2);
    if (close === -1) {
      this.fail({ kind: "incomplete", missing: "closing-brace", start });
    }
    const name = this.input.slice(start + 2, close);
    if (!NAME.test(name) && !DIGITS.test(name) && !SPECIAL_PARAMETERS.has(name)) {
      this.fail({ kind: "unsupported", feature: "parameter-expansion", start });
    }
    this.appendParameter(name, quoted, close + 1);
  }

  private appendParameter(name: string, quoted: boolean, end: number): void {
    this.contentCount += 1;
    this.openWord().parts.push({ kind: "parameter", name, quoted });
    this.position = end;
  }

  /**
   * Interactive bash starts a history expansion at "!" unless a blank, a line break, "=", "(" or
   * the end of the input follows, or, inside double quotes, the closing quote.
   */
  private readExclamationMark(quoted: boolean): void {
    const next = this.char(1);
    if (!HISTORY_SAFE_FOLLOWERS.has(next) && !(quoted && next === '"')) {
      this.fail({ kind: "unsupported", feature: "history-expansion", start: this.position });
    }
    this.appendText("!", quoted);
    this.position += 1;
  }

  /** Reads `~` at the start of a word: a tilde part if the prefix is plain text, else text. */
  private readTilde(): void {
    let end = this.position + 1;
    for (;;) {
      const c = this.input.charAt(end);
      if (c === "" || c === "/" || c === " " || c === "\t" || c === "\n" || OPERATOR_START.has(c)) {
        break;
      }
      if (TILDE_PREFIX_STOPPERS.has(c)) {
        this.appendText("~", false);
        this.position += 1;
        return;
      }
      end += 1;
    }
    this.openWord().parts.push({ kind: "tilde", user: this.input.slice(this.position + 1, end) });
    this.position = end;
  }
}
