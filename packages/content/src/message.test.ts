import { describe, expect, test } from "vitest";

import {
  type CatalogText,
  checkMessage,
  formatMessage,
  type MessagePart,
  textLocale,
} from "./message";

const WITH_PLACEHOLDERS = { placeholders: true };
const WITHOUT_PLACEHOLDERS = { placeholders: false };

function en(source: string): CatalogText {
  return { language: "en", source };
}

function de(source: string): CatalogText {
  return { language: "de", source };
}

function markup(text: string): MessagePart {
  return { kind: "markup", text };
}

function code(text: string): MessagePart {
  return { kind: "code", text };
}

/** The problems of an English text as `offset: message`. */
function problems(source: string, rules = WITH_PLACEHOLDERS, language = "en"): string[] {
  return checkMessage(source, language, rules).map(
    (problem) => `${String(problem.offset)}: ${problem.message}`,
  );
}

describe("checkMessage: valid texts", () => {
  test.each([
    ["plain text", "The printer does not print."],
    ["apostrophes are literal", "It's Mehmet's printer, geht's?"],
    ["an apostrophe before a brace is literal", "Type '{count}' items"],
    ["markup characters", "**IP address**, - a list, <b>no tags</b>, a > b"],
    [
      "a code span with braces and quotes",
      "Run `awk '{print $1}' file` or `find . -exec rm {} \\;`",
    ],
    ["a code span with a hash inside plural", "{n, plural, one {`#` one} other {`#` # more}}"],
    ["a simple placeholder", "Hello {name}"],
    ["a number placeholder with a skeleton", "{size, number, ::compact-short}"],
    ["plural with exact values", "{count, plural, =0 {no files} one {# file} other {# files}}"],
    ["selectordinal", "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}"],
    ["select", "{kind, select, file {a file} directory {a folder} other {something}}"],
  ])("%s", (_name, source) => {
    expect(problems(source)).toEqual([]);
  });

  test("plural options of the text's language", () => {
    expect(
      problems(
        "{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}",
        WITH_PLACEHOLDERS,
        "pl",
      ),
    ).toEqual([]);
  });

  test("level texts without placeholders", () => {
    expect(problems("Run `echo {a,b}` and it's done.", WITHOUT_PLACEHOLDERS)).toEqual([]);
  });
});

