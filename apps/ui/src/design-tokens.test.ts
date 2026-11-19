// Checks the real stylesheets against the design token rules of ADR 0082.
import { describe, expect, test } from "vitest";

import {
  findLiteralColors,
  readCssRules,
  rootCustomProperties,
  usedCustomProperties,
} from "./css-rules";
import stylesCss from "./styles.css?raw";
import {
  checkContrast,
  CONTRAST_PAIRS,
  DECORATIVE_COLOR_TOKENS,
  describeContrast,
} from "./token-contrast";
import tokensCss from "./tokens.css?raw";

const tokenRules = readCssRules(tokensCss);
const tokens = rootCustomProperties(tokenRules);
const colorTokens = [...tokens.keys()].filter((name) => name.startsWith("--color-"));

describe("the colour tokens", () => {
  test("exist", () => {
    expect(colorTokens.length).toBeGreaterThan(0);
  });

  test("meet WCAG AA contrast in every pair", () => {
    const failing = checkContrast(tokens, CONTRAST_PAIRS)
      .filter((result) => !result.passes)
      .map(describeContrast);
    expect(failing).toEqual([]);
  });

  test("are each in a contrast pair or listed as decorative, never both", () => {
    const paired = new Set(CONTRAST_PAIRS.flatMap((pair) => [pair.foreground, pair.background]));
    const decorative = new Set(Object.keys(DECORATIVE_COLOR_TOKENS));
    expect(colorTokens.filter((name) => !paired.has(name) && !decorative.has(name))).toEqual([]);
    expect(colorTokens.filter((name) => paired.has(name) && decorative.has(name))).toEqual([]);
    expect([...decorative].filter((name) => !tokens.has(name))).toEqual([]);
  });

  test("have no duplicate pairs", () => {
    const keys = CONTRAST_PAIRS.map((pair) => `${pair.foreground} on ${pair.background}`);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });
});

describe("the stylesheets", () => {
  test.each([
    ["tokens.css", tokensCss],
    ["styles.css", stylesCss],
  ])("%s reads only defined tokens", (_name, css) => {
    expect(usedCustomProperties(css).filter((name) => !tokens.has(name))).toEqual([]);
  });

  test.each([
    ["tokens.css", tokenRules],
    ["styles.css", readCssRules(stylesCss)],
  ])("%s writes no colour outside the token definitions", (_name, rules) => {
    expect(findLiteralColors(rules)).toEqual([]);
  });

  test("styles.css defines no tokens of its own", () => {
    const ownProperties = readCssRules(stylesCss).flatMap((rule) =>
      [...rule.declarations.keys()].filter((property) => property.startsWith("--")),
    );
    expect(ownProperties).toEqual([]);
  });
});

describe("reduce motion", () => {
  const reducedRules = tokenRules.filter((rule) =>
    rule.conditions.includes("@media (prefers-reduced-motion: reduce)"),
  );

  test("sets every motion duration to 0ms and changes nothing else", () => {
    const durations = [...tokens.keys()].filter((name) => name.startsWith("--motion-duration-"));
    expect(durations.length).toBeGreaterThan(0);
    expect(reducedRules.map((rule) => rule.selector)).toEqual([":root"]);
    expect(reducedRules[0]?.declarations).toEqual(new Map(durations.map((name) => [name, "0ms"])));
  });
});
