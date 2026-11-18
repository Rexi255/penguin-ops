import { describe, expect, test } from "vitest";

import { type ContentFile, type ContentFiles, loadContent } from "./content-loader";
import { formatProblem } from "./content-problem";

const CHAPTERS = "content/chapters.yaml";

function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

function levelPath(folder: string): string {
  return `content/levels/${folder}/level.yaml`;
}

/** A valid level file in `content/levels/<folder>/` with the given ID. */
function levelFile(folder: string, id: string = folder): ContentFile {
  return {
    file: levelPath(folder),
    text: yaml(
      "format: 1",
      `id: ${id}`,
      "kind: main",
      "teaches: [pwd]",
      "goal:",
      "  output_contains: /home",
      "solutions:",
      "  - [pwd]",
    ),
  };
}

/** A chapters file; each chapter is `[id, ...levelIds]`. */
function chaptersFile(...chapters: (readonly string[])[]): ContentFile {
  const lines = ["format: 1", "chapters:"];
  for (const [id = "", ...levels] of chapters) {
    lines.push(`  - id: ${id}`, `    levels: [${levels.join(", ")}]`);
  }
  return { file: CHAPTERS, text: yaml(...lines) };
}

/** A valid catalog of a mandatory language. */
const CATALOG_TEXT = yaml(
  "title: Title",
  "ticket: Ticket",
  "hints: [Tip, Concrete tip, Solution]",
  "explanation:",
  "  text: Explanation",
);

const UI_TEXT = yaml("menu:", "  new-game: New game");

/** Valid English and German catalogs for every level file in a level folder. */
function catalogsFor(levels: readonly ContentFile[]): ContentFile[] {
  const folders = new Set<string>();
  for (const { file } of levels) {
    if (/(?:^|\/)levels\/[^/]+\/level\.yaml$/u.test(file)) {
      folders.add(file.slice(0, -"level.yaml".length));
    }
  }
  return [...folders].flatMap((folder) => [
    { file: `${folder}en.yaml`, text: CATALOG_TEXT },
    { file: `${folder}de.yaml`, text: CATALOG_TEXT },
  ]);
}

const UI_CATALOGS: readonly ContentFile[] = [
  { file: "content/ui/en.yaml", text: UI_TEXT },
  { file: "content/ui/de.yaml", text: UI_TEXT },
];

/** Content files; catalogs that are not given are valid English and German ones. */
type Files = Pick<ContentFiles, "chapters" | "levels"> & Partial<ContentFiles>;

function load(files: Files) {
  return loadContent({
    levelCatalogs: catalogsFor(files.levels),
    uiCatalogs: UI_CATALOGS,
    ...files,
  });
}

function problemsOf(files: Files): string[] {
  const result = load(files);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.problems.map(formatProblem);
}

