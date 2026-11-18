// ICU MessageFormat for catalog texts (ADR 0012, ADR 0072). Texts are parsed with
// `@formatjs/icu-messageformat-parser` and formatted with `intl-messageformat`, with three
// rules that suit texts about the shell:
//
// - Code spans (`` `awk '{print $1}'` ``) are never read as ICU: before parsing, each code span
//   becomes a placeholder of its own, so braces, `#` and apostrophes inside code stay as they
//   are.
// - Apostrophes are always literal: every apostrophe outside code is doubled before parsing,
//   so ICU's quoting (`'{'`) does not exist in catalog texts. A literal brace belongs in code.
// - HTML-like tags are text (`ignoreTag`): `<file>` and `a > b` need no escaping.
//
// Formatting returns parts instead of a string: text written in the catalog (which may hold
// markup), values of the game (shown as they are, so a value can never become markup) and
// code. The markup itself is parsed from these parts in ROADMAP M2.3c.

import {
  type MessageFormatElement,
  parse,
  type PluralOrSelectOption,
  TYPE,
} from "@formatjs/icu-messageformat-parser";
import IntlMessageFormat from "intl-messageformat";

/** A text of a catalog and the language it is written in. */
export interface CatalogText {
  /** The language code of the catalog, for example `de` or `pt-br`. */
  readonly language: string;
  /** The text as the catalog holds it. */
  readonly source: string;
}

/** A value shown as code, for example an option name: `{ code: "--color" }`. */
export interface CodeValue {
  readonly code: string;
}

/** A value for a placeholder: text, a number, or code. */
export type TextValue = string | number | CodeValue;

/** The values of a text's placeholders by name. */
export type TextValues = Readonly<Record<string, TextValue>>;

/** A part of a formatted message. */
export type MessagePart =
  /** Text written in the catalog; it may hold markup. */
  | { readonly kind: "markup"; readonly text: string }
  /** The text of a value; shown as it is, never read as markup. */
  | { readonly kind: "text"; readonly text: string }
  /** A code span of the catalog or a code value. */
  | { readonly kind: "code"; readonly text: string };

/** A problem of a text, at a UTF-16 offset into the text. */
export interface MessageProblem {
  readonly offset: number;
  readonly message: string;
}

/** What a text may use. */
export interface MessageRules {
  /** Whether the game passes values to the text, so that it may use placeholders. */
  readonly placeholders: boolean;
}

/** How a placeholder is used, which decides the type of its value. */
type PlaceholderUse = "text" | "number" | "select";

/** A placeholder that is shown as a part of its own: a code span or a simple placeholder. */
type Atom =
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "value"; readonly name: string };

/** A parsed text, ready to be formatted. */
export interface CompiledMessage {
  /** The syntax tree, with locations in `icu`. */
  readonly elements: MessageFormatElement[];
  /** The ICU source that was parsed: the text without code spans, apostrophes doubled. */
  readonly icu: string;
  /** The offset in the original text of an offset in `icu`. */
  readonly at: (icuOffset: number) => number;
  /** The atoms by the number in their internal placeholder name. */
  readonly atoms: readonly Atom[];
  /** How each placeholder of the author is used. */
  readonly uses: ReadonlyMap<string, ReadonlySet<PlaceholderUse>>;
  /** The offset of each placeholder's first use in the text. */
  readonly offsets: ReadonlyMap<string, number>;
}

export type CompileResult =
  | { readonly ok: true; readonly message: CompiledMessage }
  | { readonly ok: false; readonly problems: readonly MessageProblem[] };

/** Names of placeholders written by authors: camelCase, like the game's value names. */
const PLACEHOLDER_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/u;

/**
 * Internal names of atoms. They start with an underscore, which placeholder names of authors
 * cannot, so the two never meet.
 */
const ATOM_PREFIX = "_atom";

/**
 * Messages for the parser's error kinds. The parser reports the name of the kind; kinds that
 * cannot occur here (tags) fall back to a general message.
 */
