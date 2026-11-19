import { describe, expect, test } from "vitest";

import {
  CssReadError,
  findLiteralColors,
  readCssRules,
  rootCustomProperties,
  usedCustomProperties,
} from "./css-rules";

describe("readCssRules", () => {
  test("reads rules with their declarations and skips comments", () => {
    const rules = readCssRules(`
      /* a comment with { braces } */
      :root {
        --color-text: #e8e6e1; /* body text */
        color-scheme: dark;
      }
      .a,
      .b   > p { color: var(--color-text) }
    `);
    expect(rules).toEqual([
      {
        selector: ":root",
        conditions: [],
        declarations: new Map([
          ["--color-text", "#e8e6e1"],
          ["color-scheme", "dark"],
        ]),
      },
      {
        selector: ".a, .b > p",
        conditions: [],
        declarations: new Map([["color", "var(--color-text)"]]),
      },
    ]);
  });

  test("records the at-rules a rule is nested in", () => {
    const rules = readCssRules(`
      @import "./tokens.css";
      @media (prefers-reduced-motion: reduce) {
        @supports (display: grid) {
          :root { --motion-duration-state: 0ms; }
        }
      }
    `);
    expect(rules).toEqual([
      {
        selector: ":root",
        conditions: ["@media (prefers-reduced-motion: reduce)", "@supports (display: grid)"],
        declarations: new Map([["--motion-duration-state", "0ms"]]),
      },
    ]);
  });

  test("reads the descriptors of an @font-face rule like declarations", () => {
    const rules = readCssRules(`
      @font-face {
        font-family: "Inter";
        src: url("./inter/inter-variable.woff2") format("woff2");
      }
    `);
    expect(rules).toEqual([
      {
        selector: "@font-face",
        conditions: [],
        declarations: new Map([
          ["font-family", '"Inter"'],
          ["src", 'url("./inter/inter-variable.woff2") format("woff2")'],
        ]),
      },
    ]);
  });

  test("keeps braces and semicolons inside quoted strings out of the structure", () => {
    const rules = readCssRules(`.a { font-family: "A {font}", 'B;'; content: "x;}"; }`);
    expect(rules).toEqual([
      {
        selector: ".a",
        conditions: [],
        declarations: new Map([
          ["font-family", `"A {font}", 'B;'`],
          ["content", `"x;}"`],
        ]),
      },
    ]);
  });

  test.each([
    [".a { color: red;", "is not closed"],
    [".a { color: red; } }", 'without a "{"'],
    [".a { color red; }", "is not a declaration"],
    [".a { color: red; color: blue; }", "declares color twice"],
    [".a { content: 'open; }", "is not closed"],
    [".a { color: red; } .b", "is not followed by a block"],
    ["@font-face { src url(a.woff2); }", "is not a declaration"],
  ])("rejects %s", (css, message) => {
    expect(() => readCssRules(css)).toThrow(CssReadError);
    expect(() => readCssRules(css)).toThrow(message);
  });
});

describe("rootCustomProperties", () => {
  test("returns only the custom properties of the :root rule outside at-rules", () => {
    const rules = readCssRules(`
      :root { --space-1: 6px; color-scheme: dark; }
      @media (prefers-reduced-motion: reduce) { :root { --space-1: 0px; } }
      .a { --local: 1px; }
    `);
    expect(rootCustomProperties(rules)).toEqual(new Map([["--space-1", "6px"]]));
  });

  test.each([
    [".a { color: red; }", "found 0"],
    [":root { --a: 1px; } :root { --b: 2px; }", "found 2"],
  ])("rejects %s", (css, message) => {
    expect(() => rootCustomProperties(readCssRules(css))).toThrow(message);
  });
});

describe("usedCustomProperties", () => {
  test("lists every property read with var() once, ignoring comments", () => {
    const css = `
      /* var(--commented-out) */
      .a { color: var(--color-text); background: var( --color-surface-ground ); }
      .b { color: var(--color-text, var(--color-text-muted)); }
    `;
    expect(usedCustomProperties(css)).toEqual([
      "--color-text",
      "--color-surface-ground",
      "--color-text-muted",
    ]);
  });
});

describe("findLiteralColors", () => {
  test("finds hex values, colour functions and named colours", () => {
    const rules = readCssRules(`
      .hex { color: #fff; }
      .rgb { background: rgb(0 0 0 / 0.5); }
      .mix { background: color-mix(in oklch, var(--a), var(--b)); }
      .named { border: 1px solid Red; }
    `);
    expect(findLiteralColors(rules)).toEqual([
      { selector: ".hex", property: "color", value: "#fff" },
      { selector: ".rgb", property: "background", value: "rgb(0 0 0 / 0.5)" },
      {
        selector: ".mix",
        property: "background",
        value: "color-mix(in oklch, var(--a), var(--b))",
      },
      { selector: ".named", property: "border", value: "1px solid Red" },
    ]);
  });

  test("accepts tokens, colour-free keywords, quoted names and the token definitions", () => {
    const rules = readCssRules(`
      :root { --color-text: #e8e6e1; --shadow: 0 1px 2px rgb(0 0 0 / 0.5); }
      .a {
        color: var(--color-red);
        background: transparent;
        border-color: currentColor;
        font-family: "Tan Sans", "Gold", sans-serif;
        width: calc(tan(45deg) * 1rem);
        outline: var(--border-width-focus) solid var(--color-focus);
      }
    `);
    expect(findLiteralColors(rules)).toEqual([]);
  });
});
