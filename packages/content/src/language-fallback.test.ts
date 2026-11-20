import { describe, expect, test } from "vitest";

import { type Content, type ContentFile, loadContent } from "./content-loader";
import { levelTexts, missingTexts, uiTexts } from "./language-fallback";
import type { CatalogText } from "./message";

function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

const CHAPTERS: ContentFile = {
  file: "content/chapters.yaml",
  text: yaml("format: 1", "chapters:", "  - id: a", "    levels: [x, y]"),
};

/** A level `<id>` with an extra goal `fast` and a tip `tip-wrong`. */
function levelFile(id: string): ContentFile {
  return {
    file: `content/levels/${id}/level.yaml`,
    text: yaml(
      "format: 1",
      `id: ${id}`,
      "kind: main",
      "teaches: [cat]",
      "goal: { output_contains: x }",
      "tips:",
      "  - when: { output_contains: y }",
      "    say: tip-wrong",
      "extra_goals:",
      "  - { id: fast, when: { output_contains: z }, xp: 10 }",
      "solutions:",
      "  - [cat a]",
    ),
  };
}

/** A complete catalog whose texts end with ` (<language>)`. */
function completeCatalog(language: string): string {
  return yaml(
    `title: Title (${language})`,
    `ticket: Ticket (${language})`,
    `hints: [Tip (${language}), Concrete (${language}), Solution (${language})]`,
    "explanation:",
    `  text: Explanation (${language})`,
    "  options:",
    `    - [cat file, Prints (${language})]`,
    "  example: cat -n a",
    "extra_goals:",
    `  fast: Fast (${language})`,
    `tip-wrong: Wrong (${language})`,
  );
}

/** The standard world that levels without `world` use. */
const OFFICE_WORLD: ContentFile = {
  file: "content/worlds/office.yaml",
  text: [
    "format: 1",
    "id: office",
    "hosts:",
    "  - name: desk",
    "    groups: [{ name: root, gid: 0 }]",
    "    users: [{ name: root, uid: 0 }]",
    "",
  ].join("\n"),
};

const UI_CATALOGS: readonly ContentFile[] = [
  {
    file: "content/ui/en.yaml",
    text: yaml("menu:", "  new-game: New game", "  quit: Quit", "chapters:", "  a: Chapter a"),
  },
  {
    file: "content/ui/de.yaml",
    text: yaml(
      "menu:",
      "  new-game: Neues Spiel",
      "  quit: Beenden",
      "chapters:",
      "  a: Kapitel a",
    ),
  },
];

/** Levels x and y with complete English and German catalogs, and further catalogs. */
function load(
  levelCatalogs: readonly ContentFile[],
  uiCatalogs: readonly ContentFile[] = [],
): Content {
  const result = loadContent({
    chapters: CHAPTERS,
    levels: [levelFile("x"), levelFile("y")],
    worlds: [OFFICE_WORLD],
    levelCatalogs: [
      ...["x", "y"].flatMap((id) =>
        ["en", "de"].map((language) => ({
          file: `content/levels/${id}/${language}.yaml`,
          text: completeCatalog(language),
        })),
      ),
      ...levelCatalogs,
    ],
    uiCatalogs: [...UI_CATALOGS, ...uiCatalogs],
  });
  if (!result.ok) {
    throw new Error(result.problems.map((problem) => problem.message).join("\n"));
  }
  return result.value;
}

function catalogsOf(content: Content, id = "x") {
  const catalogs = content.levelCatalogs.get(id);
  if (catalogs === undefined) {
    throw new Error(`no catalogs for ${id}`);
  }
  return catalogs;
}

function t(language: string, source: string): CatalogText {
  return { language, source };
}

