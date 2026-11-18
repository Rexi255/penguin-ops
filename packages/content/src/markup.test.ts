import { describe, expect, test } from "vitest";

import { checkText, formatText, parseMarkup, type RichText, type RichTextInline } from "./markup";
import type { MessagePart } from "./message";

function en(source: string, values = {}): RichText {
  return formatText({ language: "en", source }, values);
}

function text(value: string): RichTextInline {
  return { type: "text", text: value };
}

function code(value: string): RichTextInline {
  return { type: "code", text: value };
}

function bold(...children: RichTextInline[]): RichTextInline {
  return { type: "bold", children };
}

const BREAK: RichTextInline = { type: "break" };

function paragraph(...content: RichTextInline[]) {
  return { type: "paragraph", content };
}

function list(...items: RichTextInline[][]) {
  return { type: "list", items };
}

/** The problems of an English text as `offset: message`. */
function problems(source: string, placeholders = true): string[] {
  return checkText(source, "en", { placeholders }).map(
    (problem) => `${String(problem.offset)}: ${problem.message}`,
  );
}

describe("formatText: blocks", () => {
  test("one line is one paragraph", () => {
    expect(en("The printer does not print.")).toEqual([
      paragraph(text("The printer does not print.")),
    ]);
  });

  test("an empty text has no blocks", () => {
    expect(en("")).toEqual([]);
    expect(en("\n  \n")).toEqual([]);
  });

  test("line breaks inside a paragraph are kept; the final line break of a block is not", () => {
    expect(en("Hi,\nthe printer is broken.\nThanks, Petra\n")).toEqual([
      paragraph(text("Hi,"), BREAK, text("the printer is broken."), BREAK, text("Thanks, Petra")),
    ]);
  });

  test("an empty line or a line of spaces starts a new paragraph", () => {
    expect(en("One.\n\nTwo.\n  \n\nThree.")).toEqual([
      paragraph(text("One.")),
      paragraph(text("Two.")),
      paragraph(text("Three.")),
    ]);
  });

  test("lines starting with - form a list, also right after a paragraph line", () => {
    expect(en("Please check:\n- the cable\n- the **power**\nThanks!")).toEqual([
      paragraph(text("Please check:")),
      list([text("the cable")], [text("the "), bold(text("power"))]),
      paragraph(text("Thanks!")),
    ]);
  });

  test("an empty line ends a list", () => {
    expect(en("- a\n\n- b")).toEqual([list([text("a")]), list([text("b")])]);
  });

  test("spaces after the marker are not part of the item", () => {
    expect(en("-   a")).toEqual([list([text("a")])]);
  });

  test("a hyphen without a space, or after spaces, is text", () => {
    expect(en("-n prints numbers\n - not a list\n-")).toEqual([
      paragraph(text("-n prints numbers"), BREAK, text(" - not a list"), BREAK, text("-")),
    ]);
  });

  test("an item may start with code", () => {
    expect(en("- `ls -l` lists details")).toEqual([list([code("ls -l"), text(" lists details")])]);
  });

  test("a line that starts with code is not an item", () => {
    expect(en("`- x`")).toEqual([paragraph(code("- x"))]);
  });

  test("an empty item is kept", () => {
    expect(en("- \n- a")).toEqual([list([], [text("a")])]);
  });
});

describe("formatText: inline markup", () => {
  test("bold and code", () => {
    expect(en("Find the **IP address** with `cat ~/a.txt`.")).toEqual([
      paragraph(
        text("Find the "),
        bold(text("IP address")),
        text(" with "),
        code("cat ~/a.txt"),
        text("."),
      ),
    ]);
  });

  test("bold around code", () => {
    expect(en("**`rm -r`** deletes")).toEqual([paragraph(bold(code("rm -r")), text(" deletes"))]);
  });

  test("code keeps asterisks and hyphens", () => {
    expect(en("`ls **/*.txt` and `- x`")).toEqual([
      paragraph(code("ls **/*.txt"), text(" and "), code("- x")),
    ]);
  });

  test("a single asterisk is text", () => {
    expect(en("2 * 3 and *.txt")).toEqual([paragraph(text("2 * 3 and *.txt"))]);
  });

  test("an unpaired ** stays text, the pairs before it are bold", () => {
    expect(en("**a** and **b")).toEqual([paragraph(bold(text("a")), text(" and **b"))]);
  });

  test("bold does not go over a line break", () => {
    expect(en("**a\nb**")).toEqual([paragraph(text("**a"), BREAK, text("b**"))]);
  });

  test("empty bold is left out", () => {
    expect(en("a****b")).toEqual([paragraph(text("ab"))]);
  });

  test("three asterisks: bold, then an asterisk", () => {
    expect(en("***a**")).toEqual([paragraph(bold(text("*a")))]);
  });

  test("HTML is text", () => {
    expect(en("<b>no</b> & <script>")).toEqual([paragraph(text("<b>no</b> & <script>"))]);
  });
});