describe("loadContent: valid content", () => {
  test("returns the chapters and the levels in the order of the chapters", () => {
    const result = load({
      chapters: chaptersFile(["first-day", "b-level", "a-level"], ["left-behind", "c-level"]),
      levels: [levelFile("c-level"), levelFile("a-level"), levelFile("b-level")],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.chapters).toEqual([
      { id: "first-day", levels: ["b-level", "a-level"] },
      { id: "left-behind", levels: ["c-level"] },
    ]);
    expect([...result.value.levels.keys()]).toEqual(["b-level", "a-level", "c-level"]);
    expect(result.value.levels.get("a-level")).toMatchObject({ id: "a-level", kind: "main" });
  });

  test("accepts level paths relative to any folder that holds the levels folder", () => {
    const result = load({
      chapters: { file: "chapters.yaml", text: chaptersFile(["a", "x", "y"]).text },
      levels: [
        { file: "levels/x/level.yaml", text: levelFile("x").text },
        { file: "resources/content/levels/y/level.yaml", text: levelFile("y").text },
      ],
    });
    expect(result.ok).toBe(true);
  });
});

describe("loadContent: problems of single files", () => {
  test("reports the problems of every file together, sorted by file", () => {
    expect(
      problemsOf({
        chapters: { file: CHAPTERS, text: yaml("format: 2", "chapters: [{ id: a, levels: [x] }]") },
        levels: [
          { file: levelPath("y"), text: yaml("format: 1", "id: y", "kind: boss") },
          { file: levelPath("x"), text: "id: [x\n" },
        ],
      }),
    ).toEqual([
      `${CHAPTERS}:1:1: format: the chapters format version must be 1`,
      expect.stringMatching(/^content\/levels\/x\/level\.yaml:\d+:\d+: /u),
      `${levelPath("y")}:1:1: solutions: the required field "solutions" is missing`,
      `${levelPath("y")}:1:1: teaches: the required field "teaches" is missing`,
      expect.stringContaining(`${levelPath("y")}:3:1: kind: Invalid option`),
    ]);
  });

  test("checks no chapters against the levels while the chapters file is broken", () => {
    expect(
      problemsOf({
        chapters: { file: CHAPTERS, text: "chapters: [\n" },
        levels: [levelFile("x")],
      }),
    ).toEqual([expect.stringMatching(/^content\/chapters\.yaml:\d+:\d+: /u)]);
  });
});

describe("loadContent: level files and folders", () => {
  test("a level ID that is not the folder name is reported at the ID", () => {
    expect(
      problemsOf({ chapters: chaptersFile(["a", "x"]), levels: [levelFile("x", "other")] }),
    ).toEqual([
      `${levelPath("x")}:2:1: id: the level ID "other" must be the name of its folder "x"`,
    ]);
  });

  test("a level file with another name or outside a levels folder", () => {
    const message =
      "a level file must be named level.yaml and lie in its own folder in the levels folder, " +
      "for example content/levels/first-steps/level.yaml";
    const { text } = levelFile("x");
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x"]),
        levels: [
          levelFile("x"),
          { file: "content/levels/x/levle.yaml", text },
          { file: "content/levels/level.yaml", text },
          { file: "content/worlds/x/level.yaml", text },
          { file: "content\\levels\\x\\level.yaml", text },
        ],
      }),
    ).toEqual([
      `content/levels/level.yaml:1:1: ${message}`,
      `content/levels/x/levle.yaml:1:1: ${message}`,
      `content/worlds/x/level.yaml:1:1: ${message}`,
      `content\\levels\\x\\level.yaml:1:1: ${message}`,
    ]);
  });

  test("a level folder given twice", () => {
    expect(
      problemsOf({ chapters: chaptersFile(["a", "x"]), levels: [levelFile("x"), levelFile("x")] }),
    ).toEqual([`${levelPath("x")}:1:1: the level folder "x" is given twice`]);
  });
});

describe("loadContent: chapters against levels", () => {
  test("a chapter lists a level that does not exist", () => {
    expect(
      problemsOf({ chapters: chaptersFile(["a", "x", "missing"]), levels: [levelFile("x")] }),
    ).toEqual([
      `${CHAPTERS}:4:17: chapters[0].levels[1]: there is no level "missing" (no file levels/missing/level.yaml)`,
    ]);
  });

  test("a level in no chapter is reported at its ID", () => {
    expect(
      problemsOf({ chapters: chaptersFile(["a", "x"]), levels: [levelFile("x"), levelFile("y")] }),
    ).toEqual([`${levelPath("y")}:2:1: id: the level is in no chapter of ${CHAPTERS}`]);
  });

  test("a level in two chapters or twice in one is reported at each repetition", () => {
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x", "y"], ["b", "y", "x", "x"]),
        levels: [levelFile("x"), levelFile("y")],
      }),
    ).toEqual([
      `${CHAPTERS}:6:14: chapters[1].levels[0]: the level "y" is already in chapter "a"`,
      `${CHAPTERS}:6:17: chapters[1].levels[1]: the level "x" is already in chapter "a"`,
      `${CHAPTERS}:6:20: chapters[1].levels[2]: the level "x" is already in chapter "a"`,
    ]);
  });

  test("a broken level still counts as existing; one in no chapter is reported at its start", () => {
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x"]),
        levels: [
          { file: levelPath("x"), text: "id: [x\n" },
          { file: levelPath("y"), text: "id: [y\n" },
        ],
      }),
    ).toEqual([
      expect.stringMatching(/^content\/levels\/x\/level\.yaml:\d+:\d+: /u),
      `${levelPath("y")}:1:1: the level is in no chapter of ${CHAPTERS}`,
      expect.stringMatching(/^content\/levels\/y\/level\.yaml:\d+:\d+: /u),
    ]);
  });

  test("a level that fails its schema in no chapter is reported at its ID", () => {
    const text = yaml("format: 1", "id: y", "kind: main");
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x"]),
        levels: [levelFile("x"), { file: levelPath("y"), text }],
      }),
    ).toContain(`${levelPath("y")}:2:1: id: the level is in no chapter of ${CHAPTERS}`);
  });
});

