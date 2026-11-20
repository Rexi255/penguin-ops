// Tests of the ticket's texts (ADR 0097): the title, the text and the messages of a level in
// both languages, the English fallback of a further language, and the errors.
import { MANDATORY_LANGUAGES } from "@penguin-ops/content";
import { describe, expect, test } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { messageText, ticketTexts } from "./ticket-texts";

const content = loadBundledContent();

describe("ticketTexts", () => {
  test.each(MANDATORY_LANGUAGES)(
    "formats the title and the text of every level in %s",
    (language) => {
      for (const levelId of content.levels.keys()) {
        const texts = ticketTexts(content, levelId, language);
        expect(texts.levelId).toBe(levelId);
        expect(texts.title.length).toBeGreaterThan(0);
        expect(texts.ticket.length).toBeGreaterThan(0);
      }
    },
  );

  test("reads the title as inline pieces and the ticket as blocks", () => {
    const texts = ticketTexts(content, "switch-backup", "en");
    expect(texts.title).toEqual([{ type: "text", text: "Backup before the switch update" }]);
    expect(texts.ticket.map((block) => block.type)).toEqual(["paragraph", "list", "paragraph"]);
  });

  test("falls back to English for a language without a catalog", () => {
    expect(ticketTexts(content, "first-steps", "fr").title).toEqual([
      { type: "text", text: "First steps" },
    ]);
  });

  test("throws for a level the content does not have", () => {
    expect(() => ticketTexts(content, "no-such-level", "en")).toThrow(
      'The content has no texts for the level "no-such-level".',
    );
  });

  test("throws for a title of more than one paragraph", () => {
    const catalogs = content.levelCatalogs.get("first-steps");
    if (catalogs === undefined) {
      throw new Error("The content has no first-steps catalogs.");
    }
    const broken = {
      ...content,
      levelCatalogs: new Map([
        ["first-steps", { ...catalogs, en: { ...catalogs.en, title: "First\n\nsteps" } }],
      ]),
    };
    expect(() => ticketTexts(broken, "first-steps", "en")).toThrow(
      'The title of the level "first-steps" must be one paragraph.',
    );
  });
});

describe("messageText", () => {
  test.each([
    ["en", "The backup is safe."],
    ["de", "Das Backup ist in Sicherheit."],
  ] as const)("formats a step message in %s", (language, start) => {
    const text = messageText(ticketTexts(content, "switch-backup", language), "step-backup");
    const [block] = text;
    expect(block?.type).toBe("paragraph");
    expect(block?.type === "paragraph" && block.content[0]).toEqual({
      type: "text",
      text: `${start} ${language === "en" ? "Now the firmware still has to move to " : "Jetzt muss noch die Firmware nach "}`,
    });
  });

  test("throws for a key the level does not have", () => {
    expect(() => messageText(ticketTexts(content, "switch-backup", "en"), "tip-nothing")).toThrow(
      'The level "switch-backup" has no text "tip-nothing".',
    );
  });
});