const PARSER_MESSAGES: Readonly<Record<string, string>> = {
  EXPECT_ARGUMENT_CLOSING_BRACE: 'a placeholder is not closed: "}" is missing',
  EMPTY_ARGUMENT: "a placeholder {} has no name",
  MALFORMED_ARGUMENT:
    "a placeholder is malformed: write {name}, {name, number}, {name, plural, ...} or " +
    "{name, select, ...}",
  EXPECT_ARGUMENT_TYPE:
    "the type of the placeholder is missing after the comma: number, plural, selectordinal " +
    "or select",
  INVALID_ARGUMENT_TYPE: "unknown type of placeholder: use number, plural, selectordinal or select",
  EXPECT_ARGUMENT_STYLE: "the style of the placeholder is missing after the comma",
  INVALID_NUMBER_SKELETON: "the number skeleton is invalid",
  EXPECT_NUMBER_SKELETON: 'the number skeleton is missing after "::"',
  INVALID_DATE_TIME_SKELETON: "the date skeleton is invalid",
  EXPECT_DATE_TIME_SKELETON: 'the date skeleton is missing after "::"',
  UNCLOSED_QUOTE_IN_ARGUMENT_STYLE: "the style of the placeholder has an unclosed quote",
  EXPECT_SELECT_ARGUMENT_OPTIONS:
    "select needs options, for example {kind, select, file {a file} other {something}}",
  EXPECT_SELECT_ARGUMENT_SELECTOR:
    "select needs options, for example {kind, select, file {a file} other {something}}",
  EXPECT_PLURAL_ARGUMENT_SELECTOR:
    "plural needs options, for example {count, plural, one {# file} other {# files}}",
  EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE: "offset: needs a whole number",
  INVALID_PLURAL_ARGUMENT_OFFSET_VALUE: "offset: needs a whole number",
  EXPECT_SELECT_ARGUMENT_SELECTOR_FRAGMENT:
    "an option needs its text in braces, for example file {a file}",
  EXPECT_PLURAL_ARGUMENT_SELECTOR_FRAGMENT:
    "an option needs its text in braces, for example one {# file}",
  INVALID_PLURAL_ARGUMENT_SELECTOR:
    "a plural option is zero, one, two, few, many, other or an exact number like =0",
  DUPLICATE_PLURAL_ARGUMENT_SELECTOR: "a plural option is given twice",
  DUPLICATE_SELECT_ARGUMENT_SELECTOR: "a select option is given twice",
  MISSING_OTHER_CLAUSE: 'the option "other" is missing',
};

/** The locale that `Intl` uses for a language code, or `undefined` if it does not know it. */
export function textLocale(language: string): string | undefined {
  try {
    return Intl.PluralRules.supportedLocalesOf(language)[0];
  } catch {
    // An invalid language tag.
    return undefined;
  }
}

/**
 * Checks a text: code spans, ICU syntax, placeholder names and types, and plural options of
 * the language. Returns no problems for a valid text.
 */
export function checkMessage(
  source: string,
  language: string,
  rules: MessageRules,
): MessageProblem[] {
  const compiled = compileMessage(source, language);
  if (!compiled.ok) {
    return [...compiled.problems];
  }
  if (rules.placeholders) {
    return [];
  }
  return [...compiled.message.offsets].map(([name, offset]) => ({
    offset,
    message: `level texts have no placeholders, because the game passes no values to them: {${name}}`,
  }));
}

/**
 * Formats a text with values. Throws an error if the text is invalid (texts are checked when
 * the content is loaded) or a value is missing or of the wrong type (a mistake of the caller).
 */
export function formatMessage(text: CatalogText, values: TextValues = {}): MessagePart[] {
  const locale = textLocale(text.language);
  if (locale === undefined) {
    throw new Error(`cannot format texts in the unknown language "${text.language}"`);
  }
  const compiled = compileMessage(text.source, text.language);
  if (!compiled.ok) {
    const problems = compiled.problems.map((problem) => problem.message).join("; ");
    throw new Error(`invalid text "${text.source}": ${problems}`);
  }
  const { elements, atoms, uses } = compiled.message;
  const formatValues: Record<string, string | number | MessagePart> = {};
  for (const [name, kinds] of uses) {
    const value = values[name];
    if (value === undefined) {
      throw new Error(`the text "${text.source}" needs a value for {${name}}`);
    }
    for (const use of kinds) {
      checkValue(text.source, name, use, value);
    }
    if (typeof value !== "object") {
      formatValues[name] = value;
    }
  }
  atoms.forEach((atom, index) => {
    formatValues[`${ATOM_PREFIX}${String(index)}`] = atomPart(atom, values);
  });
  const format = new IntlMessageFormat(elements, locale, undefined, { ignoreTag: true });
  const parts: MessagePart[] = [];
  for (const part of format.formatToParts<MessagePart>(formatValues)) {
    const next: MessagePart =
      typeof part.value === "string" ? { kind: "markup", text: part.value } : part.value;
    const last = parts.at(-1);
    if (next.text === "") {
      continue;
    }
    if (last?.kind === next.kind && next.kind !== "code") {
      parts[parts.length - 1] = { kind: next.kind, text: last.text + next.text };
    } else {
      parts.push(next);
    }
  }
  return parts;
}

