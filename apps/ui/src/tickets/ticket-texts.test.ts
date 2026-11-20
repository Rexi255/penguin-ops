// Tests of the ticket's texts (ADR 0097, ADR 0098, ADR 0100): the title, the text, the messages,
// the hints, the explanation and the extra goals of a level in both languages, the English
// fallback of a further language, and the errors.
import { MANDATORY_LANGUAGES } from "@penguin-ops/content";
import { describe, expect, test } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { extraGoalText, messageText, ticketTexts } from "./ticket-texts";

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

  test.each(MANDATORY_LANGUAGES)(
    "formats the three hints and the explanation of every level in %s",
    (language) => {
      for (const levelId of content.levels.keys()) {
        const { hints, explanation } = ticketTexts(content, levelId, language);
        expect(hints).toHaveLength(3);
        for (const hint of hints) {
          expect(hint.length).toBeGreaterThan(0);
        }
        expect(explanation.text.length).toBeGreaterThan(0);
        for (const { option, description } of explanation.options) {
          expect(option.length).toBeGreaterThan(0);
          expect(description.length).toBeGreaterThan(0);
        }
      }
    },
  );

  test("reads the hints with their code and the explanation with options and example", () => {
    const texts = ticketTexts(content, "first-steps", "de");
    expect(texts.hints[2]).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Tippe " },
          { type: "code", text: "cd welcome" },
          { type: "text", text: "." },
        ],
      },
    ]);
    expect(texts.explanation.options.map(({ option }) => option)).toEqual(["cd ..", "cd ~"]);
    expect(texts.explanation.options[0]?.description).toEqual([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Wechselt in das übergeordnete Verzeichnis." }],
      },
    ]);
    expect(texts.explanation.example).toBe("cd ~/welcome");
  });

  test("leaves the example out for a level without one", () => {
    const catalogs = content.levelCatalogs.get("first-steps");
    if (catalogs === undefined) {
      throw new Error("The content has no first-steps catalogs.");
    }
    const explanation = {
      text: catalogs.en.explanation.text,
      options: catalogs.en.explanation.options,
    };
    const without = {
      ...content,
      levelCatalogs: new Map([
        ["first-steps", { ...catalogs, en: { ...catalogs.en, explanation } }],
      ]),
    };
    const texts = ticketTexts(without, "first-steps", "en");
    expect("example" in texts.explanation).toBe(false);
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

describe("extraGoalText", () => {
  test.each(MANDATORY_LANGUAGES)(
    "has a description of every extra goal of every level in %s",
    (language) => {
      for (const [levelId, level] of content.levels) {
        const texts = ticketTexts(content, levelId, language);
        expect([...texts.extraGoals.keys()]).toEqual(level.extraGoals.map((goal) => goal.id));
        for (const { id } of level.extraGoals) {
          expect(extraGoalText(texts, id).length).toBeGreaterThan(0);
        }
      }
    },
  );

  test.each([
    ["en", "Marketing loves a README. Create an empty "],
    ["de", "Das Marketing liebt READMEs. Lege eine leere "],
  ] as const)("formats an extra goal's description with code in %s", (language, start) => {
    const [block] = extraGoalText(ticketTexts(content, "project-folders", language), "readme");
    expect(block?.type === "paragraph" && block.content.slice(0, 2)).toEqual([
      { type: "text", text: start },
      { type: "code", text: "README.txt" },
    ]);
  });

  test("throws for an extra goal the level does not have", () => {
    expect(() => extraGoalText(ticketTexts(content, "first-steps", "en"), "fast")).toThrow(
      'The level "first-steps" has no description of the extra goal "fast".',
    );
  });
});
