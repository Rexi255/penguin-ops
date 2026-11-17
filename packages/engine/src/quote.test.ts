import { describe, expect, test } from "vitest";

import { localeQuote } from "./quote";

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
