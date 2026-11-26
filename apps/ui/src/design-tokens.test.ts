// Checks the real stylesheets against the design token rules of ADR 0082.
import { describe, expect, test } from "vitest";

import {
  findLiteralColors,
  readCssRules,
  rootCustomProperties,
  usedCustomProperties,
} from "./css-rules";
import fontsCss from "./fonts/fonts.css?raw";
import styleguideCss from "./styleguide/styleguide.css?raw";
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
    ["fonts/fonts.css", fontsCss],
    ["styles.css", stylesCss],
    ["styleguide/styleguide.css", styleguideCss],
  ])("%s reads only defined tokens", (_name, css) => {
    expect(usedCustomProperties(css).filter((name) => !tokens.has(name))).toEqual([]);
  });

  test.each([
    ["tokens.css", tokenRules],
    ["fonts/fonts.css", readCssRules(fontsCss)],
    ["styles.css", readCssRules(stylesCss)],
    ["styleguide/styleguide.css", readCssRules(styleguideCss)],
  ])("%s writes no colour outside the token definitions", (_name, rules) => {
    expect(findLiteralColors(rules)).toEqual([]);
  });

  test.each([
    ["fonts/fonts.css", fontsCss],
    ["styles.css", stylesCss],
    ["styleguide/styleguide.css", styleguideCss],
  ])("%s defines no tokens of its own", (_name, css) => {
    const ownProperties = readCssRules(css).flatMap((rule) =>
      [...rule.declarations.keys()].filter((property) => property.startsWith("--")),
    );
    expect(ownProperties).toEqual([]);
  });
});

describe("the typography", () => {
  const TYPE_PROPERTIES = ["font-family", "font-size", "font-weight", "line-height"];
  const TOKEN_VALUE = /^var\(--[\w-]+\)$/;

  test.each([
    ["styles.css", readCssRules(stylesCss)],
    ["styleguide/styleguide.css", readCssRules(styleguideCss)],
  ])("%s sets faces, sizes, weights and line heights only with tokens", (_name, rules) => {
    const literal = rules.flatMap((rule) =>
      [...rule.declarations]
        .filter(
          ([property, value]) =>
            (TYPE_PROPERTIES.includes(property) &&
              !TOKEN_VALUE.test(value) &&
              value !== "inherit") ||
            (property === "font" && value !== "inherit"),
        )
        .map(([property, value]) => `${rule.selector} { ${property}: ${value} }`),
    );
    expect(literal).toEqual([]);
  });

  test.each([
    ["styles.css", readCssRules(stylesCss)],
    ["styleguide/styleguide.css", readCssRules(styleguideCss)],
  ])("%s turns ligatures off wherever it sets the monospace face", (_name, rules) => {
    const withLigatures = rules
      .filter((rule) => rule.declarations.get("font-family") === "var(--font-mono)")
      .filter((rule) => rule.declarations.get("font-variant-ligatures") !== "none")
      .map((rule) => rule.selector);
    expect(withLigatures).toEqual([]);
  });
});

describe("the type scale", () => {
  const SIZE = /^--text-([a-z]+)-size$/;
  const LEADING = /^--text-([a-z]+)-leading$/;
  const textTokens = [...tokens.keys()].filter((name) => name.startsWith("--text-"));
  const roles = textTokens.flatMap((name) => SIZE.exec(name)?.[1] ?? []);

  /** A token's value in rem, following one var() to the token it reads. */
  function remOf(name: string): number {
    const raw = tokens.get(name) ?? "";
    const value = /^var\((--[\w-]+)\)$/.exec(raw)?.[1] ?? name;
    const match = /^(\d+(?:\.\d+)?)rem$/.exec(tokens.get(value) ?? "");
    if (match?.[1] === undefined) {
      throw new Error(`${name} is not a length in rem: ${raw}`);
    }
    return Number(match[1]);
  }

  test("has a size and a line height for every role and nothing else", () => {
    expect(roles.length).toBeGreaterThan(0);
    const expected = roles.flatMap((role) => [`--text-${role}-size`, `--text-${role}-leading`]);
    expect(textTokens.toSorted()).toEqual(expected.toSorted());
  });

  test("snaps every line height to a quarter of the cell height", () => {
    const quarterCell = remOf("--cell-block") / 4;
    const offGrid = textTokens
      .filter((name) => LEADING.test(name))
      .filter((name) => !Number.isInteger(remOf(name) / quarterCell));
    expect(offGrid).toEqual([]);
  });

  test("gives every role a line height above its size", () => {
    const cramped = roles.filter(
      (role) => remOf(`--text-${role}-leading`) <= remOf(`--text-${role}-size`),
    );
    expect(cramped).toEqual([]);
  });

  test("sets terminal text on the character cell", () => {
    expect(tokens.get("--text-terminal-leading")).toBe("var(--cell-block)");
    // The cell's width is 0.6 em of the terminal text, the advance width of JetBrains Mono.
    expect(remOf("--cell-inline")).toBeCloseTo(remOf("--text-terminal-size") * 0.6, 10);
  });
});

describe("reduce motion", () => {
  // The game's setting is the root's data-reduce-motion (ADR 0110): `on` always reduces motion,
  // the system's setting does unless the game's setting is `off`.
  const reducedRules = tokenRules.filter(
    (rule) => rule.selector !== ":root" || rule.conditions.length > 0,
  );

  test("reduces motion for the setting on and for the system's setting unless it is off", () => {
    expect(reducedRules.map((rule) => [rule.selector, rule.conditions])).toEqual([
      [':root[data-reduce-motion="on"]', []],
      [':root:not([data-reduce-motion="off"])', ["@media (prefers-reduced-motion: reduce)"]],
    ]);
  });

  test("sets every motion duration to 0ms and changes nothing else", () => {
    const durations = [...tokens.keys()].filter((name) => name.startsWith("--motion-duration-"));
    expect(durations.length).toBeGreaterThan(0);
    for (const rule of reducedRules) {
      expect(rule.declarations).toEqual(new Map(durations.map((name) => [name, "0ms"])));
    }
  });
});
