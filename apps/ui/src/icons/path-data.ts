// Reads the path data of the icon files (ADR 0086, ADR 0087) and works out how far their strokes
// reach, so that the icon tests can check the drawing rules of DESIGN.md. It knows only the
// commands that outline icons need: moveto, lineto, horizontal and vertical lineto, elliptical arcs
// and closepath, each in absolute and relative form. Anything else is an error.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface LineSegment {
  readonly kind: "line";
  readonly from: Point;
  readonly to: Point;
}

export interface ArcSegment {
  readonly kind: "arc";
  readonly from: Point;
  readonly to: Point;
  readonly radiusX: number;
  readonly radiusY: number;
  /** The rotation of the ellipse's x axis in degrees. */
  readonly rotation: number;
  readonly largeArc: boolean;
  readonly sweep: boolean;
}

export type Segment = LineSegment | ArcSegment;

/** One subpath: what is drawn from a moveto up to the next moveto or closepath. */
export interface Subpath {
  readonly segments: readonly Segment[];
  readonly closed: boolean;
}

type Token =
  | { readonly kind: "command"; readonly letter: string }
  | { readonly kind: "number"; readonly value: number };

/** The numbers each command takes, by its upper-case letter. */
const ARGUMENT_COUNTS = { M: 2, L: 2, H: 1, V: 1, A: 7, Z: 0 } as const;

type CommandLetter = keyof typeof ARGUMENT_COUNTS;

function isCommandLetter(letter: string): letter is CommandLetter {
  return Object.hasOwn(ARGUMENT_COUNTS, letter);
}

