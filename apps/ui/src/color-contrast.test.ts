import { describe, expect, test } from "vitest";

import { contrastRatio, parseHexColor, relativeLuminance } from "./color-contrast";

describe("parseHexColor", () => {
  test("reads the three channels of #rrggbb in either case", () => {
    expect(parseHexColor("#e0701a")).toEqual({ red: 224, green: 112, blue: 26 });
    expect(parseHexColor(" #E0701A ")).toEqual({ red: 224, green: 112, blue: 26 });
  });

  test.each(["#fff", "#e0701a80", "e0701a", "#e0701g", "rgb(0 0 0)", ""])(
    'rejects "%s"',
    (value) => {
      expect(() => parseHexColor(value)).toThrow("is not a colour of the form #rrggbb");
    },
  );
});

describe("relativeLuminance", () => {
  test("is 0 for black and 1 for white", () => {
    expect(relativeLuminance(parseHexColor("#000000"))).toBe(0);
    expect(relativeLuminance(parseHexColor("#ffffff"))).toBeCloseTo(1, 10);
  });

  test("weights green most and blue least", () => {
    expect(relativeLuminance(parseHexColor("#ff0000"))).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance(parseHexColor("#00ff00"))).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance(parseHexColor("#0000ff"))).toBeCloseTo(0.0722, 4);
  });

  test("uses the linear segment for very dark channels", () => {
    // 10 / 255 = 0.039 is below the threshold 0.04045, so it is divided by 12.92.
    expect(relativeLuminance(parseHexColor("#0a0a0a"))).toBeCloseTo(10 / 255 / 12.92, 10);
  });
});

describe("contrastRatio", () => {
  test("is 21 for black on white and 1 for equal colours", () => {
    expect(contrastRatio(parseHexColor("#000000"), parseHexColor("#ffffff"))).toBeCloseTo(21, 10);
    expect(contrastRatio(parseHexColor("#e0701a"), parseHexColor("#e0701a"))).toBe(1);
  });

  test("does not depend on the order of the colours", () => {
    const orange = parseHexColor("#e0701a");
    const ground = parseHexColor("#16191d");
    expect(contrastRatio(orange, ground)).toBe(contrastRatio(ground, orange));
  });

  test("matches known values just below and above the text minimum", () => {
    // Commonly cited reference values: #767676 is the lightest grey that passes 4.5:1 on white.
    expect(contrastRatio(parseHexColor("#777777"), parseHexColor("#ffffff"))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(parseHexColor("#767676"), parseHexColor("#ffffff"))).toBeCloseTo(4.54, 2);
  });
});
