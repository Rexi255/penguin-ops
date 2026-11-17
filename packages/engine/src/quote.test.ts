import { describe, expect, test } from "vitest";

import { localeQuote, shellQuote, shellQuoteAlways } from "./quote";

describe("localeQuote", () => {
  test("puts typographic quotes around the text", () => {
    expect(localeQuote("notes.txt")).toBe("‘notes.txt’");
    expect(localeQuote("")).toBe("‘’");
  });

  test("keeps spaces, straight quotes and printable non-ASCII characters", () => {
    expect(localeQuote('it\'s "ä" 😀')).toBe('‘it\'s "ä" 😀’');
  });

  test("escapes backslashes and the closing quote, not the opening one", () => {
    expect(localeQuote("a\\b’c‘")).toBe("‘a\\\\b\\’c‘’");
  });

  test("writes C escapes for named control characters", () => {
    expect(localeQuote("\x07\b\f\n\r\t\v")).toBe("‘\\a\\b\\f\\n\\r\\t\\v’");
  });

  test("@differential writes other non-printable characters as octal escapes of their bytes", () => {
    expect(localeQuote("\x1b[0m\x7f")).toBe("‘\\033[0m\\177’");
    expect(localeQuote("\u0085")).toBe("‘\\302\\205’");
    expect(localeQuote("a b")).toBe("‘a\\342\\200\\250b’");
  });
});

describe("shellQuoteAlways", () => {
  test("puts single quotes around every name", () => {
    expect(shellQuoteAlways("notes.txt")).toBe("'notes.txt'");
    expect(shellQuoteAlways("my file")).toBe("'my file'");
    expect(shellQuoteAlways("a$b*c")).toBe("'a$b*c'");
    expect(shellQuoteAlways("")).toBe("''");
  });

  test("keeps backslashes and printable non-ASCII characters inside the quotes", () => {
    expect(shellQuoteAlways("a\\b")).toBe("'a\\b'");
    expect(shellQuoteAlways("Übersicht 😀")).toBe("'Übersicht 😀'");
  });

  test("uses double quotes for a name with an apostrophe and otherwise harmless characters", () => {
    expect(shellQuoteAlways("it's")).toBe('"it\'s"');
    expect(shellQuoteAlways("Bob's notes.txt")).toBe('"Bob\'s notes.txt"');
    expect(shellQuoteAlways("#1's ä@")).toBe('"#1\'s ä@"');
    expect(shellQuoteAlways("~'")).toBe('"~\'"');
  });

  test("closes the quotes around an apostrophe when other characters are special", () => {
    expect(shellQuoteAlways("it's $5")).toBe("'it'\\''s $5'");
    expect(shellQuoteAlways("a#'b")).toBe("'a#'\\''b'");
    expect(shellQuoteAlways("a'~")).toBe("'a'\\''~'");
    expect(shellQuoteAlways("x{'")).toBe("'x{'\\'''");
    expect(shellQuoteAlways("what's?")).toBe("'what'\\''s?'");
  });

  test("@differential writes characters that are not printable as ANSI-C escapes", () => {
    expect(shellQuoteAlways("a\nb")).toBe("'a'$'\\n''b'");
    expect(shellQuoteAlways("\t")).toBe("''$'\\t'");
    expect(shellQuoteAlways("\x1b[0m\x7f")).toBe("''$'\\033''[0m'$'\\177'");
    expect(shellQuoteAlways("a ")).toBe("'a'$'\\342\\200\\250'");
    expect(shellQuoteAlways("\x07\b\f\r\v")).toBe("''$'\\a\\b\\f\\r\\v'");
  });

  test("@differential ends the escapes before an apostrophe without an empty pair of quotes", () => {
    expect(shellQuoteAlways("\n'x")).toBe("''$'\\n'\\''x'");
  });
});

describe("shellQuote", () => {
  test("leaves names alone that a shell reads back as they are", () => {
    const names = ["notes.txt", "a-b_c.d", "50%+1,2:3", "x]", "user@host", "Übersicht"];
    for (const name of [...names, "a#b", "a~b", "{a}"]) {
      expect(shellQuote(name)).toBe(name);
    }
  });

  test("quotes names with spaces, special characters or a leading # or ~", () => {
    expect(shellQuote("my file")).toBe("'my file'");
    for (const special of Array.from('!"$&()*;<=>[^`|?\\')) {
      expect(shellQuote(`a${special}b`)).toBe(`'a${special}b'`);
    }
    expect(shellQuote("#notes")).toBe("'#notes'");
    expect(shellQuote("~backup")).toBe("'~backup'");
    expect(shellQuote("{")).toBe("'{'");
    expect(shellQuote("}")).toBe("'}'");
    expect(shellQuote("")).toBe("''");
  });

  test("uses double quotes for a name with an apostrophe", () => {
    expect(shellQuote("it's")).toBe('"it\'s"');
  });

  test("@differential quotes names with characters that are not printable", () => {
    expect(shellQuote("a\nb")).toBe("'a'$'\\n''b'");
    expect(shellQuote("\x7f")).toBe("''$'\\177'");
  });

  test("quotes names with one of the characters in alsoQuote", () => {
    expect(shellQuote("a:b")).toBe("a:b");
    expect(shellQuote("a:b", ":")).toBe("'a:b'");
    expect(shellQuote("ab", ":")).toBe("ab");
  });
});
