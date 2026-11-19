// Tests of the reader of the icon files' SVG form (ADR 0087).
import { describe, expect, test } from "vitest";

import { ICON_SVG_ATTRIBUTES, parseIconSvg, readSvgElements } from "./icon-svg";

const ROOT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">';

function icon(...children: string[]): string {
  return [ROOT, ...children.map((child) => `  ${child}`), "</svg>", ""].join("\n");
}

describe("parseIconSvg", () => {
  test("reads the paths, dots and circles of an icon", () => {
    const { attributes, shapes } = parseIconSvg(
      icon(
        '<path d="M4 21v-5h16v5"/>',
        '<path d="M12 15v2" stroke-linecap="butt"/>',
        '<circle cx="12" cy="8" r="4" />',
      ),
    );
    expect(Object.fromEntries(attributes)).toEqual(ICON_SVG_ATTRIBUTES);
    expect(shapes).toEqual([
      { kind: "path", data: "M4 21v-5h16v5", buttCaps: false },
      { kind: "path", data: "M12 15v2", buttCaps: true },
      { kind: "circle", centerX: 12, centerY: 8, radius: 4 },
    ]);
  });

  test("accepts empty elements with an end tag, as React renders them", () => {
    expect(
      parseIconSvg(icon('<path d="M1 1h2"></path>', '<circle cx="5" cy="5" r="2"></circle>'))
        .shapes,
    ).toEqual([
      { kind: "path", data: "M1 1h2", buttCaps: false },
      { kind: "circle", centerX: 5, centerY: 5, radius: 2 },
    ]);
  });

  test("accepts attributes over several lines", () => {
    const source = icon('<path d="M1 1h2"/>').replace(" fill=", "\n  fill=");
    expect(parseIconSvg(source).shapes).toHaveLength(1);
  });

  test.each([
    [
      "a missing attribute",
      icon('<path d="M1 1h2"/>').replace(' fill="none"', ""),
      'needs fill="none", not nothing',
    ],
    [
      "another stroke",
      icon('<path d="M1 1h2"/>').replace('stroke-width="2"', 'stroke-width="1.5"'),
      'needs stroke-width="2", not 1.5',
    ],
    [
      "round caps",
      icon('<path d="M1 1h2"/>').replace('"square"', '"round"'),
      'needs stroke-linecap="square"',
    ],
    [
      "round joins",
      icon('<path d="M1 1h2"/>').replace('"miter"', '"round"'),
      'needs stroke-linejoin="miter"',
    ],
    [
      "a fixed colour",
      icon('<path d="M1 1h2"/>').replace('"currentColor"', '"#000"'),
      'needs stroke="currentColor"',
    ],
    [
      "another grid",
      icon('<path d="M1 1h2"/>').replace("0 0 24 24", "0 0 16 16"),
      'needs viewBox="0 0 24 24"',
    ],
    [
      "an extra attribute",
      icon('<path d="M1 1h2"/>').replace("<svg ", '<svg width="24" '),
      "may not have the attributes width",
    ],
  ])("rejects %s on the <svg> element", (_case, source, message) => {
    expect(() => parseIconSvg(source)).toThrow(message);
  });
});

describe("readSvgElements", () => {
  test.each([
    ["a fill on a shape", icon('<path d="M1 1h2" fill="red"/>'), "may not have the attribute fill"],
    [
      "a transform",
      icon('<path d="M1 1h2" transform="scale(2)"/>'),
      "may not have the attribute transform",
    ],
    [
      "round caps on a shape",
      icon('<path d="M1 1h2" stroke-linecap="round"/>'),
      "only to butt, not to round",
    ],
    ["a path without data", icon('<path d=" "/>'), "needs path data"],
    ["a circle without a number", icon('<circle cx="12" cy="8" r="four"/>'), "needs a number in r"],
    ["a circle without a centre", icon('<circle cy="8" r="4"/>'), "needs a number in cx"],
    ["a group", icon("<g/>"), "<g> is not allowed"],
    ["an open element", icon('<path d="M1 1h2">'), "<path> inside an icon must be empty"],
    [
      "a child in a shape",
      icon('<path d="M1 1h2">', '<path d="M1 1h2"/>', "</path>"),
      "must be empty",
    ],
    [
      "an end tag without a start",
      icon('<path d="M1 1h2"/>', "</path>"),
      "</path> inside an icon has no start tag",
    ],
    ["a title", icon("<title/>"), "<title> is not allowed"],
    ["text", icon('<path d="M1 1h2"/>', "hello"), "Unexpected text"],
    ["a comment", icon("<!-- note -->"), "Unexpected text"],
    ["a doubled attribute", icon('<path d="M1 1h2" d="M2 2h2"/>'), "attribute d twice"],
    ["no shape", icon(), "at least one shape"],
    ["no <svg> element", '<path d="M1 1h2"/>', "starts with an <svg> element"],
    ["a self-closing <svg>", "<svg/>", "starts with an <svg> element"],
    ["nothing", "", "starts with an <svg> element"],
    ["no end tag", `${ROOT}<path d="M1 1h2"/>`, "ends with </svg>"],
    [
      "something after the end tag",
      `${icon('<path d="M1 1h2"/>')}<path d="M1 1h2"/>`,
      "ends with </svg>",
    ],
  ])("rejects %s", (_case, source, message) => {
    expect(() => readSvgElements(source)).toThrow(message);
  });
});
