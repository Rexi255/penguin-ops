// The styleguide's token catalog: every token of tokens.css has a section (ADR 0083).
import { describe, expect, test } from "vitest";

import { CssReadError } from "../css-rules";
import tokensCss from "../tokens.css?raw";
import {
  catalogTokens,
  readTokenCatalog,
  readTokenNotes,
  TOKEN_SECTIONS,
  type TokenSection,
} from "./token-catalog";

describe("the token catalog of tokens.css", () => {
  const catalog = readTokenCatalog(tokensCss);

  test("has a section for every token", () => {
    expect(catalog.unsorted).toEqual([]);
  });

  test("fills every section", () => {
    expect(catalog.sections.map((entry) => entry.section.id)).toEqual(
      TOKEN_SECTIONS.map((section) => section.id),
    );
  });

  test("keeps the order of tokens.css inside a section", () => {
    const colors = catalog.sections.find((entry) => entry.section.kind === "color");
    expect(colors?.tokens[0]?.name).toBe("--color-surface-ground");
  });

  test("carries the notes written next to the tokens", () => {
    const colors = catalog.sections.find((entry) => entry.section.kind === "color");
    expect(colors?.tokens.find((token) => token.name === "--color-text")).toEqual({
      name: "--color-text",
      value: "#e8e6e1",
      note: "body text",
    });
  });

  test("uses unique section ids and prefixes", () => {
    const ids = TOKEN_SECTIONS.map((section) => section.id);
    const prefixes = TOKEN_SECTIONS.flatMap((section) => section.prefixes);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe("catalogTokens", () => {
  const sections: TokenSection[] = [
    { id: "a", title: "A", kind: "color", prefixes: ["--a-"] },
    { id: "b", title: "B", kind: "space", prefixes: ["--b-"] },
    { id: "c", title: "C", kind: "font", prefixes: ["--c-"] },
  ];

  test("sorts tokens by prefix, lists the rest as unsorted and leaves empty sections out", () => {
    const tokens = new Map([
      ["--b-1", "1px"],
      ["--x-1", "red"],
      ["--a-1", "#000000"],
      ["--b-2", "2px"],
    ]);
    const catalog = catalogTokens(tokens, new Map([["--a-1", "black"]]), sections);
    expect(catalog.sections).toEqual([
      { section: sections[0], tokens: [{ name: "--a-1", value: "#000000", note: "black" }] },
      {
        section: sections[1],
        tokens: [
          { name: "--b-1", value: "1px", note: "" },
          { name: "--b-2", value: "2px", note: "" },
        ],
      },
    ]);
    expect(catalog.unsorted).toEqual([{ name: "--x-1", value: "red", note: "" }]);
  });

  test("puts a token into the first matching section only", () => {
    const overlapping: TokenSection[] = [
      { id: "wide", title: "Wide", kind: "line", prefixes: ["--a"] },
      { id: "narrow", title: "Narrow", kind: "color", prefixes: ["--a-"] },
    ];
    const catalog = catalogTokens(new Map([["--a-1", "1px"]]), new Map(), overlapping);
    expect(catalog.sections.map((entry) => entry.section.id)).toEqual(["wide"]);
  });
});

describe("readTokenNotes", () => {
  test("reads the comment at the end of a declaration's line", () => {
    const css = [
      ":root {",
      "  /* A group comment on its own line is not a note. */",
      "  --one: 1px; /* the first */",
      "  --two: 2px;",
      "  --three: calc(var(--one) * 3);   /*  spaced   */  ",
      "}",
    ].join("\n");
    expect(readTokenNotes(css)).toEqual(
      new Map([
        ["--one", "the first"],
        ["--three", "spaced"],
      ]),
    );
  });

  test("keeps the first note of a token that is declared twice", () => {
    const css =
      ":root {\n  --a: 1px; /* default */\n}\n@media print {\n  :root {\n    --a: 0; /* print */\n  }\n}";
    expect(readTokenNotes(css).get("--a")).toBe("default");
  });
});

describe("readTokenCatalog", () => {
  test("rejects a stylesheet without a :root rule", () => {
    expect(() => readTokenCatalog(".a { color: var(--x); }")).toThrow(CssReadError);
  });
});
