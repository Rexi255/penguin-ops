// Guards the logo and app icon files (assets/brand/README.md, ADR 0040, ADR 0088, ADR 0089): every
// file exists, the SVGs are self-contained and use only the brand colours, and the raster files
// have the sizes that electron-builder and GitHub expect and pixels in the brand colours.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { decodeIco } from "./brand/ico.ts";
import { decodePng, type DecodedPng } from "./brand/png.ts";
import {
  BRAND_BLACK,
  BRAND_ORANGE,
  BRAND_WHITE,
  LINUX_ICON_SIZES,
  linuxIconName,
  RASTER_FILES,
  type RasterImage,
} from "./brand/raster-plan.ts";

const ROOT = join(import.meta.dirname, "..");
const BRAND = join(ROOT, "assets", "brand");
const BUILD = join(ROOT, "apps", "desktop", "build");

/** Mono variants keep pure white and black (ADR 0088). */
const MONO_WHITE = "#ffffff";
const MONO_BLACK = "#000000";

/** Colours each SVG may use. Mono variants use exactly one colour. */
const SVG_COLOURS: Readonly<Record<string, readonly string[]>> = {
  "svg/logo-signet.svg": [BRAND_BLACK, BRAND_WHITE, BRAND_ORANGE],
  "svg/logo-signet-mono-dark.svg": [MONO_WHITE],
  "svg/logo-signet-mono-light.svg": [MONO_BLACK],
  "svg/logo-wordmark-dark.svg": [BRAND_WHITE, BRAND_ORANGE],
  "svg/logo-wordmark-light.svg": [BRAND_BLACK, BRAND_ORANGE],
  "svg/logo-wordmark-mono-dark.svg": [MONO_WHITE],
  "svg/logo-wordmark-mono-light.svg": [MONO_BLACK],
  "svg/logo-horizontal-dark.svg": [BRAND_BLACK, BRAND_WHITE, BRAND_ORANGE],
  "svg/logo-horizontal-light.svg": [BRAND_BLACK, BRAND_WHITE, BRAND_ORANGE],
  "svg/logo-horizontal-mono-dark.svg": [MONO_WHITE],
  "svg/logo-horizontal-mono-light.svg": [MONO_BLACK],
  "web/favicon.svg": [BRAND_BLACK, BRAND_WHITE, BRAND_ORANGE],
};

/** Elements a logo SVG may contain: shapes only, no text, images, scripts or styles. */
const ALLOWED_ELEMENTS = new Set(["svg", "title", "path"]);

function readSvg(relativePath: string): string {
  return readFileSync(join(BRAND, relativePath), "utf8");
}

