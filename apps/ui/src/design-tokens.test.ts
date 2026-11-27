// Checks the real stylesheets against the design token rules of ADR 0082 and the colour schemes
// of ADR 0111.
import { COLOR_SCHEMES } from "@penguin-ops/gameplay";
import { describe, expect, test } from "vitest";

import {
  colorSchemeCustomProperties,
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
  checkGlowContrast,
  CONTRAST_PAIRS,
  contrastMinimums,
  contrastPairs,
  DECORATIVE_COLOR_TOKENS,
  describeContrast,
  schemeTokens,
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

describe("the colour schemes", () => {
  const schemes = colorSchemeCustomProperties(tokenRules);
  const ownSchemes = COLOR_SCHEMES.filter((scheme) => scheme !== "default");

  test("have a rule for every scheme of the settings but the default, and no others", () => {
    expect([...schemes.keys()].toSorted()).toEqual(ownSchemes.toSorted());
  });

  test.each(ownSchemes)("%s redefines every colour token and nothing else", (scheme) => {
    expect([...(schemes.get(scheme)?.keys() ?? [])].toSorted()).toEqual(colorTokens.toSorted());
  });

  test.each(ownSchemes)("%s changes only custom properties", (scheme) => {
    const rule = tokenRules.find(
      (candidate) => candidate.selector === `:root[data-color-scheme="${scheme}"]`,
    );
    expect([...(rule?.declarations.keys() ?? [])].filter((name) => !name.startsWith("--"))).toEqual(
      [],
    );
  });

  test.each(COLOR_SCHEMES)("%s meets its contrast minimum in every pair", (scheme) => {
    const failing = checkContrast(
      schemeTokens(tokens, schemes, scheme),
      contrastPairs(scheme),
      contrastMinimums(scheme),
    )
      .filter((result) => !result.passes)
      .map(describeContrast);
    expect(failing).toEqual([]);
  });

  test("high-contrast checks its text at 7:1 and its dividers", () => {
    expect(contrastMinimums("high-contrast").text).toBe(7);
    expect(contrastPairs("high-contrast").map((pair) => pair.foreground)).toContain("--color-rule");
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

describe("the effects", () => {
  // Each effect is a token that is `none` unless its setting on the root turns it on (ADR 0112).
  const effectTokens = [...tokens.keys()].filter((name) => name.startsWith("--effect-"));
  const schemes = colorSchemeCustomProperties(tokenRules);
  const GLOW = /^0 0 (\d+(?:\.\d+)?)rem color-mix\(in srgb, currentColor (\d+)%, transparent\)$/;

  function ruleOf(selector: string) {
    const rule = tokenRules.find(
      (candidate) => candidate.selector === selector && candidate.conditions.length === 0,
    );
    if (rule === undefined) {
      throw new Error(`tokens.css has no rule ${selector}.`);
    }
    return rule;
  }

  /** The glow's opacity, from 0 to 1, read from the rule that turns it on. */
  function glowStrength(): number {
    const value = ruleOf(':root[data-glow="on"]').declarations.get("--effect-glow") ?? "";
    const match = GLOW.exec(value);
    if (match?.[2] === undefined) {
      throw new Error(`The glow is not one soft shadow in the text's colour: ${value}`);
    }
    return Number(match[2]) / 100;
  }

  test("are the glow and the scanlines, both off by default", () => {
    expect(effectTokens).toEqual(["--effect-glow", "--effect-scanlines"]);
    expect(effectTokens.map((name) => tokens.get(name))).toEqual(["none", "none"]);
  });

  test("are each turned on by one rule that sets only its own token", () => {
    expect([...ruleOf(':root[data-glow="on"]').declarations.keys()]).toEqual(["--effect-glow"]);
    expect([...ruleOf(':root[data-scanlines="on"]').declarations.keys()]).toEqual([
      "--effect-scanlines",
    ]);
  });

  test("glow as one soft shadow in the text's own colour", () => {
    expect(glowStrength()).toBeGreaterThan(0);
    expect(glowStrength()).toBeLessThanOrEqual(1);
  });

  test.each(COLOR_SCHEMES)("keep the glowing text at its contrast minimum in %s", (scheme) => {
    const failing = checkGlowContrast(
      schemeTokens(tokens, schemes, scheme),
      glowStrength(),
      contrastMinimums(scheme),
    )
      .filter((result) => !result.passes)
      .map(describeContrast);
    expect(failing).toEqual([]);
  });

  test("draw the scanlines in their colour token on a transparent ground", () => {
    const value = ruleOf(':root[data-scanlines="on"]').declarations.get("--effect-scanlines");
    expect(value).toMatch(/^repeating-linear-gradient\( ?transparent /);
    expect(usedCustomProperties(`a { b: ${value ?? ""} }`)).toEqual(["--color-terminal-scanline"]);
  });

  test("come before the rules of reduce motion, which win over them", () => {
    const index = (selector: string) => tokenRules.findIndex((rule) => rule.selector === selector);
    const lastEffect = Math.max(
      index(':root[data-glow="on"]'),
      index(':root[data-scanlines="on"]'),
    );
    expect(lastEffect).toBeLessThan(index(':root[data-reduce-motion="on"]'));
    expect(lastEffect).toBeLessThan(index(':root:not([data-reduce-motion="off"])'));
  });
});

describe("reduce motion", () => {
  // The game's setting is the root's data-reduce-motion (ADR 0110): `on` always reduces motion,
  // the system's setting does unless the game's setting is `off`. It turns the effects off too
  // (ADR 0112).
  const reducedRules = tokenRules.filter(
    (rule) =>
      (rule.selector !== ":root" || rule.conditions.length > 0) &&
      !rule.selector.startsWith(":root[data-color-scheme=") &&
      rule.selector !== ':root[data-glow="on"]' &&
      rule.selector !== ':root[data-scanlines="on"]',
  );

  test("reduces motion for the setting on and for the system's setting unless it is off", () => {
    expect(reducedRules.map((rule) => [rule.selector, rule.conditions])).toEqual([
      [':root[data-reduce-motion="on"]', []],
      [':root:not([data-reduce-motion="off"])', ["@media (prefers-reduced-motion: reduce)"]],
    ]);
  });

  test("sets every motion duration to 0ms, turns every effect off and changes nothing else", () => {
    const durations = [...tokens.keys()].filter((name) => name.startsWith("--motion-duration-"));
    const effects = [...tokens.keys()].filter((name) => name.startsWith("--effect-"));
    expect(durations.length).toBeGreaterThan(0);
    expect(effects.length).toBeGreaterThan(0);
    for (const rule of reducedRules) {
      expect(rule.declarations).toEqual(
        new Map([
          ...durations.map((name): [string, string] => [name, "0ms"]),
          ...effects.map((name): [string, string] => [name, "none"]),
        ]),
      );
    }
  });
});