describe("formatText: values never become markup", () => {
  test("a value with asterisks, a hyphen or a line break", () => {
    expect(en("{name}", { name: "- **x**" })).toEqual([paragraph(text("- **x**"))]);
    expect(en("Hi {name}!", { name: "a\n\nb" })).toEqual([paragraph(text("Hi a\n\nb!"))]);
  });

  test("bold around a value", () => {
    expect(en("**{name}** wins", { name: "Ada" })).toEqual([
      paragraph(bold(text("Ada")), text(" wins")),
    ]);
  });

  test("a code value", () => {
    expect(en("{option} is not simulated", { option: { code: "--color" } })).toEqual([
      paragraph(code("--color"), text(" is not simulated")),
    ]);
  });

  test("plural options with markup", () => {
    const source = "{n, plural, one {**one** file} other {**#** files}}\n- in `~`";
    expect(en(source, { n: 3 })).toEqual([
      paragraph(bold(text("3")), text(" files")),
      list([text("in "), code("~")]),
    ]);
  });
});

describe("parseMarkup", () => {
  test("parts without text", () => {
    expect(parseMarkup([])).toEqual([]);
  });

  test("a value at the start of a line is not a list marker", () => {
    const parts: MessagePart[] = [
      { kind: "text", text: "- a" },
      { kind: "markup", text: "\n- b" },
    ];
    expect(parseMarkup(parts)).toEqual([paragraph(text("- a")), list([text("b")])]);
  });

  test("a line of a value with spaces only is not blank", () => {
    const parts: MessagePart[] = [
      { kind: "markup", text: "a\n" },
      { kind: "text", text: " " },
      { kind: "markup", text: "\nb" },
    ];
    expect(parseMarkup(parts)).toEqual([paragraph(text("a"), BREAK, text(" "), BREAK, text("b"))]);
  });
});

describe("checkText", () => {
  test.each([
    ["plain text", "Hello"],
    ["bold, code, lists and paragraphs", "**Hi**\n\n- `ls`\n- b\n\nText"],
    ["bold around a value", "**{name}**"],
    ["bold around a plural on one line", "**{n, plural, one {#} other {#}}**"],
    ["bold inside options", "{n, plural, one {**#** file} other {**#** files}}"],
    ["asterisks in code", "`**` and `- `"],
    ["a single asterisk", "a * b"],
    ["an item with content after a placeholder", "- {name}"],
    ["an item with code", "- `ls`"],
    ["an item in an option", "{n, plural, one {a\n- b} other {c}}"],
  ])("valid: %s", (_name, source) => {
    expect(problems(source)).toEqual([]);
  });

  test.each([
    ["unclosed bold", "a **b", "2: bold is not closed: the closing ** is missing on its line"],
    ["empty bold", "a **** b", "2: bold must not be empty"],
    ["bold of spaces only", "a **  ** b", "2: bold must not be empty"],
    [
      "bold around an option with a line break",
      "**{n, plural, one {a\nb} other {c}}**",
      "2: bold cannot go around an option that has a line break",
    ],
    ["an empty list item", "Check:\n- \n- b", "7: a list item must not be empty"],
    ["an empty list item at the end", "- a\n- ", "4: a list item must not be empty"],
  ])("%s", (_name, source, expected) => {
    expect(problems(source)).toEqual([expected]);
  });

  test("bold over a line break: both markers are unclosed on their lines", () => {
    expect(problems("**a\nb**")).toEqual([
      "0: bold is not closed: the closing ** is missing on its line",
      "5: bold is not closed: the closing ** is missing on its line",
    ]);
  });

  test("bold that closes in plural options is unclosed on its line and in each option", () => {
    expect(problems("**a {n, plural, one {b**} other {c**}}")).toEqual([
      "0: bold is not closed: the closing ** is missing on its line",
      "22: bold is not closed: the closing ** is missing in its option",
      "34: bold is not closed: the closing ** is missing in its option",
    ]);
  });

  test("unclosed bold in an option", () => {
    expect(problems("{n, plural, one {**a} other {b}}")).toEqual([
      "17: bold is not closed: the closing ** is missing in its option",
    ]);
  });

  test("offsets count the original text", () => {
    expect(problems("`x` it's **a")).toEqual([
      "9: bold is not closed: the closing ** is missing on its line",
    ]);
  });

  test("ICU problems come first; markup is checked only in a valid message", () => {
    expect(problems("**a {")).toEqual(['4: a placeholder is not closed: "}" is missing']);
    expect(problems("**{name}", false)).toEqual([
      "2: level texts have no placeholders, because the game passes no values to them: {name}",
    ]);
  });

  test("several problems in order", () => {
    expect(problems("- \n**a\n****")).toEqual([
      "0: a list item must not be empty",
      "3: bold is not closed: the closing ** is missing on its line",
      "7: bold must not be empty",
    ]);
  });
});
