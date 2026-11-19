import { describe, expect, test } from "vitest";

import { checkContrast, type ContrastPair, describeContrast } from "./token-contrast";

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

describe("describeContrast", () => {
  test("names the pair, its ratio, its minimum and its purpose", () => {
    const [result] = checkContrast(TOKENS, [pair("--ink", "--paper", "non-text")]);
    expect(result && describeContrast(result)).toBe(
      "--ink on --paper: 21.00:1 (non-text, needs 3:1) for a test",
    );
  });
});