/** The part of an atom: a code span, or the value of a simple placeholder. */
function atomPart(atom: Atom, values: TextValues): MessagePart | number {
  if (atom.kind === "code") {
    return { kind: "code", text: atom.text };
  }
  const value = values[atom.name];
  if (typeof value === "number") {
    // Numbers stay with intl-messageformat, which writes them like String(); use
    // {name, number} for the language's digit grouping.
    return value;
  }
  if (typeof value === "string") {
    return { kind: "text", text: value };
  }
  // checkValue made sure that every placeholder has a value.
  return { kind: "code", text: value?.code ?? "" };
}

/** Throws if a value does not fit how its placeholder is used. */
function checkValue(source: string, name: string, use: PlaceholderUse, value: TextValue): void {
  switch (use) {
    case "text":
      return;
    case "number":
      if (typeof value !== "number") {
        throw new TypeError(`the text "${source}" needs a number for {${name}}`);
      }
      return;
    case "select":
      if (typeof value !== "string") {
        throw new TypeError(`the text "${source}" needs a string for {${name}, select, ...}`);
      }
      return;
  }
}

/** The ICU source of a text, with its code spans taken out. */
interface PreparedSource {
  readonly icu: string;
  /** For every offset of `icu` (and its end), the offset in the original text. */
  readonly origin: readonly number[];
  /** The code spans by the offset of their placeholder in `icu`. */
  readonly codeAt: ReadonlyMap<number, string>;
}

type PrepareResult =
  | { readonly ok: true; readonly prepared: PreparedSource }
  | { readonly ok: false; readonly problems: readonly MessageProblem[] };

/**
 * Takes the code spans out of a text and doubles the apostrophes, so that ICU reads neither.
 * A code span starts at a backtick and ends at the next one on the same line.
 */
function prepare(source: string): PrepareResult {
  let icu = "";
  const origin: number[] = [];
  const codeAt = new Map<number, string>();
  const problems: MessageProblem[] = [];
  const emit = (text: string, from: number): void => {
    // One entry per UTF-16 code unit, like the parser's offsets.
    origin.push(...new Array<number>(text.length).fill(from));
    icu += text;
  };
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === "`") {
      const end = source.indexOf("`", index + 1);
      const lineEnd = source.indexOf("\n", index + 1);
      if (end === -1 || (lineEnd !== -1 && lineEnd < end)) {
        problems.push({
          offset: index,
          message: "a code span is not closed: the closing ` is missing on this line",
        });
        index += 1;
        continue;
      }
      const code = source.slice(index + 1, end);
      if (code.trim() === "") {
        problems.push({ offset: index, message: "a code span `` must not be empty" });
      }
      codeAt.set(icu.length, code);
      emit(`{${ATOM_PREFIX}}`, index);
      index = end + 1;
      continue;
    }
    emit(char === "'" ? "''" : char, index);
    index += 1;
  }
  origin.push(source.length);
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, prepared: { icu, origin, codeAt } };
}

/**
 * Parses a text and turns its code spans and simple placeholders into atoms. Used by the
 * markup checks; not part of the package's API.
 */
