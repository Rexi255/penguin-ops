// Reads the icon files of ADR 0086 into their shapes (ADR 0087). The files use a small, fixed form
// of SVG: one <svg> element with the icon attributes below and, inside it, only self-closing
// <path> and <circle> elements. Anything else is an error, so that a file that breaks the form
// fails the tests and the app at once instead of being drawn wrongly.

/** The attributes of every icon file's <svg> element: the grid, the stroke, caps and joins. */
export const ICON_SVG_ATTRIBUTES = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "square",
  "stroke-linejoin": "miter",
} as const;

export interface PathShape {
  readonly kind: "path";
  /** The path data, as in the file. */
  readonly data: string;
  /** Butt caps instead of square ones: only the dots use them. */
  readonly buttCaps: boolean;
}

export interface CircleShape {
  readonly kind: "circle";
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
}

export type IconShape = PathShape | CircleShape;

/** An <svg> element with its attributes and the shapes inside it. */
export interface SvgElements {
  readonly attributes: ReadonlyMap<string, string>;
  readonly shapes: readonly IconShape[];
}

interface Tag {
  readonly closing: boolean;
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly selfClosing: boolean;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;

function readAttributes(text: string, name: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const [, key = "", value = ""] of text.matchAll(/\s+([A-Za-z][A-Za-z-]*)="([^"<>]*)"/g)) {
    if (attributes.has(key)) {
      throw new Error(`<${name}> has the attribute ${key} twice.`);
    }
    attributes.set(key, value);
  }
  return attributes;
}

function readTags(source: string): Tag[] {
  const pattern = /\s*<(\/?)([a-z]+)((?:\s+[A-Za-z][A-Za-z-]*="[^"<>]*")*)\s*(\/?)>/y;
  const end = source.trimEnd().length;
  const tags: Tag[] = [];
  while (pattern.lastIndex < end) {
    const start = pattern.lastIndex;
    const match = pattern.exec(source);
    if (match === null) {
      throw new Error(`Unexpected text at offset ${String(start)}; only elements are allowed.`);
    }
    const [, closing = "", name = "", attributes = "", selfClosing = ""] = match;
    tags.push({
      closing: closing === "/",
      name,
      attributes: readAttributes(attributes, name),
      selfClosing: selfClosing === "/",
    });
  }
  return tags;
}

function checkAllowed(name: string, attributes: ReadonlyMap<string, string>, allowed: string[]) {
  for (const key of attributes.keys()) {
    if (!allowed.includes(key)) {
      throw new Error(
        `<${name}> may not have the attribute ${key}; the <svg> element sets the stroke.`,
      );
    }
  }
}

function readNumber(name: string, attributes: ReadonlyMap<string, string>, key: string): number {
  const value = attributes.get(key);
  if (value === undefined || !NUMBER.test(value)) {
    throw new Error(`<${name}> needs a number in ${key}.`);
  }
  return Number(value);
}

function readShape(tag: Tag): IconShape {
  const { name, attributes } = tag;
  switch (name) {
    case "path": {
      checkAllowed(name, attributes, ["d", "stroke-linecap"]);
      const data = attributes.get("d");
      if (data === undefined || data.trim() === "") {
        throw new Error("<path> needs path data in d.");
      }
      const cap = attributes.get("stroke-linecap");
      if (cap !== undefined && cap !== "butt") {
        throw new Error(`<path> may set stroke-linecap only to butt, not to ${cap}.`);
      }
      return { kind: "path", data, buttCaps: cap === "butt" };
    }
    case "circle":
      checkAllowed(name, attributes, ["cx", "cy", "r"]);
      return {
        kind: "circle",
        centerX: readNumber(name, attributes, "cx"),
        centerY: readNumber(name, attributes, "cy"),
        radius: readNumber(name, attributes, "r"),
      };
    default:
      throw new Error(`<${name}> is not allowed in an icon; use <path> or <circle>.`);
  }
}

/**
 * Reads one <svg> element that holds only self-closing <path> and <circle> elements. It reads
 * the icon files and, in the tests, the markup the Icon component renders.
 */
export function readSvgElements(source: string): SvgElements {
  const tags = readTags(source);
  const [root, ...rest] = tags;
  const last = rest.pop();
  if (root?.name !== "svg" || root.closing || root.selfClosing) {
    throw new Error("An icon starts with an <svg> element.");
  }
  if (last?.name !== "svg" || !last.closing) {
    throw new Error("An icon ends with </svg>.");
  }
  const shapes: IconShape[] = [];
  for (let index = 0; index < rest.length; index++) {
    const tag = rest[index];
    if (tag === undefined || tag.closing) {
      throw new Error(`</${tag?.name ?? ""}> inside an icon has no start tag.`);
    }
    if (!tag.selfClosing) {
      // An empty element with an end tag, as React renders it: <path d="…"></path>.
      const end = rest[index + 1];
      if (end === undefined || !end.closing || end.name !== tag.name) {
        throw new Error(`<${tag.name}> inside an icon must be empty.`);
      }
      index += 1;
    }
    shapes.push(readShape(tag));
  }
  if (shapes.length === 0) {
    throw new Error("An icon draws at least one shape.");
  }
  return { attributes: root.attributes, shapes };
}

/** Reads an icon file: an <svg> element with exactly the icon attributes. */
export function parseIconSvg(source: string): SvgElements {
  const elements = readSvgElements(source);
  const expected = Object.entries(ICON_SVG_ATTRIBUTES);
  for (const [key, value] of expected) {
    const actual = elements.attributes.get(key);
    if (actual !== value) {
      throw new Error(`<svg> needs ${key}="${value}", not ${actual ?? "nothing"}.`);
    }
  }
  if (elements.attributes.size !== expected.length) {
    const extra = [...elements.attributes.keys()].filter((key) => !(key in ICON_SVG_ATTRIBUTES));
    throw new Error(`<svg> may not have the attributes ${extra.join(", ")}.`);
  }
  return elements;
}
