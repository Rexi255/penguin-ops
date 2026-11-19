// Guards the icon rules of DESIGN.md and ADR 0086 for every icon file: the SVG form (grid,
// stroke, caps, joins, currentColor, no fill), whole-pixel coordinates, the margin of one unit
// and butt caps only on dots.
import { describe, expect, test } from "vitest";

import { ICON_NAMES } from "./icon";
import { parseIconSvg, type IconShape } from "./icon-svg";
import { parsePathData, pathVertices, strokeBounds, type Bounds } from "./path-data";

const files = import.meta.glob<string>("./*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});
const icons = Object.entries(files).map(([file, source]) => ({
  file,
  source,
  shapes: parseIconSvg(source).shapes,
}));

/** The grid and the stroke of ADR 0086. */
const GRID = 24;
const STROKE_WIDTH = 2;
const MARGIN = 1;
const MITER_LIMIT = 4; // SVG's default; the files do not change it.
/** Rounding of the arc and miter arithmetic, far below a pixel. */
const EPSILON = 1e-9;

function shapeBounds(shape: IconShape): Bounds {
  const half = STROKE_WIDTH / 2;
  switch (shape.kind) {
    case "circle":
      return {
        minX: shape.centerX - shape.radius - half,
        minY: shape.centerY - shape.radius - half,
        maxX: shape.centerX + shape.radius + half,
        maxY: shape.centerY + shape.radius + half,
      };
    case "path":
      return strokeBounds(parsePathData(shape.data), {
        width: STROKE_WIDTH,
        cap: shape.buttCaps ? "butt" : "square",
        miterLimit: MITER_LIMIT,
      });
  }
}

/** Every coordinate and length an icon is drawn with. */
function shapeNumbers(shape: IconShape): number[] {
  switch (shape.kind) {
    case "circle":
      return [shape.centerX, shape.centerY, shape.radius];
    case "path": {
      const subpaths = parsePathData(shape.data);
      return [
        ...pathVertices(subpaths).flatMap((point) => [point.x, point.y]),
        ...subpaths.flatMap((subpath) =>
          subpath.segments.flatMap((segment) =>
            segment.kind === "arc" ? [segment.radiusX, segment.radiusY, segment.rotation] : [],
          ),
        ),
      ];
    }
  }
}

describe("the icon files", () => {
  test("are exactly the icons of ICON_NAMES", () => {
    expect(Object.keys(files).toSorted()).toEqual(
      ICON_NAMES.map((name) => `./${name}.svg`).toSorted(),
    );
  });

  test("have kebab-case names", () => {
    for (const name of ICON_NAMES) {
      expect(name).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
    }
  });

  test.each(icons)("$file has LF line endings and ends with one newline", ({ source }) => {
    expect(source).not.toContain("\r");
    expect(source).toMatch(/[^\n]\n$/);
  });
});

describe.each(icons)("$file", ({ shapes }) => {
  test("is drawn on whole-pixel coordinates, so its strokes cover whole pixels", () => {
    const numbers = shapes.flatMap(shapeNumbers);
    expect(numbers.filter((number) => !Number.isInteger(number))).toEqual([]);
  });

  test("keeps its strokes, caps and miter tips at least one unit inside the edge", () => {
    for (const shape of shapes) {
      const bounds = shapeBounds(shape);
      const where = shape.kind === "path" ? shape.data : "circle";
      expect(bounds.minX, where).toBeGreaterThanOrEqual(MARGIN - EPSILON);
      expect(bounds.minY, where).toBeGreaterThanOrEqual(MARGIN - EPSILON);
      expect(bounds.maxX, where).toBeLessThanOrEqual(GRID - MARGIN + EPSILON);
      expect(bounds.maxY, where).toBeLessThanOrEqual(GRID - MARGIN + EPSILON);
    }
  });

  test("uses butt caps only for dots: straight 2 × 2 strokes", () => {
    for (const shape of shapes) {
      if (shape.kind !== "path" || !shape.buttCaps) {
        continue;
      }
      for (const subpath of parsePathData(shape.data)) {
        const [segment, ...others] = subpath.segments;
        expect(others, shape.data).toEqual([]);
        expect(subpath.closed, shape.data).toBe(false);
        expect(segment?.kind, shape.data).toBe("line");
        const dx = Math.abs((segment?.to.x ?? 0) - (segment?.from.x ?? 0));
        const dy = Math.abs((segment?.to.y ?? 0) - (segment?.from.y ?? 0));
        expect([dx, dy].toSorted(), shape.data).toEqual([0, STROKE_WIDTH]);
      }
    }
  });

  test("draws arcs only as circles, without rotation", () => {
    for (const shape of shapes) {
      if (shape.kind !== "path") {
        continue;
      }
      for (const segment of parsePathData(shape.data).flatMap((subpath) => subpath.segments)) {
        if (segment.kind === "arc") {
          expect(segment.radiusX, shape.data).toBe(segment.radiusY);
          expect(segment.rotation, shape.data).toBe(0);
        }
      }
    }
  });
});
