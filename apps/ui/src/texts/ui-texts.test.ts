import { MANDATORY_LANGUAGES, messagePlaceholders, type UiCatalogs } from "@penguin-ops/content";
import { describe, expect, test } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { createTexts, UI_TEXT_PLACEHOLDERS, type UiTextKey } from "./ui-texts";

const { uiCatalogs } = loadBundledContent();

/** Catalogs with the same English and German texts. */
function catalogs(texts: Readonly<Record<string, string>>): UiCatalogs {
  const catalog = new Map(Object.entries(texts));
  return { en: catalog, de: catalog, extra: new Map() };
}

describe("the UI catalogs", () => {
  test.each(MANDATORY_LANGUAGES)("%s holds exactly the texts the UI uses", (language) => {
    expect([...uiCatalogs[language].keys()].sort()).toEqual(
      Object.keys(UI_TEXT_PLACEHOLDERS).sort(),
    );
  });

  test.each(MANDATORY_LANGUAGES)("%s uses exactly the values the UI passes", (language) => {
    const used = Object.fromEntries(
      [...uiCatalogs[language]].map(([key, source]) => [
        key,
        [...(messagePlaceholders(source, language)?.keys() ?? [])].sort(),
      ]),
    );
    const passed = Object.fromEntries(
      Object.entries(UI_TEXT_PLACEHOLDERS).map(([key, names]) => [key, [...names].sort()]),
    );
    expect(used).toEqual(passed);
  });
});

describe("createTexts", () => {
  test("formats texts in the chosen language", () => {
    const english = createTexts(uiCatalogs, "en");
    const german = createTexts(uiCatalogs, "de");
    expect(english.language).toBe("en");
    expect(english.plain("start.quit")).toBe("Quit");
    expect(german.language).toBe("de");
    expect(german.plain("start.quit")).toBe("Beenden");
  });

  test("keeps code values as code in rich texts and as text in plain texts", () => {
    const texts = createTexts(uiCatalogs, "en");
    expect(texts.rich("start.version", { version: { code: "1.2.3" } })).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Version " },
          { type: "code", text: "1.2.3" },
        ],
      },
    ]);
    expect(texts.plain("start.version", { version: { code: "1.2.3" } })).toBe("Version 1.2.3");
  });

  test("gives bold and line breaks as plain text", () => {
    const texts = createTexts(catalogs({ "app.name": "**Penguin**`Ops`\nnow" }), "en");
    expect(texts.plain("app.name")).toBe("PenguinOps\nnow");
  });

  test("rejects a plain text of more than one paragraph", () => {
    const texts = createTexts(catalogs({ "app.name": "One\n\nTwo" }), "en");
    expect(() => texts.plain("app.name")).toThrow('The UI text "app.name" must be one paragraph.');
  });

  test("rejects a plain text that is a list", () => {
    const texts = createTexts(catalogs({ "app.name": "- one" }), "en");
    expect(() => texts.plain("app.name")).toThrow('The UI text "app.name" must be one paragraph.');
  });

  test("names a text that the catalog lacks", () => {
    const texts = createTexts(catalogs({}), "de");
    const key: UiTextKey = "start.menu";
    expect(() => texts.rich(key)).toThrow('The UI catalog "de" has no text "start.menu".');
  });
});
