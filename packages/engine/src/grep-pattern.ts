// GNU grep's patterns (ADR 0064): basic (BRE, `grep -G`) and extended (ERE, `grep -E`) regular
// expressions with the GNU extensions, translated into JavaScript regular expressions. grep
// checks a pattern with glibc's regcomp (whose messages it prints, such as "Unmatched [, [^, [:,
// [., or [=") and then parses it with gnulib's dfa, which warns about stray backslashes and
// repetitions at the start (grep 3.8 and later). Whether a line contains a match does not depend
// on POSIX's leftmost-longest rule, so JavaScript's backtracking finds the same lines.

/** The syntax of a pattern: basic (`-G`, the default) or extended (`-E`). */
export type PatternSyntax = "basic" | "extended";

/**
 * A translated pattern: the JavaScript source (for the flags `u`, plus `i` for `-i`) and the
 * warnings grep writes for it, or the error after which grep exits with status 2. A `dfa`
 * error comes from gnulib's dfa, which grep reaches only after glibc accepted every pattern.
 */
export type PatternTranslation =
  | { readonly ok: true; readonly source: string; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly stage: "regcomp" | "dfa"; readonly error: string };

/** glibc's `RE_DUP_MAX`, the largest count of an interval. */
const DUP_MAX = 0x7fff;

/** The characters that make up words for `\w`, `\<`, `\>`, `\b` and `grep -w`. */
export const WORD_CHARACTER = "[\\p{L}\\p{N}_]";

/** The contents of the character classes in a JavaScript class, as glibc's UTF-8 locales sort them. */
const CHARACTER_CLASSES: Readonly<Record<string, string>> = {
  alpha: "\\p{L}",
  upper: "\\p{Lu}",
  lower: "\\p{Ll}",
  digit: "0-9",
  xdigit: "0-9A-Fa-f",
  alnum: "\\p{L}\\p{N}",
  space: "\\t\\n\\v\\f\\r \\u1680\\u2000-\\u2006\\u2008-\\u200a\\u2028\\u2029\\u205f\\u3000",
  blank: "\\t \\u1680\\u2000-\\u2006\\u2008-\\u200a\\u205f\\u3000",
  punct: "\\p{P}\\p{S}",
  graph: "\\p{L}\\p{M}\\p{N}\\p{P}\\p{S}",
  print: "\\p{L}\\p{M}\\p{N}\\p{P}\\p{S}\\p{Zs}",
  cntrl: "\\p{Cc}\\u2028\\u2029",
};

/** The messages of glibc's regcomp. */
const MESSAGES = {
  bracket: "Unmatched [, [^, [:, [., or [=",
  paren: "Unmatched ( or \\(",
  rightParen: "Unmatched ) or \\)",
  brace: "Unmatched \\{",
  badInterval: "Invalid content of \\{\\}",
  range: "Invalid range end",
  className: "Invalid character class name",
  collation: "Invalid collation character",
  escape: "Trailing backslash",
  backReference: "Invalid back reference",
  tooBig: "Regular expression too big",
} as const;

/** The characters after a backslash that dfa does not call stray (see dfa.c's `lex`). */
const KNOWN_ESCAPES = new Set([
  "\\",
  "^",
  "$",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "`",
  "'",
  "<",
  ">",
  "b",
  "B",
  "?",
  "*",
  "+",
  "{",
  "|",
  "(",
  ")",
  ".",
  "s",
  "S",
  "w",
  "W",
  "[",
  "\n",
]);

