// Tests of the Icon component and of reading the icon files (ADR 0087). The component is
// rendered to markup with react-dom/server, which needs no browser.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { readCssRules } from "../css-rules";
import stylesCss from "../styles.css?raw";
import { Icon, ICON_NAMES, readIcons } from "./icon";
import { ICON_SVG_ATTRIBUTES, parseIconSvg, readSvgElements } from "./icon-svg";

const files = import.meta.glob<string>("./*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

const VALID = files["./close.svg"] ?? "";

function allFiles(): Record<string, string> {
  return Object.fromEntries(ICON_NAMES.map((name) => [`./${name}.svg`, VALID]));
}

describe("readIcons", () => {
  test("reads every icon of ICON_NAMES from its file", () => {
    const icons = readIcons(files);
    expect([...icons.keys()]).toEqual([...ICON_NAMES]);
    for (const name of ICON_NAMES) {
      expect(icons.get(name)).toEqual(parseIconSvg(files[`./${name}.svg`] ?? "").shapes);
    }
  });

  test("rejects a name without a file", () => {
    const incomplete = allFiles();
    delete incomplete["./mail.svg"];
    expect(() => readIcons(incomplete)).toThrow('The icon "mail" has no file mail.svg.');
  });

  test("rejects a file without a name", () => {
    expect(() => readIcons({ ...allFiles(), "./printer.svg": VALID })).toThrow(
      "The icon files ./printer.svg are not in ICON_NAMES.",
    );
  });

  test("names the file that breaks the icon form", () => {
    const broken = { ...allFiles(), "./ticket.svg": VALID.replace('"miter"', '"round"') };
    expect(() => readIcons(broken)).toThrow(/^ticket\.svg: <svg> needs stroke-linejoin="miter"/);
  });
});

describe("Icon", () => {
  test.each(ICON_NAMES)("draws %s with the shapes and stroke of its file", (name) => {
    const rendered = readSvgElements(renderToStaticMarkup(<Icon name={name} />));
    expect(rendered.shapes).toEqual(parseIconSvg(files[`./${name}.svg`] ?? "").shapes);
    // HTML needs no namespace on an inline <svg>, so React leaves xmlns out.
    const attributes = Object.fromEntries(
      Object.entries(ICON_SVG_ATTRIBUTES).filter(([key]) => key !== "xmlns"),
    );
    expect(Object.fromEntries(rendered.attributes)).toEqual({
      ...attributes,
      class: "icon",
      "aria-hidden": "true",
      focusable: "false",
    });
  });

  test("adds further classes", () => {
    const rendered = readSvgElements(
      renderToStaticMarkup(<Icon name="solved" className="cable-handbook" />),
    );
    expect(rendered.attributes.get("class")).toBe("icon cable-handbook");
  });

  test("throws for a name that is not an icon", () => {
    // A name typed only as a string, as untyped data such as a level file could bring it.
    const readName = (): string => "printer";
    const name = readName();
    expect(() =>
      // @ts-expect-error: the type allows only icon names.
      renderToStaticMarkup(<Icon name={name} />),
    ).toThrow('There is no icon "printer".');
  });

  test("is one cell in size and keeps it in a flex row", () => {
    const rule = readCssRules(stylesCss).find((candidate) => candidate.selector === ".icon");
    expect(rule?.declarations.get("inline-size")).toBe("var(--cell-block)");
    expect(rule?.declarations.get("block-size")).toBe("var(--cell-block)");
    expect(rule?.declarations.get("flex")).toBe("none");
  });
});
