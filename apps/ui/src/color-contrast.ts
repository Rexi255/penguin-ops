// Colour contrast as defined by WCAG 2.2 (ADR 0082): relative luminance of an sRGB colour and
// the contrast ratio of two colours. The design token test uses it; the styleguide (ROADMAP
// M3.0c) and the colour schemes (M3.9) will show and check the same numbers.

/** An sRGB colour with channels from 0 to 255. */
export interface RgbColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

/** How a colour pair is used, which sets its WCAG AA minimum. */
export type ContrastUse =
  /** Running text and labels below the large text size (WCAG 1.4.3). */
  | "text"
  /** Parts of controls and graphics needed to understand them, such as a focus ring (WCAG 1.4.11). */
  | "non-text";

/** The WCAG AA contrast minimum for each use. */
export const MINIMUM_CONTRAST: Readonly<Record<ContrastUse, number>> = {
  text: 4.5,
  "non-text": 3,
};

const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** Parses a colour written as `#rrggbb`, the only form the design tokens use. */
export function parseHexColor(value: string): RgbColor {
  const match = HEX_COLOR.exec(value.trim());
  if (match === null) {
    throw new Error(`"${value}" is not a colour of the form #rrggbb.`);
  }
  const [, red = "", green = "", blue = ""] = match;
  return {
    red: Number.parseInt(red, 16),
    green: Number.parseInt(green, 16),
    blue: Number.parseInt(blue, 16),
  };
}

/** Converts one gamma-encoded sRGB channel (0 to 255) to linear light (0 to 1). */
function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** The relative luminance of a colour, from 0 (black) to 1 (white). */
export function relativeLuminance(color: RgbColor): number {
  return (
    0.2126 * linearChannel(color.red) +
    0.7152 * linearChannel(color.green) +
    0.0722 * linearChannel(color.blue)
  );
}

/**
 * The contrast ratio of two colours, from 1 (equal) to 21 (black and white). The order of the
 * colours does not matter. The ratio is not rounded: WCAG compares the exact value.
 */
export function contrastRatio(first: RgbColor, second: RgbColor): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
