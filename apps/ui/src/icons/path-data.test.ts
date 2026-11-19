// Tests of the path data reader and the stroke bounds that the icon rule tests rely on.
import { describe, expect, test } from "vitest";

import { arcPoints, parsePathData, pathVertices, strokeBounds, type Stroke } from "./path-data";

const SQUARE: Stroke = { width: 2, cap: "square", miterLimit: 4 };
const BUTT: Stroke = { width: 2, cap: "butt", miterLimit: 4 };

describe("parsePathData", () => {
  test("reads absolute and relative lines and closes a subpath back to its start", () => {
    const [subpath] = parsePathData("M3 5h18v14H3z");
    expect(subpath?.closed).toBe(true);
    expect(subpath?.segments.map((segment) => segment.to)).toEqual([
      { x: 21, y: 5 },
      { x: 21, y: 19 },
      { x: 3, y: 19 },
      { x: 3, y: 5 },
    ]);
  });

  test("does not add a closing line when the subpath is already at its start", () => {
    const [subpath] = parsePathData("M0 0L4 0L4 4L0 0Z");
    expect(subpath?.segments).toHaveLength(3);
  });

  test("reads further pairs after a moveto as linetos, relative after m", () => {
    expect(pathVertices(parsePathData("M1 1 2 2"))).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(pathVertices(parsePathData("m1 1 2 2 l1 0"))).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ]);
  });

  test("starts a new subpath for each moveto and after a closepath", () => {
    expect(parsePathData("M6 6l12 12M18 6L6 18")).toHaveLength(2);
    const subpaths = parsePathData("M0 0h4v4zh2");
    expect(subpaths.map((subpath) => subpath.closed)).toEqual([true, false]);
    expect(subpaths[1]?.segments[0]?.from).toEqual({ x: 0, y: 0 });
  });

  test("reads arcs with their radii and flags", () => {
    const [subpath] = parsePathData("M8 11V7a4 4 0 0 1 8 0v4");
    expect(subpath?.segments[1]).toEqual({
      kind: "arc",
      from: { x: 8, y: 7 },
      to: { x: 16, y: 7 },
      radiusX: 4,
      radiusY: 4,
      rotation: 0,
      largeArc: false,
      sweep: true,
    });
  });

  test("accepts commas, signs and decimals", () => {
    expect(pathVertices(parsePathData("M1.5,2 L-1 +3e0"))).toEqual([
      { x: 1.5, y: 2 },
      { x: -1, y: 3 },
    ]);
  });

  test.each([
    ["L1 1", "must start with a moveto"],
    ["", "must start with a moveto"],
    ["M0 0C1 1 2 2 3 3", 'uses the command "C"'],
    ["M0 0L1", "fewer than 2 numbers"],
    ["M0 0h0", "zero length"],
    ["M0 0", "draws nothing"],
    ["M0 0M1 1h1", "draws nothing"],
    ["M0 0h1z3", "numbers after a closepath"],
    ["M0 0h1zz", "closes a subpath that has nothing drawn"],
    ["M0 0z", "draws nothing"],
    ["M0 0a1 1 0 2 0 2 0", "arc flag 2"],
    ["M0 0a0 1 0 0 0 2 0", "positive radius"],
    ["M0 0h1 #", "unexpected character at offset 7"],
  ])("rejects %j", (data, message) => {
    expect(() => parsePathData(data)).toThrow(message);
  });
});

describe("arcPoints", () => {
  test("follows a half circle over the top and ends exactly at the end point", () => {
    const [subpath] = parsePathData("M8 7a4 4 0 0 1 8 0");
    const arc = subpath?.segments[0];
    if (arc?.kind !== "arc") {
      throw new Error("expected an arc");
    }
    const points = arcPoints(arc);
    expect(points.at(-1)).toEqual({ x: 16, y: 7 });
    expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(3, 6);
    for (const point of points) {
      expect(Math.hypot(point.x - 12, point.y - 7)).toBeCloseTo(4, 9);
    }
  });

  test("takes the large arc when asked, the other way round with sweep 0", () => {
    const [large] = parsePathData("M9 14a6 6 0 1 1 6 0");
    const [small] = parsePathData("M9 14a6 6 0 0 0 6 0");
    // The arc's extreme points are exact; the joins of its polyline add less than a thousandth.
    expect(strokeBounds([large ?? { segments: [], closed: false }], BUTT).minY).toBeCloseTo(
      14 - Math.sqrt(27) - 6 - 1,
      3,
    );
    expect(strokeBounds([small ?? { segments: [], closed: false }], BUTT).maxY).toBeCloseTo(
      14 + 6 - Math.sqrt(27) + 1,
      3,
    );
  });

  test("scales radii that are too small to reach the end point", () => {
    const [subpath] = parsePathData("M0 0a1 1 0 0 1 10 0");
    expect(strokeBounds(subpath ? [subpath] : [], BUTT).minY).toBeCloseTo(-6, 3);
  });

  test("turns a rotated ellipse", () => {
    const [subpath] = parsePathData("M0 0a4 2 90 0 1 0 8");
    // Rotated by 90 degrees, the long axis is vertical, so the arc bulges by the short radius.
    // It starts and ends going sideways, so its butt ends reach one unit up and down.
    const bounds = strokeBounds(subpath ? [subpath] : [], BUTT);
    expect(bounds.maxX).toBeCloseTo(3, 3);
    expect(bounds.minY).toBeCloseTo(-1, 3);
    expect(bounds.maxY).toBeCloseTo(9, 3);
  });
});

describe("strokeBounds", () => {
  test("adds half the width to each side of a line, and the square caps at its ends", () => {
    expect(strokeBounds(parsePathData("M4 6h16"), SQUARE)).toEqual({
      minX: 3,
      minY: 5,
      maxX: 21,
      maxY: 7,
    });
    expect(strokeBounds(parsePathData("M12 15v2"), BUTT)).toEqual({
      minX: 11,
      minY: 15,
      maxX: 13,
      maxY: 17,
    });
  });

  test("reaches the miter corner of a right angle", () => {
    expect(strokeBounds(parsePathData("M3 3h18v18H3z"), SQUARE)).toEqual({
      minX: 2,
      minY: 2,
      maxX: 22,
      maxY: 22,
    });
  });

  test("reaches the long miter tip of an acute corner", () => {
    // The first ticket draft: its slanted ends put the tips 1.39 units past the corners.
    const bounds = strokeBounds(parsePathData("M6 6h16l-4 12H2z"), SQUARE);
    expect(bounds.maxX).toBeCloseTo(22 + 1 / Math.tan(Math.atan2(12, 4) / 2), 9);
    expect(bounds.minX).toBeCloseTo(2 - 1 / Math.tan(Math.atan2(12, 4) / 2), 9);
  });

  test("bevels a corner whose miter would be longer than the miter limit", () => {
    const bounds = strokeBounds(parsePathData("M2 10L22 11L2 12"), SQUARE);
    expect(bounds.maxX).toBeLessThan(23.1);
    expect(
      strokeBounds(parsePathData("M2 10L22 11L2 12"), { ...SQUARE, miterLimit: 100 }).maxX,
    ).toBeGreaterThan(30);
  });

  test("turns the square caps of a diagonal line with it", () => {
    const bounds = strokeBounds(parsePathData("M6 6l12 12"), SQUARE);
    expect(bounds.minX).toBeCloseTo(6 - Math.SQRT2, 9);
    expect(bounds.maxY).toBeCloseTo(18 + Math.SQRT2, 9);
  });

  test("rejects a path without segments", () => {
    expect(() => strokeBounds([], SQUARE)).toThrow("no stroke");
  });
});
