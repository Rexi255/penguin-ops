// The raster brand files and how each one is drawn from a logo SVG (ADR 0089). The SVGs in
// assets/brand/ are the source; `npm run brand:rasters` draws every file listed here, and
// brand-assets.test.ts checks the files against the same list.

/** The logo colours of ADR 0088, copied from the default dark scheme's tokens. */
export const BRAND_BLACK = "#0f1114"; // surface-terminal
export const BRAND_WHITE = "#e8e6e1"; // text
export const BRAND_ORANGE = "#e0701a"; // player

/** Thrown when an SVG or an image description cannot be laid out. */
export class RasterPlanError extends Error {
  override name = "RasterPlanError";
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How the SVG's view box sits in the image: `fill` stretches it over the whole image (only for an
 * image of the view box's shape), `centre` scales it by a factor and centres it.
 */
export type Layout =
  { readonly kind: "fill" } | { readonly kind: "centre"; readonly scale: number };

export interface RasterImage {
  /** The SVG to draw, relative to assets/brand/. */
  readonly source: string;
  readonly width: number;
  readonly height: number;
  /** The colour that fills the image first; `null` leaves the background transparent. */
  readonly background: string | null;
  readonly layout: Layout;
}

export type RasterFile =
  | { readonly kind: "png"; readonly path: string; readonly image: RasterImage }
  | { readonly kind: "ico"; readonly path: string; readonly images: readonly RasterImage[] };

const SIGNET = "svg/logo-signet.svg";

/** The signet over the whole square image, with a transparent background. */
function signet(size: number): RasterImage {
  return { source: SIGNET, width: size, height: size, background: null, layout: { kind: "fill" } };
}

/** Linux icon sizes in electron-builder's `icons/NxN.png` scheme. */
export const LINUX_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024] as const;

/** Sizes in the Windows app icon: the shell's sizes at 100 %, 125 %, 150 % and 200 % scaling. */
export const WINDOWS_ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256] as const;

/** Sizes in the favicon of a project website. */
export const FAVICON_SIZES = [16, 32, 48] as const;

/** File name of a Linux icon, for example `16x16.png`. */
export function linuxIconName(size: number): string {
  const side = String(size);
  return `${side}x${side}.png`;
}

/** Every raster brand file, with paths relative to the repository root. */
export const RASTER_FILES: readonly RasterFile[] = [
  { kind: "png", path: "apps/desktop/build/icon.png", image: signet(1024) },
  ...LINUX_ICON_SIZES.map((size): RasterFile => ({
    kind: "png",
    path: `apps/desktop/build/icons/${linuxIconName(size)}`,
    image: signet(size),
  })),
  { kind: "ico", path: "apps/desktop/build/icon.ico", images: WINDOWS_ICON_SIZES.map(signet) },
  { kind: "ico", path: "assets/brand/web/favicon.ico", images: FAVICON_SIZES.map(signet) },
  {
    kind: "png",
    path: "assets/brand/web/apple-touch-icon.png",
    image: { ...signet(180), background: BRAND_BLACK },
  },
  {
    // GitHub's social preview: the horizontal logo at the size of the owner's original file.
    kind: "png",
    path: "assets/brand/web/social-preview.png",
    image: {
      source: "svg/logo-horizontal-dark.svg",
      width: 1280,
      height: 640,
      background: BRAND_BLACK,
      layout: { kind: "centre", scale: 3.1 },
    },
  },
];

/** The `viewBox` of an SVG's root element. */
export function readViewBox(svg: string): Box {
  const match = /^<svg\b[^>]*\sviewBox="([^"]*)"/.exec(svg);
  const numbers = (match?.[1] ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [x, y, width, height] = numbers;
  if (
    numbers.length !== 4 ||
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    numbers.some((value) => !Number.isFinite(value)) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RasterPlanError("The SVG has no valid viewBox on its root element.");
  }
  return { x, y, width, height };
}

/** Where in the image the SVG's view box is drawn, in image pixels. */
export function placement(viewBox: Box, image: RasterImage): Box {
  switch (image.layout.kind) {
    case "fill": {
      // Compare the shapes with a tolerance, because view boxes have decimal places.
      const ratio = viewBox.width / viewBox.height / (image.width / image.height);
      if (Math.abs(ratio - 1) > 1e-9) {
        throw new RasterPlanError(
          `${image.source} does not have the shape of a ${String(image.width)} × ${String(image.height)} image.`,
        );
      }
      return { x: 0, y: 0, width: image.width, height: image.height };
    }
    case "centre": {
      const width = viewBox.width * image.layout.scale;
      const height = viewBox.height * image.layout.scale;
      if (width > image.width || height > image.height) {
        throw new RasterPlanError(
          `${image.source} at ${String(image.layout.scale)}x does not fit into ${String(image.width)} × ${String(image.height)} px.`,
        );
      }
      return { x: (image.width - width) / 2, y: (image.height - height) / 2, width, height };
    }
  }
}