describe("checkMessage: problems", () => {
  test.each([
    ["an unclosed placeholder", "a {b", '2: a placeholder is not closed: "}" is missing'],
    ["an empty placeholder", "a {} b", "2: a placeholder {} has no name"],
    [
      "a malformed placeholder",
      "x {a b}",
      "2: a placeholder is malformed: write {name}, {name, number}, {name, plural, ...} or {name, select, ...}",
    ],
    [
      "an unknown type",
      "{n, plurl, one {x} other {y}}",
      "4: unknown type of placeholder: use number, plural, selectordinal or select",
    ],
    ["plural without other", "{n, plural, one {x}}", '19: the option "other" is missing'],
    ["select without other", "{k, select, a {x}}", '17: the option "other" is missing'],
    [
      "a plural option twice",
      "{n, plural, one {x} one {y} other {z}}",
      "20: a plural option is given twice",
    ],
    [
      "a plural option without text",
      "{n, plural, one}",
      "15: an option needs its text in braces, for example one {# file}",
    ],
    [
      "a placeholder name that is not camelCase",
      "Hello {Name}",
      '6: the placeholder name "Name" must be camelCase: letters and digits, starting with a lowercase letter',
    ],
    [
      "a numbered placeholder",
      "Hello {0}",
      '6: the placeholder name "0" must be camelCase: letters and digits, starting with a lowercase letter',
    ],
    [
      "the internal name of code spans",
      "Hello {_atom}",
      '6: the placeholder name "_atom" must be camelCase: letters and digits, starting with a lowercase letter',
    ],
    ["a date", "on {day, date, short}", "3: dates and times are not supported in texts"],
    ["a time", "at {t, time}", "3: dates and times are not supported in texts"],
    [
      "an unclosed code span",
      "Run `ls",
      "4: a code span is not closed: the closing ` is missing on this line",
    ],
    ["an empty code span", "Run `` now", "4: a code span `` must not be empty"],
  ])("%s", (_name, source, expected) => {
    expect(problems(source)).toEqual([expected]);
  });

  test("a code span does not go over a line break: both backticks are unclosed", () => {
    expect(problems("Run `ls\n-l` now")).toEqual([
      "4: a code span is not closed: the closing ` is missing on this line",
      "10: a code span is not closed: the closing ` is missing on this line",
    ]);
  });

  test("offsets count the original text, not the apostrophes doubled for ICU", () => {
    expect(problems("it's '{a b}'")).toEqual([
      "6: a placeholder is malformed: write {name}, {name, number}, {name, plural, ...} or {name, select, ...}",
    ]);
  });

  test("offsets after a code span", () => {
    expect(problems("`a {b}` then {")).toEqual(['13: a placeholder is not closed: "}" is missing']);
  });

  test("a code span that crosses plural options breaks the syntax", () => {
    expect(problems("{n, plural, one {`x} other {y`}}")).not.toEqual([]);
  });

  test("plural options that the language does not have", () => {
    expect(problems("{n, plural, one {#} few {#} many {#} other {#}}")).toEqual([
      '20: the plural option "few" does not exist in "en", which has one, other and exact numbers like =0',
      '28: the plural option "many" does not exist in "en", which has one, other and exact numbers like =0',
    ]);
  });

  test("ordinal options are checked with the ordinal rules", () => {
    expect(
      problems("{n, selectordinal, one {#.} two {#.} other {#.}}", WITH_PLACEHOLDERS, "de"),
    ).toEqual([
      '19: the plural option "one" does not exist in "de", which has other and exact numbers like =0',
      '28: the plural option "two" does not exist in "de", which has other and exact numbers like =0',
    ]);
  });

  test("all code span problems are reported together", () => {
    expect(problems("`` and `x")).toEqual([
      "0: a code span `` must not be empty",
      "7: a code span is not closed: the closing ` is missing on this line",
    ]);
  });

  test("plural options are not checked in a language that Intl does not know", () => {
    expect(problems("{n, plural, few {#} other {#}}", WITH_PLACEHOLDERS, "xx")).toEqual([]);
  });

  test("level texts report every placeholder once, at its first use", () => {
    expect(
      problems("Hi {name}, {n, plural, one {#} other {# {name}}}", WITHOUT_PLACEHOLDERS),
    ).toEqual([
      "3: level texts have no placeholders, because the game passes no values to them: {name}",
      "11: level texts have no placeholders, because the game passes no values to them: {n}",
    ]);
  });
});

