// Guards the logo and app icon files (assets/brand/README.md, ADR 0040): every file exists, the
// SVGs are self-contained and use only the brand colours, and the raster icons have the sizes
// that electron-builder and GitHub expect.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const BRAND = join(ROOT, "assets", "brand");
const BUILD = join(ROOT, "apps", "desktop", "build");

const BLACK = "#0d1117";
const WHITE = "#ffffff";
const ORANGE = "#e0701a";
const MONO_BLACK = "#000000";

/** Colours each SVG may use. Mono variants use exactly one colour. */
const SVG_COLOURS: Readonly<Record<string, readonly string[]>> = {
  "svg/logo-signet.svg": [BLACK, WHITE, ORANGE],
  "svg/logo-signet-mono-dark.svg": [WHITE],
  "svg/logo-signet-mono-light.svg": [MONO_BLACK],
  "svg/logo-wordmark-dark.svg": [WHITE, ORANGE],
  "svg/logo-wordmark-light.svg": [BLACK, ORANGE],
  "svg/logo-wordmark-mono-dark.svg": [WHITE],
  "svg/logo-wordmark-mono-light.svg": [MONO_BLACK],
  "svg/logo-horizontal-dark.svg": [BLACK, WHITE, ORANGE],
  "svg/logo-horizontal-light.svg": [BLACK, WHITE, ORANGE],
  "svg/logo-horizontal-mono-dark.svg": [WHITE],
  "svg/logo-horizontal-mono-light.svg": [MONO_BLACK],
  "web/favicon.svg": [BLACK, WHITE, ORANGE],
};

/** Elements a logo SVG may contain: shapes only, no text, images, scripts or styles. */
const ALLOWED_ELEMENTS = new Set(["svg", "title", "path"]);

const LINUX_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

/** File name of a Linux icon in electron-builder's naming scheme, e.g. `16x16.png`. */
function linuxIconName(size: number): string {
  const side = String(size);
  return `${side}x${side}.png`;
}

function readSvg(relativePath: string): string {
  return readFileSync(join(BRAND, relativePath), "utf8");
}

/** Element names in an SVG that are not on the allow list. */
function disallowedElements(svg: string): string[] {
  const names = new Set([...svg.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((match) => match[1] ?? ""));
  return [...names].filter((name) => !ALLOWED_ELEMENTS.has(name));
}

/** Width and height from the IHDR chunk of a PNG file. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a" || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`${path} is not a PNG file.`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Image sizes in the directory of an ICO file; a stored 0 means 256 pixels. */
function icoSizes(path: string): number[] {
  const bytes = readFileSync(path);
  if (bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) {
    throw new Error(`${path} is not an ICO file.`);
  }
  const count = bytes.readUInt16LE(4);
  const sizes: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = bytes.readUInt8(entry);
    const height = bytes.readUInt8(entry + 1);
    if (width !== height) {
      throw new Error(`${path} contains a non-square image.`);
    }
    sizes.push(width === 0 ? 256 : width);
  }
  return sizes;
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

describe("app icon files", () => {
  it("has a 1024 px base icon", () => {
    expect(pngSize(join(BUILD, "icon.png"))).toEqual({ width: 1024, height: 1024 });
  });

  it("has one Linux icon per size, named as electron-builder expects", () => {
    const names = readdirSync(join(BUILD, "icons")).sort();
    expect(names).toEqual(LINUX_ICON_SIZES.map(linuxIconName).sort());
    for (const size of LINUX_ICON_SIZES) {
      expect(pngSize(join(BUILD, "icons", linuxIconName(size)))).toEqual({
        width: size,
        height: size,
      });
    }
  });

  it("has a Windows icon with the sizes Windows needs, up to 256 px", () => {
    const sizes = icoSizes(join(BUILD, "icon.ico"));
    expect(sizes).toEqual(expect.arrayContaining([16, 24, 32, 48, 64, 128, 256]));
  });

  it("has the web icons for the repository page", () => {
    expect(pngSize(join(BRAND, "web", "apple-touch-icon.png"))).toEqual({
      width: 180,
      height: 180,
    });
    expect(pngSize(join(BRAND, "web", "social-preview.png"))).toEqual({
      width: 1280,
      height: 640,
    });
    expect(icoSizes(join(BRAND, "web", "favicon.ico"))).toEqual(expect.arrayContaining([16, 32]));
  });

  it("rejects files that are not PNG or ICO", () => {
    const svgPath = join(BRAND, "svg", "logo-signet.svg");
    expect(() => pngSize(svgPath)).toThrow("is not a PNG file.");
    expect(() => icoSizes(join(BUILD, "icon.png"))).toThrow("is not an ICO file.");
  });
});
