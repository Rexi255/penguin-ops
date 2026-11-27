// The colour token pairs that must meet WCAG AA contrast (ADR 0082). Every colour token of
// tokens.css is in at least one pair or listed as decorative; the design token test checks both.
// Every colour scheme passes the same pairs; the high contrast scheme asks for more (ADR 0111).
import type { ColorScheme } from "@penguin-ops/gameplay";

import {
  blendColors,
  contrastRatio,
  MINIMUM_CONTRAST,
  parseHexColor,
  type ContrastUse,
} from "./color-contrast";

/** A foreground token that is shown on a background token. */
export interface ContrastPair {
  readonly foreground: string;
  readonly background: string;
  readonly use: ContrastUse;
  /** Where the pair appears, for the error message of a failing pair. */
  readonly purpose: string;
}

/** The result of checking one pair against one set of token values. */
export interface ContrastResult {
  readonly pair: ContrastPair;
  readonly ratio: number;
  readonly minimum: number;
  readonly passes: boolean;
}

/** Every foreground on every background, with one use and purpose. */
function allOn(
  foregrounds: readonly string[],
  backgrounds: readonly string[],
  use: ContrastUse,
  purpose: string,
): ContrastPair[] {
  return foregrounds.flatMap((foreground) =>
    backgrounds.map((background) => ({ foreground, background, use, purpose })),
  );
}

const SURFACES = [
  "--color-surface-ground",
  "--color-surface-panel",
  "--color-surface-raised",
  "--color-surface-terminal",
];

const CABLES = [
  "--color-cable-ticket",
  "--color-cable-mail",
  "--color-cable-handbook",
  "--color-cable-incident",
];

/** The pairs of the visual world "Label Tape & Patch Cable" (DESIGN.md). */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...allOn(
    ["--color-text", "--color-text-muted"],
    [...SURFACES, "--color-surface-selection"],
    "text",
    "body and secondary text on every surface and on selected text",
  ),
  ...allOn(
    ["--color-player"],
    ["--color-surface-panel", "--color-surface-raised"],
    "text",
    "the current step in the side panel",
  ),
  ...allOn(
    ["--color-prompt-user", "--color-prompt-directory"],
    ["--color-surface-terminal"],
    "text",
    "the user, host and directory of the prompt in the terminal",
  ),
  ...allOn(
    CABLES,
    ["--color-surface-ground", "--color-surface-panel", "--color-surface-raised"],
    "text",
    "state text and cable runs in the colour of their kind of work",
  ),
  ...allOn(
    ["--color-tape-ink"],
    ["--color-tape-primary", "--color-tape-secondary", ...CABLES],
    "text",
    "print on label tape and on the tape of typed toasts",
  ),
  ...allOn(["--color-focus"], SURFACES, "non-text", "the keyboard focus ring on every surface"),
  ...allOn(
    ["--color-control-border"],
    SURFACES,
    "non-text",
    "the boundary of text fields and choice cards, and the ring of a choice marker",
  ),
  ...allOn(
    ["--color-surface-terminal"],
    ["--color-terminal-cursor"],
    "text",
    "the character under the terminal's cursor",
  ),
  ...allOn(
    ["--color-terminal-cursor"],
    ["--color-surface-terminal"],
    "non-text",
    "the terminal's cursor, filled or as a frame without the focus",
  ),
  ...allOn(
    ["--color-player"],
    ["--color-surface-ground"],
    "non-text",
    "the frame of the chosen choice card and its marker's dot on the page ground",
  ),
  ...allOn(
    ["--color-cable-incident"],
    ["--color-surface-terminal"],
    "non-text",
    "the boundary of a text field with a problem",
  ),
  ...allOn(
    ["--color-text", "--color-text-muted", "--color-prompt-user", "--color-prompt-directory"],
    ["--color-terminal-scanline"],
    "text",
    "the terminal's text, notices and prompt on the stripes of the scanlines",
  ),
  ...allOn(
    ["--color-terminal-cursor"],
    ["--color-terminal-scanline"],
    "non-text",
    "the frame of the terminal's cursor on the stripes of the scanlines",
  ),
];

/**
 * The share of the glow's colour that reaches the ground at the glow's brightest point, between
 * the strokes of dense characters such as `#` and `@` (ADR 0112). Measured in Chromium at about
 * 0.41 for a blur of 0.375rem; the styleguide's browser test checks that the real glow stays below
 * it.
 */
export const GLOW_PEAK_COVERAGE = 0.45;

/**
 * The pairs the glow lights (ADR 0112): the terminal shows it only on its text colour, on the
 * terminal and on the stripes of the scanlines.
 */