export function compileMessage(source: string, language: string): CompileResult {
  const preparedResult = prepare(source);
  if (!preparedResult.ok) {
    return preparedResult;
  }
  const { icu, origin, codeAt } = preparedResult.prepared;
  const at = (icuOffset: number): number => origin[icuOffset] ?? source.length;
  let elements: MessageFormatElement[];
  try {
    elements = parse(icu, { ignoreTag: true, captureLocation: true, requiresOtherClause: true });
  } catch (error) {
    return { ok: false, problems: [parserProblem(error, at)] };
  }

  const problems: MessageProblem[] = [];
  const atoms: Atom[] = [];
  const uses = new Map<string, Set<PlaceholderUse>>();
  const offsets = new Map<string, number>();
  const locale = textLocale(language);

  const use = (
    element: MessageFormatElement & { value: string },
    kind: PlaceholderUse,
  ): boolean => {
    const offset = at(element.location?.start.offset ?? 0);
    if (!PLACEHOLDER_NAME_PATTERN.test(element.value)) {
      problems.push({
        offset,
        message:
          `the placeholder name "${element.value}" must be camelCase: letters and digits, ` +
          "starting with a lowercase letter",
      });
      return false;
    }
    const kinds = uses.get(element.value) ?? new Set();
    kinds.add(kind);
    uses.set(element.value, kinds);
    if (!offsets.has(element.value)) {
      offsets.set(element.value, offset);
    }
    return true;
  };

  const atomElement = (atom: Atom, element: MessageFormatElement): MessageFormatElement => {
    atoms.push(atom);
    return {
      type: TYPE.argument,
      value: `${ATOM_PREFIX}${String(atoms.length - 1)}`,
      ...(element.location === undefined ? {} : { location: element.location }),
    };
  };

  const walkOptions = (
    options: Record<string, PluralOrSelectOption>,
  ): Record<string, PluralOrSelectOption> =>
    Object.fromEntries(
      Object.entries(options).map(([key, option]) => [
        key,
        { ...option, value: walk(option.value) },
      ]),
    );

  const walk = (list: readonly MessageFormatElement[]): MessageFormatElement[] =>
    list.map((element): MessageFormatElement => {
      switch (element.type) {
        case TYPE.literal:
        case TYPE.pound:
          return element;
        case TYPE.argument: {
          const code = codeAt.get(element.location?.start.offset ?? -1);
          if (code !== undefined && element.value === ATOM_PREFIX) {
            return atomElement({ kind: "code", text: code }, element);
          }
          use(element, "text");
          return atomElement({ kind: "value", name: element.value }, element);
        }
        case TYPE.number:
          use(element, "number");
          return element;
        case TYPE.date:
        case TYPE.time:
          problems.push({
            offset: at(element.location?.start.offset ?? 0),
            message: "dates and times are not supported in texts",
          });
          return element;
        case TYPE.select:
          use(element, "select");
          return { ...element, options: walkOptions(element.options) };
        case TYPE.plural:
          if (use(element, "number") && locale !== undefined) {
            problems.push(
              ...pluralProblems(element.options, element.pluralType, locale, (option, key) =>
                at(icu.lastIndexOf(key, option.location?.start.offset ?? 0)),
              ),
            );
          }
          return { ...element, options: walkOptions(element.options) };
        case TYPE.tag:
          // Tags are text with ignoreTag; walk the children to be safe.
          return { ...element, children: walk(element.children) };
      }
    });

  const compiled = walk(elements);
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, message: { elements: compiled, icu, at, atoms, uses, offsets } };
}

/** Problems of plural options that the language does not have. */
function pluralProblems(
  options: Record<string, PluralOrSelectOption>,
  type: Intl.PluralRulesOptions["type"],
  locale: string,
  /** Locates an option at its key. */
  at: (option: PluralOrSelectOption, key: string) => number,
): MessageProblem[] {
  const categories: readonly string[] = new Intl.PluralRules(locale, {
    type: type ?? "cardinal",
  }).resolvedOptions().pluralCategories;
  return Object.entries(options)
    .filter(([key]) => !key.startsWith("=") && !categories.includes(key))
    .map(([key, option]) => ({
      offset: at(option, key),
      message:
        `the plural option "${key}" does not exist in "${locale}", which has ` +
        `${categories.join(", ")} and exact numbers like =0`,
    }));
}

/** The problem of a syntax error that the parser threw. */
function parserProblem(error: unknown, at: (icuOffset: number) => number): MessageProblem {
  const kind = error instanceof Error ? error.message : String(error);
  const offset = locationOffset(error);
  return {
    offset: at(offset),
    message: PARSER_MESSAGES[kind] ?? `the text is not valid ICU MessageFormat (${kind})`,
  };
}

/** The start offset of a parser error's location. */
function locationOffset(error: unknown): number {
  if (typeof error !== "object" || error === null || !("location" in error)) {
    return 0;
  }
  const { location } = error;
  if (typeof location !== "object" || location === null || !("start" in location)) {
    return 0;
  }
  const { start } = location;
  if (typeof start !== "object" || start === null || !("offset" in start)) {
    return 0;
  }
  return typeof start.offset === "number" ? start.offset : 0;
}