describe("levelTexts", () => {
  const content = load([
    {
      file: "content/levels/x/fr.yaml",
      text: yaml(
        "title: Titre",
        "hints: [Astuce, Concret, Solution FR]",
        "explanation:",
        "  options: []",
        "tip-wrong: Faux",
      ),
    },
  ]);

  test.each(["en", "de"])("a complete language: every text in %s", (language) => {
    expect(levelTexts(catalogsOf(content), language)).toEqual({
      title: t(language, `Title (${language})`),
      ticket: t(language, `Ticket (${language})`),
      hints: [
        t(language, `Tip (${language})`),
        t(language, `Concrete (${language})`),
        t(language, `Solution (${language})`),
      ],
      explanation: {
        text: t(language, `Explanation (${language})`),
        options: [{ option: "cat file", description: t(language, `Prints (${language})`) }],
        example: "cat -n a",
      },
      extraGoals: new Map([["fast", t(language, `Fast (${language})`)]]),
      texts: new Map([["tip-wrong", t(language, `Wrong (${language})`)]]),
    });
  });

  test("a further language: its own texts, English for the missing ones", () => {
    expect(levelTexts(catalogsOf(content), "fr")).toEqual({
      title: t("fr", "Titre"),
      ticket: t("en", "Ticket (en)"),
      hints: [t("fr", "Astuce"), t("fr", "Concret"), t("fr", "Solution FR")],
      explanation: {
        text: t("en", "Explanation (en)"),
        // An empty list of options is the language's own choice.
        options: [],
        example: "cat -n a",
      },
      extraGoals: new Map([["fast", t("en", "Fast (en)")]]),
      texts: new Map([["tip-wrong", t("fr", "Faux")]]),
    });
  });

  test("a level without a catalog in the language is English", () => {
    expect(levelTexts(catalogsOf(content, "y"), "fr")).toEqual(
      levelTexts(catalogsOf(content, "y"), "en"),
    );
  });

  test("an unknown language is English", () => {
    expect(levelTexts(catalogsOf(content), "pt-br")).toEqual(levelTexts(catalogsOf(content), "en"));
  });

  test("options, example and extra goals of a further language; missing hints are English", () => {
    const own = load([
      {
        file: "content/levels/x/fr.yaml",
        text: yaml(
          "explanation:",
          "  options:",
          "    - [cat file, Affiche]",
          "  example: cat -n a",
          "extra_goals:",
          "  fast: Vite",
        ),
      },
    ]);
    const texts = levelTexts(catalogsOf(own), "fr");
    expect(texts.explanation).toEqual({
      text: t("en", "Explanation (en)"),
      options: [{ option: "cat file", description: t("fr", "Affiche") }],
      example: "cat -n a",
    });
    expect(texts.extraGoals).toEqual(new Map([["fast", t("fr", "Vite")]]));
    expect(texts.hints).toEqual([
      t("en", "Tip (en)"),
      t("en", "Concrete (en)"),
      t("en", "Solution (en)"),
    ]);
  });

  test("without an example in English or the language, there is none", () => {
    const simple = yaml(
      "title: T",
      "ticket: T",
      "hints: [a, b, c]",
      "explanation: { text: E }",
      "extra_goals: { fast: F }",
      "tip-wrong: W",
    );
    const result = loadContent({
      chapters: {
        file: "content/chapters.yaml",
        text: yaml("format: 1", "chapters:", "  - id: a", "    levels: [x]"),
      },
      levels: [levelFile("x")],
      worlds: [OFFICE_WORLD],
      levelCatalogs: [
        { file: "content/levels/x/en.yaml", text: simple },
        { file: "content/levels/x/de.yaml", text: simple },
        { file: "content/levels/x/fr.yaml", text: yaml("title: Titre") },
      ],
      uiCatalogs: UI_CATALOGS,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(levelTexts(catalogsOf(result.value), "fr").explanation).toEqual({
        text: t("en", "E"),
        options: [],
      });
      // English has no options and no example, so the language misses neither.
      expect(missingTexts(result.value)).toEqual([
        {
          language: "fr",
          catalogMissing: true,
          keys: ["menu.new-game", "menu.quit", "chapters.a"],
        },
        {
          language: "fr",
          level: "x",
          catalogMissing: false,
          keys: ["ticket", "hints", "explanation.text", "extra_goals.fast", "tip-wrong"],
        },
      ]);
    }
  });
});

describe("uiTexts", () => {
  const content = load(
    [],
    [{ file: "content/ui/fr.yaml", text: yaml("menu:", "  new-game: Nouvelle partie") }],
  );

  test("English and German", () => {
    expect(uiTexts(content.uiCatalogs, "en")).toEqual(
      new Map([
        ["menu.new-game", t("en", "New game")],
        ["menu.quit", t("en", "Quit")],
        ["chapters.a", t("en", "Chapter a")],
      ]),
    );
    expect(uiTexts(content.uiCatalogs, "de")).toEqual(
      new Map([
        ["menu.new-game", t("de", "Neues Spiel")],
        ["menu.quit", t("de", "Beenden")],
        ["chapters.a", t("de", "Kapitel a")],
      ]),
    );
  });

  test("a further language with English for the missing texts", () => {
    expect(uiTexts(content.uiCatalogs, "fr")).toEqual(
      new Map([
        ["menu.new-game", t("fr", "Nouvelle partie")],
        ["menu.quit", t("en", "Quit")],
        ["chapters.a", t("en", "Chapter a")],
      ]),
    );
  });

  test("an unknown language is English", () => {
    expect(uiTexts(content.uiCatalogs, "it")).toEqual(uiTexts(content.uiCatalogs, "en"));
  });
});

describe("missingTexts", () => {
  test("only English and German: nothing is missing", () => {
    expect(missingTexts(load([]))).toEqual([]);
  });

  test("complete further languages miss nothing", () => {
    const content = load(
      ["x", "y"].map((id) => ({
        file: `content/levels/${id}/fr.yaml`,
        text: completeCatalog("fr"),
      })),
      [{ file: "content/ui/fr.yaml", text: UI_CATALOGS[0]?.text ?? "" }],
    );
    expect(missingTexts(content)).toEqual([]);
  });

  test("every further language with the UI and every level in chapter order", () => {
    const content = load(
      [
        { file: "content/levels/x/fr.yaml", text: yaml("title: Titre", "tip-wrong: Faux") },
        { file: "content/levels/y/es.yaml", text: completeCatalog("es") },
      ],
      [{ file: "content/ui/fr.yaml", text: yaml("menu:", "  quit: Quitter") }],
    );
    const all = [
      "title",
      "ticket",
      "hints",
      "explanation.text",
      "explanation.options",
      "explanation.example",
      "extra_goals.fast",
      "tip-wrong",
    ];
    expect(missingTexts(content)).toEqual([
      { language: "es", catalogMissing: true, keys: ["menu.new-game", "menu.quit", "chapters.a"] },
      { language: "es", level: "x", catalogMissing: true, keys: all },
      { language: "fr", catalogMissing: false, keys: ["menu.new-game", "chapters.a"] },
      {
        language: "fr",
        level: "x",
        catalogMissing: false,
        keys: all.filter((key) => key !== "title" && key !== "tip-wrong"),
      },
      { language: "fr", level: "y", catalogMissing: true, keys: all },
    ]);
  });
});