export const GLOW_PAIRS: readonly ContrastPair[] = allOn(
  ["--color-text"],
  ["--color-surface-terminal", "--color-terminal-scanline"],
  "text",
  "the terminal's text with the glow, on the ground it lights",
);

/**
 * Checks every glow pair with its ground lit by the glow at its brightest: the text colour laid on
 * the background with `strength` (the glow's opacity, 0 to 1) times `GLOW_PEAK_COVERAGE`.
 */
export function checkGlowContrast(
  tokens: ReadonlyMap<string, string>,
  strength: number,
  minimums: Readonly<Record<ContrastUse, number>> = MINIMUM_CONTRAST,
): ContrastResult[] {
  return GLOW_PAIRS.map((pair) => {
    const foreground = parseHexColor(tokenValue(tokens, pair.foreground));
    const ground = blendColors(
      parseHexColor(tokenValue(tokens, pair.background)),
      foreground,
      strength * GLOW_PEAK_COVERAGE,
    );
    const ratio = contrastRatio(foreground, ground);
    const minimum = minimums[pair.use];
    return { pair, ratio, minimum, passes: ratio >= minimum };
  });
}

/** Colour tokens without a contrast minimum, with the reason. */
export const DECORATIVE_COLOR_TOKENS: Readonly<Record<string, string>> = {
  "--color-rule":
    "hairline dividers between areas that their surface colours already tell apart (WCAG 1.4.11 " +
    "does not apply to decoration)",
};

/** WCAG AAA for text (1.4.6), the high contrast scheme's minimum; non-text has no AAA level. */
const HIGH_CONTRAST_MINIMUMS: Readonly<Record<ContrastUse, number>> = {
  text: 7,
  "non-text": 3,
};

/** The minimum contrast of each use in a colour scheme. */
export function contrastMinimums(scheme: ColorScheme): Readonly<Record<ContrastUse, number>> {
  switch (scheme) {
    case "default":
    case "retro-crt":
    case "solarized":
      return MINIMUM_CONTRAST;
    case "high-contrast":
      return HIGH_CONTRAST_MINIMUMS;
  }
}

/**
 * The pairs a colour scheme must pass: the pairs of every scheme and, in the high contrast
 * scheme, the dividers too, which are decorative elsewhere but must be seen there.
 */
export function contrastPairs(scheme: ColorScheme): readonly ContrastPair[] {
  switch (scheme) {
    case "default":
    case "retro-crt":
    case "solarized":
      return CONTRAST_PAIRS;
    case "high-contrast":
      return [
        ...CONTRAST_PAIRS,
        ...allOn(
          ["--color-rule"],
          SURFACES,
          "non-text",
          "the dividers between areas, visible in the high contrast scheme",
        ),
      ];
  }
}

/**
 * The token values of a colour scheme: the default values with the scheme's own on top. The
 * default scheme has no values of its own.
 */
export function schemeTokens(
  defaults: ReadonlyMap<string, string>,
  schemes: ReadonlyMap<string, ReadonlyMap<string, string>>,
  scheme: ColorScheme,
): ReadonlyMap<string, string> {
  return new Map([...defaults, ...(schemes.get(scheme) ?? [])]);
}

function tokenValue(tokens: ReadonlyMap<string, string>, name: string): string {
  const value = tokens.get(name);
  if (value === undefined) {
    throw new Error(`The contrast pairs use ${name}, which is not a design token.`);
  }
  return value;
}

/**
 * Checks every pair against the given token values (name to `#rrggbb`) and the minimum of its use,
 * WCAG AA unless other minimums are given.
 */
export function checkContrast(
  tokens: ReadonlyMap<string, string>,
  pairs: readonly ContrastPair[],
  minimums: Readonly<Record<ContrastUse, number>> = MINIMUM_CONTRAST,
): ContrastResult[] {
  return pairs.map((pair) => {
    const ratio = contrastRatio(
      parseHexColor(tokenValue(tokens, pair.foreground)),
      parseHexColor(tokenValue(tokens, pair.background)),
    );
    const minimum = minimums[pair.use];
    return { pair, ratio, minimum, passes: ratio >= minimum };
  });
}

/** One line per result, for test failure messages and the styleguide. */
export function describeContrast(result: ContrastResult): string {
  const { pair, ratio, minimum } = result;
  return (
    `${pair.foreground} on ${pair.background}: ${ratio.toFixed(2)}:1 ` +
    `(${pair.use}, needs ${String(minimum)}:1) for ${pair.purpose}`
  );
}