function tokenize(data: string): Token[] {
  const pattern = /[\s,]*(?:([A-Za-z])|([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?))/y;
  const end = data.trimEnd().length;
  const tokens: Token[] = [];
  while (pattern.lastIndex < end) {
    const start = pattern.lastIndex;
    const match = pattern.exec(data);
    if (match === null) {
      const offset = start + (/^[\s,]*/.exec(data.slice(start))?.[0].length ?? 0);
      throw new Error(
        `Path data "${data}" has an unexpected character at offset ${String(offset)}.`,
      );
    }
    const [, letter, number] = match;
    tokens.push(
      letter === undefined
        ? { kind: "number", value: Number(number) }
        : { kind: "command", letter },
    );
  }
  return tokens;
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function arcFlag(value: number, data: string): boolean {
  if (value !== 0 && value !== 1) {
    throw new Error(`Path data "${data}" has an arc flag ${String(value)}; flags are 0 or 1.`);
  }
  return value === 1;
}

/**
 * Reads SVG path data into subpaths of absolute segments. A closepath adds the line back to the
 * subpath's start unless the path is already there. Zero-length segments and a moveto that draws
 * nothing are errors, because they are mistakes in an icon.
 */
export function parsePathData(data: string): Subpath[] {
  const tokens = tokenize(data);
  const subpaths: Subpath[] = [];
  let current: Point = { x: 0, y: 0 };
  let start: Point = current;
  let segments: Segment[] | undefined;
  let command: string | undefined;
  let index = 0;

  const finish = (closed: boolean): void => {
    if (segments !== undefined) {
      if (segments.length === 0) {
        throw new Error(`Path data "${data}" has a moveto that draws nothing.`);
      }
      subpaths.push({ segments, closed });
    }
    segments = undefined;
  };

  const draw = (segment: Segment): void => {
    if (samePoint(segment.from, segment.to)) {
      throw new Error(`Path data "${data}" has a segment of zero length.`);
    }
    // After a closepath, drawing goes on in a new subpath from the closed subpath's start.
    segments ??= [];
    segments.push(segment);
    current = segment.to;
  };

  if (tokens[0]?.kind !== "command" || tokens[0].letter.toUpperCase() !== "M") {
    throw new Error(`Path data "${data}" must start with a moveto.`);
  }

  while (index < tokens.length) {
    const token = tokens[index];
    if (token?.kind === "command") {
      command = token.letter;
      index += 1;
    }
    const letter = command ?? "";
    const upper = letter.toUpperCase();
    if (!isCommandLetter(upper)) {
      throw new Error(`Path data "${data}" uses the command "${letter}", which icons do not use.`);
    }
    if (upper === "Z") {
      if (segments === undefined) {
        throw new Error(`Path data "${data}" closes a subpath that has nothing drawn.`);
      }
      if (!samePoint(current, start)) {
        draw({ kind: "line", from: current, to: start });
      }
      finish(true);
      current = start;
      if (tokens[index]?.kind === "number") {
        throw new Error(`Path data "${data}" has numbers after a closepath.`);
      }
      continue;
    }

    const args: number[] = [];
    const count = ARGUMENT_COUNTS[upper];
    while (args.length < count) {
      const argument = tokens[index];
      if (argument?.kind !== "number") {
        throw new Error(
          `Path data "${data}" gives the command "${letter}" fewer than ${String(count)} numbers.`,
        );
      }
      args.push(argument.value);
      index += 1;
    }
    const relative = letter !== upper;
    const baseX = relative ? current.x : 0;
    const baseY = relative ? current.y : 0;
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0] = args;

    switch (upper) {
      case "M":
        finish(false);
        current = { x: baseX + a, y: baseY + b };
        start = current;
        segments = [];
        // Further coordinate pairs after a moveto are implicit linetos.
        command = relative ? "l" : "L";
        break;
      case "L":
        draw({ kind: "line", from: current, to: { x: baseX + a, y: baseY + b } });
        break;
      case "H":
        draw({ kind: "line", from: current, to: { x: baseX + a, y: current.y } });
        break;
      case "V":
        draw({ kind: "line", from: current, to: { x: current.x, y: baseY + a } });
        break;
      case "A":
        if (a <= 0 || b <= 0) {
          throw new Error(`Path data "${data}" has an arc without a positive radius.`);
        }
        draw({
          kind: "arc",
          from: current,
          to: { x: baseX + f, y: baseY + g },
          radiusX: a,
          radiusY: b,
          rotation: c,
          largeArc: arcFlag(d, data),
          sweep: arcFlag(e, data),
        });
        break;
    }
  }
  finish(false);
  return subpaths;
}

/** The points where segments start and end, and the end of every subpath. */
export function pathVertices(subpaths: readonly Subpath[]): Point[] {
  return subpaths.flatMap((subpath) =>
    subpath.segments.flatMap((segment) => [segment.from, segment.to]),
  );
}

function angleBetween(ux: number, uy: number, vx: number, vy: number): number {
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

/** Steps per arc when an arc is drawn as a polyline. */
const ARC_STEPS = 256;

/**
 * Points along an arc after its start, ending exactly at its end. Follows the conversion from
 * endpoint to centre parameters in the SVG specification (appendix F.6.5), including the
 * scaling of radii that are too small. Besides even steps, the points include the arc's exact
 * leftmost, rightmost, top and bottom points where it has them, so that bounds are exact.
 */
export function arcPoints(arc: ArcSegment): Point[] {
  const phi = (arc.rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const halfDx = (arc.from.x - arc.to.x) / 2;
  const halfDy = (arc.from.y - arc.to.y) / 2;
  const x1 = cos * halfDx + sin * halfDy;
  const y1 = -sin * halfDx + cos * halfDy;
  let rx = Math.abs(arc.radiusX);
  let ry = Math.abs(arc.radiusY);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const sign = arc.largeArc === arc.sweep ? -1 : 1;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const centerX1 = (coefficient * rx * y1) / ry;
  const centerY1 = (coefficient * -ry * x1) / rx;
  const centerX = cos * centerX1 - sin * centerY1 + (arc.from.x + arc.to.x) / 2;
  const centerY = sin * centerX1 + cos * centerY1 + (arc.from.y + arc.to.y) / 2;
  const startAngle = angleBetween(1, 0, (x1 - centerX1) / rx, (y1 - centerY1) / ry);
  let sweepAngle = angleBetween(
    (x1 - centerX1) / rx,
    (y1 - centerY1) / ry,
    (-x1 - centerX1) / rx,
    (-y1 - centerY1) / ry,
  );
  if (!arc.sweep && sweepAngle > 0) {
    sweepAngle -= 2 * Math.PI;
  } else if (arc.sweep && sweepAngle < 0) {
    sweepAngle += 2 * Math.PI;
  }

  // Progress along the arc from 0 to 1: the even steps, and the angles where x or y is extreme.
  const progress = new Set<number>();
  for (let step = 1; step < ARC_STEPS; step++) {
    progress.add(step / ARC_STEPS);
  }
  const extremeX = Math.atan2(-sin * ry, cos * rx);
  const extremeY = Math.atan2(cos * ry, sin * rx);
  for (const base of [extremeX, extremeY]) {
    for (let turn = -2; turn <= 2; turn++) {
      const share = (base + turn * Math.PI - startAngle) / sweepAngle;
      if (share > 0 && share < 1) {
        progress.add(share);
      }
    }
  }

  const points = [...progress]
    .toSorted((a, b) => a - b)
    .map((share) => {
      const angle = startAngle + sweepAngle * share;
      return {
        x: cos * rx * Math.cos(angle) - sin * ry * Math.sin(angle) + centerX,
        y: sin * rx * Math.cos(angle) + cos * ry * Math.sin(angle) + centerY,
      };
    });
  points.push(arc.to);
  return points;
}

/** A subpath as a polyline: its points, without the repeated start of a closed subpath. */
function polyline(subpath: Subpath): Point[] {
  const first = subpath.segments[0];
  const points: Point[] = first === undefined ? [] : [first.from];
  const add = (point: Point): void => {
    const last = points.at(-1);
    // An arc's extreme point can fall next to one of its even steps; one of them is enough.
    if (last === undefined || Math.hypot(point.x - last.x, point.y - last.y) > 1e-9) {
      points.push(point);
    }
  };
  for (const segment of subpath.segments) {
    if (segment.kind === "line") {
      add(segment.to);
    } else {
      arcPoints(segment).forEach(add);
    }
  }
  if (subpath.closed) {
    points.pop();
  }
  return points;
}

export interface Stroke {
  readonly width: number;
  readonly cap: "square" | "butt";
  /** The stroke-miterlimit: longer miters are bevelled. SVG's default is 4. */
  readonly miterLimit: number;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function unit(from: Point, to: Point): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

/**
 * The corner points of a stroked polyline's outline: the edges of every segment, the tips of
 * miter joins and the corners of square caps. Every point of the stroke lies in their convex
 * hull, so their extremes are the stroke's bounds.
 */
function outlinePoints(points: readonly Point[], closed: boolean, stroke: Stroke): Point[] {
  const half = stroke.width / 2;
  const count = points.length;
  const outline: Point[] = [];
  const at = (index: number): Point => points[(index + count) % count] ?? { x: 0, y: 0 };

  for (let index = 0; index < (closed ? count : count - 1); index++) {
    const from = at(index);
    const to = at(index + 1);
    const direction = unit(from, to);
    const nx = -direction.y * half;
    const ny = direction.x * half;
    outline.push(
      { x: from.x + nx, y: from.y + ny },
      { x: from.x - nx, y: from.y - ny },
      { x: to.x + nx, y: to.y + ny },
      { x: to.x - nx, y: to.y - ny },
    );
  }

  for (let index = closed ? 0 : 1; index < (closed ? count : count - 1); index++) {
    const here = at(index);
    const incoming = unit(at(index - 1), here);
    const outgoing = unit(here, at(index + 1));
    const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
    // The inner angle between the two segments; the miter is half the width over sin(angle / 2).
    const inner = Math.acos(Math.min(1, Math.max(-1, -dot)));
    const ratio = 1 / Math.sin(inner / 2);
    if (dot >= 1 - 1e-12 || !(ratio <= stroke.miterLimit)) {
      // Straight on, or bevelled: the segment edges already hold the outline.
      continue;
    }
    // The miter tip points away from the inner angle, along incoming − outgoing.
    const outward = unit(outgoing, incoming);
    outline.push({ x: here.x + outward.x * half * ratio, y: here.y + outward.y * half * ratio });
  }

  if (!closed && stroke.cap === "square") {
    const ends: [Point, Point][] = [
      [at(0), at(1)],
      [at(count - 1), at(count - 2)],
    ];
    for (const [end, neighbour] of ends) {
      const back = unit(neighbour, end);
      const nx = -back.y * half;
      const ny = back.x * half;
      outline.push(
        { x: end.x + back.x * half + nx, y: end.y + back.y * half + ny },
        { x: end.x + back.x * half - nx, y: end.y + back.y * half - ny },
      );
    }
  }
  return outline;
}

/** How far a stroked path reaches, with its joins and caps. */
export function strokeBounds(subpaths: readonly Subpath[], stroke: Stroke): Bounds {
  const outline = subpaths.flatMap((subpath) =>
    outlinePoints(polyline(subpath), subpath.closed, stroke),
  );
  if (outline.length === 0) {
    throw new Error("A path without segments has no stroke.");
  }
  return {
    minX: Math.min(...outline.map((point) => point.x)),
    minY: Math.min(...outline.map((point) => point.y)),
    maxX: Math.max(...outline.map((point) => point.x)),
    maxY: Math.max(...outline.map((point) => point.y)),
  };
}