/** A parse error: which stage reports it and its message. */
class PatternError extends Error {
  constructor(
    readonly stage: "regcomp" | "dfa",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Translates the GNU regular expression `pattern` (one line of grep's patterns) in `syntax`.
 * The result matches the same lines as grep, with these rules of glibc and dfa:
 *
 * - `.` matches any character; `[...]` are bracket expressions with ranges, `[:class:]`,
 *   `[=c=]` and `[.c.]`; a backslash in them is an ordinary character.
 * - Basic: `\(` `\)` group, `\|` alternates, `*`, `\+`, `\?` and `\{m,n\}` repeat; `*` at the
 *   start of an expression is an ordinary character; `^` anchors only at the start (or after
 *   `\(` or `\|`) and `$` only at the end (or before `\)` or `\|`).
 * - Extended: `(` `)` `|` `*` `+` `?` `{m,n}`; a repetition at the start is ignored with a
 *   warning (`* at start of expression`); `{` that does not start a valid interval is ordinary.
 * - Both: `\1` to `\9` refer to a group that is already closed; `\<` `\>` `\b` `\B` match at word
 *   edges; `\w` `\W` `\s` `\S` are classes; `` \` `` and `\'` anchor. A backslash before another
 *   character makes it ordinary, with the warning `stray \ before C`.
 */
export function translatePattern(pattern: string, syntax: PatternSyntax): PatternTranslation {
  const parser = new PatternParser(Array.from(pattern), syntax);
  try {
    return { ok: true, source: parser.parse(), warnings: parser.warnings };
  } catch (failure) {
    if (failure instanceof PatternError) {
      return { ok: false, stage: failure.stage, error: failure.message };
    }
    throw failure;
  }
}

/** Escapes `pattern` as a literal for `grep -F`. */
export function literalSource(pattern: string): string {
  return Array.from(pattern, literal).join("");
}

/** One piece of a branch: its JavaScript source and whether a repetition may follow it. */
interface Piece {
  readonly source: string;
  /** Whether the piece is one character or class, which a quantifier can follow directly. */
  readonly simple: boolean;
  /** Whether the piece is an anchor or assertion, after which an expression starts again. */
  readonly anchor: boolean;
}

class PatternParser {
  readonly warnings: string[] = [];
  private index = 0;
  /** The number of groups opened so far, which numbers the next group. */
  private groups = 0;
  /** The groups that are closed, which back-references may name. */
  private readonly closed = new Set<number>();
  private depth = 0;

  constructor(
    private readonly characters: readonly string[],
    private readonly syntax: PatternSyntax,
  ) {}

  parse(): string {
    const source = this.alternation();
    if (this.index < this.characters.length) {
      // Only a closing parenthesis ends an alternation early.
      throw new PatternError("regcomp", MESSAGES.rightParen);
    }
    return source;
  }

  private get extended(): boolean {
    return this.syntax === "extended";
  }

  private peek(offset = 0): string | undefined {
    return this.characters[this.index + offset];
  }

  /** Whether the next characters are the alternation operator (`\|` or `|`). */
  private atAlternation(): boolean {
    return this.extended ? this.peek() === "|" : this.peek() === "\\" && this.peek(1) === "|";
  }

  /** Whether the next characters close a group (`\)` or `)`). */
  private atClose(): boolean {
    return this.extended ? this.peek() === ")" : this.peek() === "\\" && this.peek(1) === ")";
  }

  private alternation(): string {
    const branches = [this.branch()];
    while (this.atAlternation()) {
      this.index += this.extended ? 1 : 2;
      branches.push(this.branch());
    }
    return branches.join("|");
  }

  private branch(): string {
    const pieces: Piece[] = [];
    let start = true;
    while (this.index < this.characters.length && !this.atAlternation()) {
      if (this.atClose()) {
        if (this.depth > 0) {
          break;
        }
        throw new PatternError("regcomp", MESSAGES.rightParen);
      }
      const repeated = this.repetition(pieces, start);
      if (repeated) {
        continue;
      }
      const piece = this.atom(start, pieces.length === 0);
      pieces.push(piece);
      start = piece.anchor;
    }
    return pieces.map((piece) => piece.source).join("");
  }

  /**
   * Reads a repetition operator at the current position and applies it to the last piece.
   * Returns false if there is none (or it is an ordinary character here).
   */
  private repetition(pieces: Piece[], start: boolean): boolean {
    const operator = this.readRepetition();
    if (operator === undefined) {
      return false;
    }
    const last = pieces.at(-1);
    if (start || last === undefined) {
      if (!this.extended) {
        // In a basic expression the operator is an ordinary character at the start.
        this.index = operator.start;
        return false;
      }
      this.warnings.push(`${operator.name} at start of expression`);
      return true;
    }
    const target = last.simple ? last.source : `(?:${last.source})`;
    pieces[pieces.length - 1] = {
      source: target + operator.quantifier,
      simple: false,
      anchor: false,
    };
    return true;
  }

  /** The repetition operator at the current position, consumed, or undefined. */
  private readRepetition():
    { readonly quantifier: string; readonly name: string; readonly start: number } | undefined {
    const start = this.index;
    const first = this.peek();
    if (first === "*") {
      this.index++;
      return { quantifier: "*", name: "*", start };
    }
    const escaped = first === "\\";
    const operator = escaped ? this.peek(1) : first;
    // In basic expressions + ? { are operators after a backslash, in extended ones without.
    if (escaped === this.extended || operator === undefined) {
      return undefined;
    }
    this.index += escaped ? 2 : 1;
    switch (operator) {
      case "+":
        return { quantifier: "+", name: "+", start };
      case "?":
        return { quantifier: "?", name: "?", start };
      case "{": {
        const interval = this.interval();
        if (interval === undefined) {
          this.index = start;
          return undefined;
        }
        return { quantifier: interval, name: "{...}", start };
      }
      default:
        this.index = start;
        return undefined;
    }
  }

  /**
   * Reads the rest of an interval after `{` or `\{` like glibc's `parse_dup_op`: `{m}`, `{m,}`,
   * `{m,n}` or `{,n}`. In an extended expression an invalid interval makes `{` ordinary
   * (`undefined`); in a basic one it is an error.
   */
  private interval(): string | undefined {
    const minimum = this.number();
    let maximum: number | undefined = minimum;
    let comma = false;
    if (this.peek() === ",") {
      comma = true;
      this.index++;
      maximum = this.number();
    }
    const close = this.extended
      ? this.peek() === "}"
      : this.peek() === "\\" && this.peek(1) === "}";
    if ((minimum === undefined && !comma) || !close) {
      if (this.extended) {
        return undefined;
      }
      throw new PatternError(
        "regcomp",
        this.index >= this.characters.length ? MESSAGES.brace : MESSAGES.badInterval,
      );
    }
    this.index += this.extended ? 1 : 2;
    const low = minimum ?? 0;
    if (maximum !== undefined && maximum < low) {
      throw new PatternError("regcomp", MESSAGES.badInterval);
    }
    if (DUP_MAX < (maximum ?? low)) {
      throw new PatternError("regcomp", MESSAGES.tooBig);
    }
    if (!comma) {
      return `{${String(low)}}`;
    }
    return maximum === undefined ? `{${String(low)},}` : `{${String(low)},${String(maximum)}}`;
  }

  /** Decimal digits at the current position, or undefined if there are none. */
  private number(): number | undefined {
    let digits = "";
    while (isDigit(this.peek())) {
      digits += this.peek() ?? "";
      this.index++;
    }
    return digits === "" ? undefined : Math.min(Number(digits), DUP_MAX + 1);
  }

  /** One atom: a character, a class, a group, an anchor or an escape. */
  private atom(start: boolean, first: boolean): Piece {
    const character = this.peek() ?? "";
    this.index++;
    switch (character) {
      case ".":
        return simple("[^\\n]");
      case "[":
        return simple(this.bracket());
      case "^":
        if (this.extended || first || start) {
          return assertion("^");
        }
        return simple(literal("^"));
      case "$":
        if (this.extended || this.atEndOfBranch()) {
          return assertion("$");
        }
        return simple(literal("$"));
      case "\\":
        return this.escape();
      default:
        if (this.extended && character === "(") {
          return this.group();
        }
        return simple(literal(character));
    }
  }

  /** Whether the branch ends after the current position (for `$` in basic expressions). */
  private atEndOfBranch(): boolean {
    return this.index >= this.characters.length || this.atAlternation() || this.atClose();
  }

  private group(): Piece {
    this.groups++;
    const number = this.groups;
    this.depth++;
    const inner = this.alternation();
    if (!this.atClose()) {
      throw new PatternError("regcomp", MESSAGES.paren);
    }
    this.index += this.extended ? 1 : 2;
    this.depth--;
    this.closed.add(number);
    return { source: `(${inner})`, simple: false, anchor: false };
  }

  private escape(): Piece {
    const next = this.peek();
    if (next === undefined) {
      throw new PatternError("regcomp", MESSAGES.escape);
    }
    this.index++;
    if (!this.extended && next === "(") {
      return this.group();
    }
    if (isDigit(next) && next !== "0") {
      const number = Number(next);
      if (!this.closed.has(number)) {
        throw new PatternError("regcomp", MESSAGES.backReference);
      }
      // In a group, so that a digit after it is not read as part of the number.
      return { source: `(?:\\${next})`, simple: true, anchor: false };
    }
    switch (next) {
      case "<":
        return assertion(`(?<!${WORD_CHARACTER})(?=${WORD_CHARACTER})`);
      case ">":
        return assertion(`(?<=${WORD_CHARACTER})(?!${WORD_CHARACTER})`);
      case "b":
        return assertion(
          `(?:(?<!${WORD_CHARACTER})(?=${WORD_CHARACTER})|(?<=${WORD_CHARACTER})(?!${WORD_CHARACTER}))`,
        );
      case "B":
        return assertion(
          `(?:(?<=${WORD_CHARACTER})(?=${WORD_CHARACTER})|(?<!${WORD_CHARACTER})(?!${WORD_CHARACTER}))`,
        );
      case "`":
        return assertion("^");
      case "'":
        return assertion("$");
      case "w":
        return simple(WORD_CHARACTER);
      case "W":
        return simple("[^\\p{L}\\p{N}_]");
      case "s":
        return simple(`[${CHARACTER_CLASSES["space"] ?? ""}]`);
      case "S":
        return simple(`[^${CHARACTER_CLASSES["space"] ?? ""}]`);
      default:
        break;
    }
    if (!KNOWN_ESCAPES.has(next)) {
      this.warnings.push(strayWarning(next));
    }
    return simple(literal(next));
  }

  /** A bracket expression after `[`, as a JavaScript class. */
  private bracket(): string {
    let negated = false;
    if (this.peek() === "^") {
      negated = true;
      this.index++;
    }
    const itemsStart = this.index;
    const items: string[] = [];
    let firstItem = true;
    for (;;) {
      const character = this.peek();
      if (character === undefined) {
        throw new PatternError("regcomp", MESSAGES.bracket);
      }
      if (character === "]" && !firstItem) {
        this.index++;
        break;
      }
      firstItem = false;
      const low = this.bracketElement();
      if (low.kind === "class") {
        items.push(low.source);
        continue;
      }
      if (this.peek() === "-" && this.peek(1) !== undefined && this.peek(1) !== "]") {
        this.index++;
        const high = this.bracketElement();
        if (high.kind === "class" || codePoint(high.character) < codePoint(low.character)) {
          throw new PatternError("regcomp", MESSAGES.range);
        }
        items.push(`${classLiteral(low.character)}-${classLiteral(high.character)}`);
      } else {
        items.push(classLiteral(low.character));
      }
    }
    const raw = this.characters.slice(itemsStart, this.index - 1).join("");
    if (/^:[^[\]-]+:$/u.test(raw)) {
      throw new PatternError("dfa", "character class syntax is [[:space:]], not [:space:]");
    }
    return `[${negated ? "^" : ""}${items.join("")}]`;
  }

  /** One element of a bracket expression: a character (also `[=c=]`, `[.c.]`) or a class. */
  private bracketElement():
    | { readonly kind: "character"; readonly character: string }
    | { readonly kind: "class"; readonly source: string } {
    const character = this.peek() ?? "";
    const kind = this.peek(1);
    if (character === "[" && (kind === ":" || kind === "=" || kind === ".")) {
      const end = this.findClosing(kind);
      const name = this.characters.slice(this.index + 2, end).join("");
      this.index = end + 2;
      if (kind === ":") {
        const source = CHARACTER_CLASSES[name];
        if (source === undefined) {
          throw new PatternError("regcomp", MESSAGES.className);
        }
        return { kind: "class", source };
      }
      const elements = Array.from(name);
      if (elements.length !== 1) {
        throw new PatternError("regcomp", MESSAGES.collation);
      }
      return { kind: "character", character: elements[0] ?? "" };
    }
    this.index++;
    return { kind: "character", character };
  }

  /** The index of the `:]`, `=]` or `.]` that closes the element starting at the current index. */
  private findClosing(kind: string): number {
    for (let index = this.index + 2; index + 1 < this.characters.length; index++) {
      if (this.characters[index] === kind && this.characters[index + 1] === "]") {
        return index;
      }
    }
    throw new PatternError("regcomp", MESSAGES.bracket);
  }
}

function simple(source: string): Piece {
  return { source, simple: true, anchor: false };
}

function assertion(source: string): Piece {
  return { source, simple: false, anchor: true };
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function codePoint(character: string): number {
  return character.codePointAt(0) ?? 0;
}

/** The characters that need a backslash in a JavaScript pattern with the `u` flag. */
const SYNTAX_CHARACTERS = new Set([
  "^",
  "$",
  "\\",
  ".",
  "*",
  "+",
  "?",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "|",
  "/",
]);

/** `character` as a literal outside a class. */
function literal(character: string): string {
  return SYNTAX_CHARACTERS.has(character) ? `\\${character}` : character;
}

/** `character` as a literal inside a class. */
function classLiteral(character: string): string {
  return ["\\", "]", "[", "^", "-"].includes(character) ? `\\${character}` : character;
}

/** dfa's warning for a backslash before an ordinary character. */
function strayWarning(character: string): string {
  if (/^[\p{Cc}\p{Cn}\p{Cs}\p{Zl}\p{Zp}]$/u.test(character)) {
    return "stray \\ before unprintable character";
  }
  if (/^[\t\n\v\f\r \u1680\u2000-\u2006\u2008-\u200a\u205f\u3000]$/u.test(character)) {
    return "stray \\ before white space";
  }
  return `stray \\ before ${character}`;
}