function catalogPath(folder: string, language: string): string {
  return `content/levels/${folder}/${language}.yaml`;
}

/** The English and German catalogs of a level, with the title set to `<language> <folder>`. */
function catalogFiles(folder: string, ...languages: string[]): ContentFile[] {
  return languages.map((language) => ({
    file: catalogPath(folder, language),
    text: CATALOG_TEXT.replace("title: Title", `title: ${language} ${folder}`),
  }));
}

describe("loadContent: catalogs", () => {
  test("returns the catalogs of every level in chapter order and the UI catalogs", () => {
    const result = load({
      chapters: chaptersFile(["a", "y", "x"]),
      levels: [levelFile("x"), levelFile("y")],
      levelCatalogs: [
        ...catalogFiles("x", "en", "de"),
        ...catalogFiles("y", "de", "en"),
        { file: catalogPath("y", "fr"), text: yaml("title: fr y") },
      ],
      uiCatalogs: [
        ...UI_CATALOGS,
        { file: "content/ui/pt-br.yaml", text: yaml("menu: { new-game: Novo jogo }") },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { levelCatalogs, uiCatalogs } = result.value;
    expect([...levelCatalogs.keys()]).toEqual(["y", "x"]);
    expect(levelCatalogs.get("x")?.en.title).toBe("en x");
    expect(levelCatalogs.get("x")?.de.title).toBe("de x");
    expect(levelCatalogs.get("x")?.extra).toEqual(new Map());
    expect(levelCatalogs.get("y")?.extra).toEqual(
      new Map([["fr", { title: "fr y", extraGoals: new Map(), texts: new Map() }]]),
    );
    expect(uiCatalogs.en).toEqual(new Map([["menu.new-game", "New game"]]));
    expect(uiCatalogs.de).toEqual(new Map([["menu.new-game", "New game"]]));
    expect(uiCatalogs.extra).toEqual(
      new Map([["pt-br", new Map([["menu.new-game", "Novo jogo"]])]]),
    );
  });

  test("a missing English or German level catalog is reported where it belongs", () => {
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x", "y"]),
        levels: [levelFile("x"), levelFile("y")],
        levelCatalogs: [...catalogFiles("x", "en"), ...catalogFiles("y", "fr")],
      }),
    ).toEqual([
      `${catalogPath("x", "de")}:1:1: the German catalog is missing: every level needs en.yaml and de.yaml`,
      `${catalogPath("y", "de")}:1:1: the German catalog is missing: every level needs en.yaml and de.yaml`,
      `${catalogPath("y", "en")}:1:1: the English catalog is missing: every level needs en.yaml and de.yaml`,
    ]);
  });

  test("a broken level still needs its catalogs, and its catalogs belong to it", () => {
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x"]),
        levels: [{ file: levelPath("x"), text: "id: [x\n" }],
        levelCatalogs: catalogFiles("x", "en"),
      }),
    ).toEqual([
      `${catalogPath("x", "de")}:1:1: the German catalog is missing: every level needs en.yaml and de.yaml`,
      expect.stringMatching(/^content\/levels\/x\/level\.yaml:\d+:\d+: /u),
    ]);
  });

  test("the problems of catalogs are reported, without a missing catalog for a broken one", () => {
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x"]),
        levels: [levelFile("x")],
        levelCatalogs: [
          { file: catalogPath("x", "en"), text: yaml("title: T") },
          { file: catalogPath("x", "de"), text: "title: [\n" },
          { file: catalogPath("x", "fr"), text: yaml("hints: [a]") },
        ],
      }),
    ).toEqual([
      expect.stringMatching(/^content\/levels\/x\/de\.yaml:\d+:\d+: /u),
      `${catalogPath("x", "en")}:1:1: explanation: the required field "explanation" is missing`,
      `${catalogPath("x", "en")}:1:1: hints: the required field "hints" is missing`,
      `${catalogPath("x", "en")}:1:1: ticket: the required field "ticket" is missing`,
      `${catalogPath("x", "fr")}:1:1: hints: a level has exactly three hints: a tip, a concrete tip and the solution`,
    ]);
  });

  test("a catalog without a level, outside a level folder or not named after a language", () => {
    const text = CATALOG_TEXT;
    const naming =
      "is not named after a language: a catalog is named after its language code, " +
      "for example de.yaml, en.yaml or pt-br.yaml";
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x"]),
        levels: [levelFile("x")],
        levelCatalogs: [
          ...catalogFiles("x", "en", "de"),
          { file: catalogPath("y", "en"), text },
          { file: "content/levels/en.yaml", text },
          { file: catalogPath("x", "notes"), text },
          { file: catalogPath("x", "DE"), text },
        ],
      }),
    ).toEqual([
      "content/levels/en.yaml:1:1: a level catalog must lie in the folder of its level, for example content/levels/first-steps/de.yaml",
      `${catalogPath("x", "DE")}:1:1: "DE.yaml" ${naming}`,
      `${catalogPath("x", "notes")}:1:1: "notes.yaml" ${naming}`,
      `${catalogPath("y", "en")}:1:1: there is no level "y" for this catalog (no file levels/y/level.yaml)`,
    ]);
  });

  test("a level catalog given twice", () => {
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x"]),
        levels: [levelFile("x")],
        levelCatalogs: [...catalogFiles("x", "en", "de", "fr", "en"), ...catalogFiles("x", "fr")],
      }),
    ).toEqual([
      `${catalogPath("x", "en")}:1:1: the en catalog of the level "x" is given twice`,
      `${catalogPath("x", "fr")}:1:1: the fr catalog of the level "x" is given twice`,
    ]);
  });
});

