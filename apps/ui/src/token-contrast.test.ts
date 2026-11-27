import { describe, expect, test } from "vitest";

import {
  checkContrast,
  CONTRAST_PAIRS,
  contrastMinimums,
  contrastPairs,
  type ContrastPair,
  describeContrast,
  schemeTokens,
} from "./token-contrast";

const TOKENS = new Map([
  ["--ink", "#000000"],
  ["--paper", "#ffffff"],
  ["--grey-light", "#777777"],
  ["--grey-dark", "#767676"],
]);

function pair(foreground: string, background: string, use: ContrastPair["use"]): ContrastPair {
  return { foreground, background, use, purpose: "a test" };
}

describe("checkContrast", () => {
  test("passes a pair at or above the minimum of its use", () => {
    const [result] = checkContrast(TOKENS, [pair("--grey-dark", "--paper", "text")]);
    expect(result?.passes).toBe(true);
    expect(result?.minimum).toBe(4.5);
    expect(result?.ratio).toBeCloseTo(4.54, 2);
  });

  test("fails a text pair below 4.5:1 without rounding it up", () => {
    // 4.48:1 would round to 4.5:1, but WCAG compares the exact ratio.
    const [result] = checkContrast(TOKENS, [pair("--grey-light", "--paper", "text")]);
    expect(result?.passes).toBe(false);
  });

  test("applies 3:1 to non-text pairs", () => {
    const [result] = checkContrast(TOKENS, [pair("--grey-light", "--paper", "non-text")]);
    expect(result?.minimum).toBe(3);
    expect(result?.passes).toBe(true);
  });

  test("rejects a pair with an unknown token", () => {
    expect(() => checkContrast(TOKENS, [pair("--missing", "--paper", "text")])).toThrow(
      "The contrast pairs use --missing, which is not a design token.",
    );
  });

  test("rejects a token that is not a #rrggbb colour", () => {
    const tokens = new Map([...TOKENS, ["--space", "6px"]]);
    expect(() => checkContrast(tokens, [pair("--space", "--paper", "text")])).toThrow(
      '"6px" is not a colour of the form #rrggbb.',
    );
  });
});

describe("checkContrast with other minimums", () => {
  test("applies the given minimum of the pair's use", () => {
    const [result] = checkContrast(TOKENS, [pair("--grey-dark", "--paper", "text")], {
      text: 7,
      "non-text": 3,
    });
    expect(result?.minimum).toBe(7);
    expect(result?.passes).toBe(false);
  });
});

describe("contrastMinimums", () => {
  test.each(["default", "retro-crt", "solarized"] as const)("asks for WCAG AA in %s", (scheme) => {
    expect(contrastMinimums(scheme)).toEqual({ text: 4.5, "non-text": 3 });
  });

  test("asks for WCAG AAA text in the high contrast scheme", () => {
    expect(contrastMinimums("high-contrast")).toEqual({ text: 7, "non-text": 3 });
  });
});

describe("contrastPairs", () => {
  test.each(["default", "retro-crt", "solarized"] as const)(
    "are the common pairs in %s",
    (scheme) => {
      expect(contrastPairs(scheme)).toBe(CONTRAST_PAIRS);
    },
  );

  test("add the dividers on every surface in the high contrast scheme", () => {
    const extra = contrastPairs("high-contrast").slice(CONTRAST_PAIRS.length);
    expect(extra.map((entry) => [entry.foreground, entry.background, entry.use])).toEqual([
      ["--color-rule", "--color-surface-ground", "non-text"],
      ["--color-rule", "--color-surface-panel", "non-text"],
      ["--color-rule", "--color-surface-raised", "non-text"],
      ["--color-rule", "--color-surface-terminal", "non-text"],
    ]);
  });
});

describe("schemeTokens", () => {
  const defaults = new Map([
    ["--ink", "#000000"],
    ["--paper", "#ffffff"],
  ]);
  const schemes = new Map([["solarized", new Map([["--paper", "#fdf6e3"]])]]);

  test("lays a scheme's values over the defaults", () => {
    expect(schemeTokens(defaults, schemes, "solarized")).toEqual(
      new Map([
        ["--ink", "#000000"],
        ["--paper", "#fdf6e3"],
      ]),
    );
  });

  test("keeps the defaults for a scheme without values of its own", () => {
    expect(schemeTokens(defaults, schemes, "default")).toEqual(defaults);
  });
});

describe("describeContrast", () => {
  test("names the pair, its ratio, its minimum and its purpose", () => {
    const [result] = checkContrast(TOKENS, [pair("--ink", "--paper", "non-text")]);
    expect(result && describeContrast(result)).toBe(
      "--ink on --paper: 21.00:1 (non-text, needs 3:1) for a test",
    );
  });
});
