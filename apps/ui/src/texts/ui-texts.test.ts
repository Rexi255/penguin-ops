import {
  chapterTitleKey,
  MANDATORY_LANGUAGES,
  messagePlaceholders,
  type UiCatalogs,
} from "@penguin-ops/content";
import { describe, expect, test } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { createTexts, UI_TEXT_PLACEHOLDERS, type UiTextKey } from "./ui-texts";

const { chapters, uiCatalogs } = loadBundledContent();

/** The chapter titles are content, not texts of the UI's code (ADR 0099). */
const isChapterTitle = (key: string) => key.startsWith("chapters.");

/** Catalogs with the same English and German texts. */
function catalogs(texts: Readonly<Record<string, string>>): UiCatalogs {
  const catalog = new Map(Object.entries(texts));
  return { en: catalog, de: catalog, extra: new Map() };
}

describe("the UI catalogs", () => {
  test.each(MANDATORY_LANGUAGES)("%s holds exactly the texts the UI uses", (language) => {
    expect([...uiCatalogs[language].keys()].filter((key) => !isChapterTitle(key)).sort()).toEqual(
      Object.keys(UI_TEXT_PLACEHOLDERS).sort(),
    );
  });

  test.each(MANDATORY_LANGUAGES)("%s uses exactly the values the UI passes", (language) => {
    const used = Object.fromEntries(
      [...uiCatalogs[language]]
        .filter(([key]) => !isChapterTitle(key))
        .map(([key, source]) => [
          key,
          [...(messagePlaceholders(source, language)?.keys() ?? [])].sort(),
        ]),
    );
    const passed = Object.fromEntries(
      Object.entries(UI_TEXT_PLACEHOLDERS).map(([key, names]) => [key, [...names].sort()]),
    );
    expect(used).toEqual(passed);
  });

  test.each(MANDATORY_LANGUAGES)(
    "%s holds a title without placeholders for every chapter and nothing else",
    (language) => {
      const titles = [...uiCatalogs[language].keys()].filter(isChapterTitle);
      expect(titles).toEqual(chapters.map((chapter) => chapterTitleKey(chapter.id)));
      for (const key of titles) {
        expect(messagePlaceholders(uiCatalogs[language].get(key) ?? "", language)?.size).toBe(0);
      }
    },
  );
});

describe("chapterTitle", () => {
  test.each(MANDATORY_LANGUAGES)(
    "gives every chapter's title as one paragraph in %s",
    (language) => {
      const texts = createTexts(uiCatalogs, language);
      for (const chapter of chapters) {
        expect(texts.chapterTitle(chapter.id).length).toBeGreaterThan(0);
      }
    },
  );

  test("formats the title in the chosen language", () => {
    expect(createTexts(uiCatalogs, "en").chapterTitle("tidying-up")).toEqual([
      { type: "text", text: "Tidying up" },
    ]);
    expect(createTexts(uiCatalogs, "de").chapterTitle("tidying-up")).toEqual([
      { type: "text", text: "Aufräumen" },
    ]);
  });

  test("throws for a chapter without a title", () => {
    expect(() => createTexts(uiCatalogs, "en").chapterTitle("missing")).toThrow(
      'The UI catalog "en" has no title of the chapter "missing".',
    );
  });

  test("throws for a title of more than one paragraph", () => {
    const texts = createTexts(catalogs({ "chapters.long": "One\n\nTwo" }), "en");
    expect(() => texts.chapterTitle("long")).toThrow(
      'The UI text "chapters.long" must be one paragraph.',
    );
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