describe("loadContent: UI catalogs", () => {
  test("a missing English or German UI catalog is reported next to the chapters file", () => {
    expect(
      problemsOf({ chapters: chaptersFile(["a", "x"]), levels: [levelFile("x")], uiCatalogs: [] }),
    ).toEqual([
      "content/ui/de.yaml:1:1: the German UI catalog is missing: the game needs ui/en.yaml and ui/de.yaml",
      "content/ui/en.yaml:1:1: the English UI catalog is missing: the game needs ui/en.yaml and ui/de.yaml",
    ]);
    expect(
      problemsOf({
        chapters: { file: "chapters.yaml", text: chaptersFile(["a", "x"]).text },
        levels: [levelFile("x")],
        uiCatalogs: UI_CATALOGS.slice(0, 1),
      }),
    ).toEqual([
      "ui/de.yaml:1:1: the German UI catalog is missing: the game needs ui/en.yaml and ui/de.yaml",
    ]);
  });

  test("UI catalogs outside the ui folder, not named after a language, twice or broken", () => {
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x"]),
        levels: [levelFile("x")],
        uiCatalogs: [
          ...UI_CATALOGS,
          { file: "content/ui/menu/en.yaml", text: UI_TEXT },
          { file: "content/ui/menu.yaml", text: UI_TEXT },
          { file: "content/ui/de.yaml", text: UI_TEXT },
          { file: "content/ui/fr.yaml", text: yaml("menu: {}") },
        ],
      }),
    ).toEqual([
      "content/ui/de.yaml:1:1: the de UI catalog is given twice",
      "content/ui/fr.yaml:1:1: menu: a group of UI texts must not be empty",
      'content/ui/menu.yaml:1:1: "menu.yaml" is not named after a language: a catalog is named after its language code, for example de.yaml, en.yaml or pt-br.yaml',
      "content/ui/menu/en.yaml:1:1: a UI catalog must lie in the ui folder, for example content/ui/de.yaml",
    ]);
  });

  test("a broken mandatory UI catalog is reported, not as missing", () => {
    expect(
      problemsOf({
        chapters: chaptersFile(["a", "x"]),
        levels: [levelFile("x")],
        uiCatalogs: [...UI_CATALOGS.slice(0, 1), { file: "content/ui/de.yaml", text: "- a\n" }],
      }),
    ).toEqual(["content/ui/de.yaml:1:1: UI texts are a map of keys and texts or groups of texts"]);
  });
});