/** Element names in an SVG that are not on the allow list. */
function disallowedElements(svg: string): string[] {
  const names = new Set([...svg.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((match) => match[1] ?? ""));
  return [...names].filter((name) => !ALLOWED_ELEMENTS.has(name));
}

function hexToRgb(hex: string): number[] {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

const BRAND_RGB = [BRAND_BLACK, BRAND_WHITE, BRAND_ORANGE].map(hexToRgb);

/** Chromium's anti-aliasing rounds a mixed channel at most one step past the mixed colours. */
const ROUNDING = 1;

/**
 * The lowest and highest value of each channel over the brand colours, widened by ROUNDING.
 * Anti-aliasing mixes neighbouring colours, so every opaque pixel of a correct image lies in this
 * range; the old logo colours `#0d1117` (red 13) and `#ffffff` lie outside it.
 */
const CHANNEL_RANGE = [0, 1, 2].map((channel) => {
  const values = BRAND_RGB.map((rgb) => rgb[channel] ?? 0);
  return { min: Math.min(...values) - ROUNDING, max: Math.max(...values) + ROUNDING };
});

interface PixelReport {
  readonly corners: readonly string[];
  /** Opaque pixels with a channel outside CHANNEL_RANGE, as `#rrggbb`. */
  readonly foreign: readonly string[];
  /** Brand colours that appear as exact opaque pixels. */
  readonly brandColours: readonly string[];
}

function hex(pixels: Uint8Array, offset: number): string {
  return `#${[0, 1, 2].map((channel) => (pixels[offset + channel] ?? 0).toString(16).padStart(2, "0")).join("")}`;
}

/** Reads a pixel as `#rrggbb` when opaque, `transparent` when fully transparent. */
function pixelAt(image: DecodedPng, x: number, y: number): string {
  const offset = (y * image.width + x) * 4;
  const alpha = image.pixels[offset + 3] ?? 0;
  if (alpha === 0) {
    return "transparent";
  }
  return alpha === 255
    ? hex(image.pixels, offset)
    : `${hex(image.pixels, offset)}/${String(alpha)}`;
}

function inspectPixels(image: DecodedPng): PixelReport {
  const foreign = new Set<string>();
  const exact = new Set<string>();
  const brand = new Set([BRAND_BLACK, BRAND_WHITE, BRAND_ORANGE]);
  for (let offset = 0; offset < image.pixels.length; offset += 4) {
    if (image.pixels[offset + 3] !== 255) {
      continue;
    }
    const colour = hex(image.pixels, offset);
    const inRange = CHANNEL_RANGE.every(({ min, max }, channel) => {
      const value = image.pixels[offset + channel] ?? 0;
      return value >= min && value <= max;
    });
    if (!inRange) {
      foreign.add(colour);
    }
    if (brand.has(colour)) {
      exact.add(colour);
    }
  }
  const last = { x: image.width - 1, y: image.height - 1 };
  return {
    corners: [
      pixelAt(image, 0, 0),
      pixelAt(image, last.x, 0),
      pixelAt(image, 0, last.y),
      pixelAt(image, last.x, last.y),
    ],
    foreign: [...foreign].sort(),
    brandColours: [...exact].sort(),
  };
}

/** Checks a decoded image against its entry in the raster plan. */
function expectRaster(png: DecodedPng, image: RasterImage): void {
  expect({ width: png.width, height: png.height }).toEqual({
    width: image.width,
    height: image.height,
  });
  const report = inspectPixels(png);
  expect(report.corners).toEqual(Array<string>(4).fill(image.background ?? "transparent"));
  expect(report.foreign).toEqual([]);
  expect(report.brandColours).toEqual([BRAND_BLACK, BRAND_WHITE, BRAND_ORANGE].sort());
}

describe("logo SVG files", () => {
  it("lists exactly the SVG files that exist", () => {
    const existing = [
      ...readdirSync(join(BRAND, "svg")).map((name) => `svg/${name}`),
      ...readdirSync(join(BRAND, "web"))
        .filter((name) => name.endsWith(".svg"))
        .map((name) => `web/${name}`),
    ].sort();
    expect(existing).toEqual(Object.keys(SVG_COLOURS).sort());
  });

  it.each(Object.entries(SVG_COLOURS))(
    "%s is a self-contained SVG with only the brand colours",
    (path, colours) => {
      const svg = readSvg(path);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="')).toBe(true);
      expect(svg).toContain('role="img"><title>PenguinOps</title>');

      expect(disallowedElements(svg)).toEqual([]);
      // No event handlers, links or external references.
      expect(svg).not.toMatch(/\son\w+=|href=|url\(/i);

      const used = new Set(
        [...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()),
      );
      expect([...used].sort()).toEqual([...colours].sort());
    },
  );

  it("uses the signet as the favicon", () => {
    expect(readSvg("web/favicon.svg")).toBe(readSvg("svg/logo-signet.svg"));
  });

  it("finds scripts, text and embedded images in the element check", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text>Hi</text>' +
      '<image href="x.png"/><path d="M0 0"/></svg>';
    expect(disallowedElements(svg)).toEqual(["script", "text", "image"]);
  });
});

describe("raster brand files", () => {
  it("lists exactly the raster files that exist", () => {
    const existing = [
      ...readdirSync(BUILD)
        .filter((name) => /\.(?:png|ico)$/.test(name))
        .map((name) => `apps/desktop/build/${name}`),
      ...readdirSync(join(BUILD, "icons")).map((name) => `apps/desktop/build/icons/${name}`),
      ...readdirSync(join(BRAND, "web"))
        .filter((name) => /\.(?:png|ico)$/.test(name))
        .map((name) => `assets/brand/web/${name}`),
    ].sort();
    expect(existing).toEqual(RASTER_FILES.map((file) => file.path).sort());
  });

  it.each(RASTER_FILES.map((file) => [file.path, file] as const))(
    "%s has the planned sizes and only brand colours",
    (path, file) => {
      const bytes = readFileSync(join(ROOT, path));
      if (file.kind === "png") {
        expectRaster(decodePng(bytes), file.image);
        return;
      }
      const images = decodeIco(bytes);
      expect(images.map((image) => image.size)).toEqual(file.images.map((image) => image.width));
      images.forEach((image, index) => {
        const planned = file.images[index];
        expect(planned).toBeDefined();
        if (planned !== undefined) {
          expectRaster(decodePng(image.png), planned);
        }
      });
    },
  );

  it("puts the same images into the Windows icon as into the Linux icons", () => {
    const shared = decodeIco(readFileSync(join(BUILD, "icon.ico"))).filter((image) =>
      LINUX_ICON_SIZES.some((size) => size === image.size),
    );
    expect(shared.length).toBeGreaterThan(0);
    for (const image of shared) {
      const linux = readFileSync(join(BUILD, "icons", linuxIconName(image.size)));
      expect(Buffer.from(image.png).equals(linux), `${String(image.size)} px`).toBe(true);
    }
  });

  it("finds the old logo colours and wrong corners in the pixel check", () => {
    // Two opaque pixels: the old black and the old white of ADR 0040.
    const old: DecodedPng = {
      width: 2,
      height: 1,
      pixels: Uint8Array.from([13, 17, 23, 255, 255, 255, 255, 255]),
    };
    const report = inspectPixels(old);
    expect(report.foreign).toEqual(["#0d1117", "#ffffff"]);
    expect(report.corners).toEqual(["#0d1117", "#ffffff", "#0d1117", "#ffffff"]);
    expect(report.brandColours).toEqual([]);
  });
});