describe("formatMessage", () => {
  test("a text without placeholders is one markup part", () => {
    expect(formatMessage(en("It's **done**."))).toEqual([markup("It's **done**.")]);
  });

  test("an empty text has no parts", () => {
    expect(formatMessage(en(""))).toEqual([]);
  });

  test("code spans become code parts, with their content unchanged", () => {
    expect(formatMessage(en("Run `awk '{print $1}'`, then `ls`."))).toEqual([
      markup("Run "),
      code("awk '{print $1}'"),
      markup(", then "),
      code("ls"),
      markup("."),
    ]);
  });

  test("adjacent code spans stay separate", () => {
    expect(formatMessage(en("`a``b`"))).toEqual([code("a"), code("b")]);
  });

  test("text values are parts of their own, so they never become markup", () => {
    expect(formatMessage(en("Hi {name}!"), { name: "**Max**" })).toEqual([
      markup("Hi "),
      { kind: "text", text: "**Max**" },
      markup("!"),
    ]);
  });

  test("code values become code parts", () => {
    expect(formatMessage(en("{option} is not simulated"), { option: { code: "--color" } })).toEqual(
      [code("--color"), markup(" is not simulated")],
    );
  });

  test("numbers in simple placeholders are written without grouping", () => {
    expect(formatMessage(de("{n} Dateien"), { n: 1234 })).toEqual([markup("1234 Dateien")]);
  });

  test("number placeholders use the language's digits", () => {
    expect(formatMessage(de("{n, number} Dateien"), { n: 1234.5 })).toEqual([
      markup("1.234,5 Dateien"),
    ]);
    expect(formatMessage(en("{n, number} files"), { n: 1234.5 })).toEqual([
      markup("1,234.5 files"),
    ]);
  });

  test.each([
    [0, "no files"],
    [1, "1 file"],
    [2, "2 files"],
    [1000, "1,000 files"],
  ])("plural with %d", (count, expected) => {
    const text = en("{count, plural, =0 {no files} one {# file} other {# files}}");
    expect(formatMessage(text, { count })).toEqual([markup(expected)]);
  });

  test("plural rules of the language", () => {
    const text: CatalogText = {
      language: "pl",
      source: "{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}",
    };
    expect(formatMessage(text, { n: 1 })).toEqual([markup("1 plik")]);
    expect(formatMessage(text, { n: 3 })).toEqual([markup("3 pliki")]);
    expect(formatMessage(text, { n: 5 })).toEqual([markup("5 plików")]);
  });

  test("selectordinal", () => {
    const text = en("the {n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} try");
    expect(formatMessage(text, { n: 2 })).toEqual([markup("the 2nd try")]);
    expect(formatMessage(text, { n: 11 })).toEqual([markup("the 11th try")]);
  });

  test("select, with values and code inside the options", () => {
    const text = en("{kind, select, file {the file {name}} other {`{name}`}}");
    expect(formatMessage(text, { kind: "file", name: "a.txt" })).toEqual([
      markup("the file "),
      { kind: "text", text: "a.txt" },
    ]);
    expect(formatMessage(text, { kind: "dir", name: "x" })).toEqual([code("{name}")]);
  });

  test("a placeholder used as text and in select gets the same value", () => {
    const text = en("{kind}: {kind, select, file {a file} other {other}}");
    expect(formatMessage(text, { kind: "file" })).toEqual([
      { kind: "text", text: "file" },
      markup(": a file"),
    ]);
  });

  test("adjacent values become one text part", () => {
    expect(formatMessage(en("{first}{last}"), { first: "Ada ", last: "L." })).toEqual([
      { kind: "text", text: "Ada L." },
    ]);
  });

  test("an empty option and an empty value leave no parts", () => {
    const text = en("{kind, select, none {} other {x}}{name}");
    expect(formatMessage(text, { kind: "none", name: "" })).toEqual([]);
  });

  test("values that the text does not use are ignored", () => {
    expect(formatMessage(en("Hi"), { name: "x" })).toEqual([markup("Hi")]);
  });

  test("a further language with a region", () => {
    expect(formatMessage({ language: "pt-br", source: "{n, number}" }, { n: 1234.5 })).toEqual([
      markup("1.234,5"),
    ]);
  });
});

describe("formatMessage: errors of the caller", () => {
  test("a missing value", () => {
    expect(() => formatMessage(en("Hi {name}"))).toThrow(
      'the text "Hi {name}" needs a value for {name}',
    );
  });

  test("a string for a plural", () => {
    expect(() => formatMessage(en("{n, plural, one {#} other {#}}"), { n: "3" })).toThrow(
      "needs a number for {n}",
    );
  });

  test("a string for a number", () => {
    expect(() => formatMessage(en("{n, number}"), { n: "3" })).toThrow("needs a number for {n}");
  });

  test("a number for a select", () => {
    expect(() => formatMessage(en("{k, select, a {x} other {y}}"), { k: 1 })).toThrow(
      "needs a string for {k, select, ...}",
    );
  });

  test("code for a select", () => {
    expect(() => formatMessage(en("{k, select, a {x} other {y}}"), { k: { code: "a" } })).toThrow(
      "needs a string for {k, select, ...}",
    );
  });

  test("an invalid text", () => {
    expect(() => formatMessage(en("a {b"))).toThrow(
      'invalid text "a {b": a placeholder is not closed: "}" is missing',
    );
  });

  test("an unknown language", () => {
    expect(() => formatMessage({ language: "xx", source: "a" })).toThrow(
      'cannot format texts in the unknown language "xx"',
    );
  });
});

describe("textLocale", () => {
  test.each([
    ["en", "en"],
    ["de", "de"],
    ["pt-br", "pt-BR"],
  ])("%s", (language, locale) => {
    expect(textLocale(language)).toBe(locale);
  });

  test.each(["xx", "not a tag", ""])("unknown: %j", (language) => {
    expect(textLocale(language)).toBeUndefined();
  });
});
