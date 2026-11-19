import { describe, expect, it } from "vitest";

import {
  FAVICON_SIZES,
  LINUX_ICON_SIZES,
  linuxIconName,
  placement,
  RASTER_FILES,
  RasterPlanError,
  readViewBox,
  WINDOWS_ICON_SIZES,
  type RasterImage,
} from "./raster-plan.ts";

const SQUARE: RasterImage = {
  source: "svg/logo-signet.svg",
  width: 32,
  height: 32,
  background: null,
  layout: { kind: "fill" },
};

const WIDE: RasterImage = {
  source: "svg/logo-horizontal-dark.svg",
  width: 1280,
  height: 640,
  background: "#0f1114",
  layout: { kind: "centre", scale: 3.1 },
};

describe("readViewBox", () => {
  it("reads the view box of the root element", () => {
    expect(readViewBox('<svg xmlns="x" viewBox="6.5 4.5 277.7 57" role="img"></svg>')).toEqual({
      x: 6.5,
      y: 4.5,
      width: 277.7,
      height: 57,
    });
    expect(readViewBox('<svg viewBox="0,0,64,64"/>')).toEqual({
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    });
  });

  it.each([
    ['<svg xmlns="x"></svg>', "no view box"],
    ['<svg viewBox="0 0 64"/>', "three numbers"],
    ['<svg viewBox="0 0 64 x"/>', "a word"],
    ['<svg viewBox="0 0 0 64"/>', "no width"],
    ['<g viewBox="0 0 64 64"/>', "not on the root element"],
  ])("rejects %s (%s)", (svg) => {
    expect(() => readViewBox(svg)).toThrow(RasterPlanError);
    expect(() => readViewBox(svg)).toThrow("The SVG has no valid viewBox on its root element.");
  });
});

describe("placement", () => {
  it("stretches a view box of the same shape over the whole image", () => {
    expect(placement({ x: 0, y: 0, width: 64, height: 64 }, SQUARE)).toEqual({
      x: 0,
      y: 0,
      width: 32,
      height: 32,
    });
  });

  it("rejects a fill of a view box with another shape", () => {
    expect(() => placement({ x: 0, y: 0, width: 64, height: 32 }, SQUARE)).toThrow(
      "svg/logo-signet.svg does not have the shape of a 32 × 32 image.",
    );
  });

  it("centres a scaled view box", () => {
    const box = placement({ x: 6.5, y: 4.5, width: 200, height: 50 }, WIDE);
    expect(box.width).toBeCloseTo(620);
    expect(box.height).toBeCloseTo(155);
    expect(box.x).toBeCloseTo(330);
    expect(box.y).toBeCloseTo(242.5);
  });

  it("rejects a scale that does not fit", () => {
    expect(() => placement({ x: 0, y: 0, width: 500, height: 50 }, WIDE)).toThrow(
      "svg/logo-horizontal-dark.svg at 3.1x does not fit into 1280 × 640 px.",
    );
  });
});

describe("RASTER_FILES", () => {
  it("names the Linux icons as electron-builder expects", () => {
    expect(linuxIconName(16)).toBe("16x16.png");
    const linux = RASTER_FILES.filter((file) => file.path.startsWith("apps/desktop/build/icons/"));
    expect(linux.map((file) => file.path)).toEqual(
      LINUX_ICON_SIZES.map((size) => `apps/desktop/build/icons/${linuxIconName(size)}`),
    );
  });

  it("lists each file once", () => {
    const paths = RASTER_FILES.map((file) => file.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("puts the Windows and favicon sizes into the ICO files", () => {
    const sizes = (path: string) => {
      const file = RASTER_FILES.find((candidate) => candidate.path === path);
      return file?.kind === "ico" ? file.images.map((image) => image.width) : [];
    };
    expect(sizes("apps/desktop/build/icon.ico")).toEqual([...WINDOWS_ICON_SIZES]);
    expect(sizes("assets/brand/web/favicon.ico")).toEqual([...FAVICON_SIZES]);
  });
});
