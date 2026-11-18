import { describe, expect, test } from "vitest";

import { type CatFormat, CatFormatter } from "./cat-format";

const PLAIN: CatFormat = {
  number: false,
  numberNonblank: false,
  squeezeBlank: false,
  showNonprinting: false,
  showEnds: false,
  showTabs: false,
};

function formatter(options: Partial<CatFormat>): CatFormatter {
  return new CatFormatter({ ...PLAIN, ...options });
}

/** Formats `inputs` one after the other with one formatter, like the operands of one `cat`. */
function format(options: Partial<CatFormat>, ...inputs: string[]): string {
  const current = formatter(options);
  return inputs.map((input) => current.formatInput(input)).join("") + current.finish();
}

describe("CatFormatter", () => {
  test("without options it copies the content", () => {
    expect(format({}, "a\tb\r\n\x01ä\n", "rest")).toBe("a\tb\r\n\x01ä\nrest");
  });

  test("numbers all lines, also empty ones, right-aligned in six columns with a tab", () => {
    expect(format({ number: true }, "a\n\nb\n")).toBe("     1\ta\n     2\t\n     3\tb\n");
  });

  test("numbers only nonempty lines with numberNonblank", () => {
    expect(format({ number: true, numberNonblank: true }, "a\n\n\nb\n")).toBe(
      "     1\ta\n\n\n     2\tb\n",
    );
  });

  test("numbers an empty first line", () => {
    expect(format({ number: true }, "\nx\n")).toBe("     1\t\n     2\tx\n");
  });

  test("does not number the empty rest after the last line break", () => {
    expect(format({ number: true }, "a\n", "")).toBe("     1\ta\n");
  });

  test("a line without a line break goes on in the next input without a new number", () => {
    expect(format({ number: true }, "one", "two\nthree\n")).toBe("     1\tonetwo\n     2\tthree\n");
  });

  test("the line numbers grow wider than six columns after 999999", () => {
    const current = formatter({ number: true });
    current.formatInput("\n".repeat(999_999));
    expect(current.formatInput("a\nb\n")).toBe("1000000\ta\n1000001\tb\n");
  });

  test("squeezes empty lines in a row into one, also at the start", () => {
    expect(format({ squeezeBlank: true }, "\n\n\na\n\n\nb\n")).toBe("\na\n\nb\n");
  });

  test("squeezes empty lines across inputs", () => {
    expect(format({ squeezeBlank: true }, "a\n\n", "\n\nb\n")).toBe("a\n\nb\n");
  });

  test("numbers the squeezed lines in order", () => {
    expect(format({ squeezeBlank: true, number: true }, "\n\n\na\n\n\nb\n")).toBe(
      "     1\t\n     2\ta\n     3\t\n     4\tb\n",
    );
  });

  test("shows the ends of lines as `$`", () => {
    expect(format({ showEnds: true }, "a\n\nb")).toBe("a$\n$\nb");
  });

  test("shows a carriage return before a line break as `^M` with showEnds", () => {
    expect(format({ showEnds: true }, "a\r\nb\rc\r\r\n")).toBe("a^M$\nb\rc\r^M$\n");
  });

  test("a carriage return at the end of an input waits for the next character", () => {
    expect(format({ showEnds: true }, "a\r", "\nb\n")).toBe("a^M$\nb$\n");
    expect(format({ showEnds: true }, "a\r", "b\n")).toBe("a\rb$\n");
    expect(format({ showEnds: true }, "a\r", "", "\n")).toBe("a^M$\n");
    expect(format({ showEnds: true }, "a\r")).toBe("a\r");
  });

  test("a waiting carriage return is written before the next line number", () => {
    const current = formatter({ showEnds: true, number: true });
    expect(current.formatInput("a\r")).toBe("     1\ta");
    expect(current.formatInput("\nb")).toBe("^M$\n     2\tb");
    expect(current.finish()).toBe("");
  });

  test("shows tabs as `^I` with showTabs", () => {
    expect(format({ showTabs: true }, "a\tb\x01\n")).toBe("a^Ib\x01\n");
  });

  test("shows control characters with `^` and DEL as `^?` with showNonprinting", () => {
    expect(format({ showNonprinting: true }, "\x00\x01\x1b[1m\x1f\x7f~ \r\n")).toBe(
      "^@^A^[[1m^_^?~ ^M\n",
    );
  });

  test("keeps tabs with showNonprinting unless showTabs is set", () => {
    expect(format({ showNonprinting: true }, "a\tb\n")).toBe("a\tb\n");
    expect(format({ showNonprinting: true, showTabs: true }, "a\tb\n")).toBe("a^Ib\n");
  });

  test("shows the UTF-8 bytes of other characters with `M-`", () => {
    // Ü is C3 9C, ä is C3 A4, ¿ is C2 BF, U+0085 is C2 85, € is E2 82 AC.
    expect(format({ showNonprinting: true }, "Üä¿\u0085€\n")).toBe(
      "M-CM-^\\M-CM-$M-BM-?M-BM-^EM-bM-^BM-,\n",
    );
  });

  test("shows a carriage return as `^M` with showNonprinting, also at the end", () => {
    expect(format({ showNonprinting: true, showEnds: true }, "a\r", "\n")).toBe("a^M$\n");
  });

  test("finish is empty without a waiting carriage return", () => {
    expect(formatter({ showEnds: true }).finish()).toBe("");
  });
});
