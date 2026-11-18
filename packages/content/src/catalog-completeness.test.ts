import { describe, expect, test } from "vitest";

import { type ContentFile, loadContent } from "./content-loader";
import { formatProblem } from "./content-problem";

function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

const CHAPTERS: ContentFile = {
  file: "content/chapters.yaml",
  text: yaml("format: 1", "chapters:", "  - id: a", "    levels: [x]"),
};

/**
 * Level x: a prose file `handover`, a tip `tip-wrong`, a step message `found-it` and an extra
 * goal `fast`.
 */
const LEVEL = yaml(
  "format: 1",
  "id: x",
  "kind: main",
  "teaches: [cat]",
  "start:",
  "  files:",
  '    "~/handover.txt": { text: handover }',
  "steps:",
  "  - id: find",
  "    goal: { output_contains: a }",
  "    say: found-it",
  "  - id: read",
  "    goal: { output_contains: b }",
  "tips:",
  "  - when: { output_contains: c }",
  "    say: tip-wrong",
  "extra_goals:",
  "  - { id: fast, when: { output_contains: d }, xp: 10 }",
  "solutions:",
  "  - [cat ~/handover.txt]",
);

/** The lines of a complete catalog of level x. */
const COMPLETE = [
  "title: Title",
  "ticket: Ticket",
  "hints: [a, b, c]",
  "explanation:",
  "  text: Explanation",
  "  options:",
  "    - [cat file, Prints]",
  "    - [cat -n file, Numbers]",
  "  example: cat -n a",
  "extra_goals:",
  "  fast: Fast",
  "handover: Note",
  "found-it: Found",
  "tip-wrong: Wrong",
];

const UI = yaml(
  "menu:",
  "  new-game: New game",
  "  solved: '{count, plural, one {# solved} other {# solved}}'",
);

interface Files {
  readonly level?: string;
  readonly en?: string;
  readonly de?: string;
  readonly extra?: readonly ContentFile[];
  readonly ui?: readonly ContentFile[];
}

function load({ level = LEVEL, en, de, extra = [], ui }: Files) {
  return loadContent({
    chapters: CHAPTERS,
    levels: [{ file: "content/levels/x/level.yaml", text: level }],
    levelCatalogs: [
      { file: "content/levels/x/en.yaml", text: en ?? yaml(...COMPLETE) },
      { file: "content/levels/x/de.yaml", text: de ?? yaml(...COMPLETE) },
      ...extra,
    ],
    uiCatalogs: ui ?? [
      { file: "content/ui/en.yaml", text: UI },
      { file: "content/ui/de.yaml", text: UI },
    ],
  });
}

function problems(files: Files): string[] {
  const result = load(files);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.problems.map(formatProblem);
}

/** COMPLETE without the lines for which `drop` is true, plus more lines. */
function catalog(drop: (line: string) => boolean, ...more: string[]): string {
  return yaml(...COMPLETE.filter((line) => !drop(line)), ...more);
}

describe("level catalogs against level.yaml", () => {
  test("complete catalogs in English, German and a further language", () => {
    expect(
      load({
        extra: [
          {
            file: "content/levels/x/fr.yaml",
            text: yaml("title: Titre", "explanation:", "  options: []", "  example: cat -n a"),
          },
        ],
      }).ok,
    ).toBe(true);
  });

  test("texts and extra goal descriptions that level.yaml uses are missing", () => {
    expect(
      problems({
        de: catalog(
          (line) => /^(handover|found-it|tip-wrong|extra_goals| {2}fast)/u.test(line),
          "unused: x",
        ),
      }),
    ).toEqual([
      'content/levels/x/de.yaml:1:1: the description extra_goals.fast is missing: level.yaml has the extra goal "fast"',
      'content/levels/x/de.yaml:1:1: the text "found-it" is missing: level.yaml uses it',
      'content/levels/x/de.yaml:1:1: the text "handover" is missing: level.yaml uses it',
      'content/levels/x/de.yaml:1:1: the text "tip-wrong" is missing: level.yaml uses it',
      'content/levels/x/de.yaml:10:1: unused: level.yaml does not use the text "unused"',
    ]);
  });

  test("texts and extra goals that level.yaml does not have, in every language", () => {
    expect(
      problems({
        en: catalog(() => false, "tip-old: x"),
        extra: [
          {
            file: "content/levels/x/fr.yaml",
            text: yaml("extra_goals:", "  slow: Lent", "tip-typo: x"),
          },
        ],
      }),
    ).toEqual([
      'content/levels/x/en.yaml:15:1: ["tip-old"]: level.yaml does not use the text "tip-old"',
      'content/levels/x/fr.yaml:2:3: extra_goals.slow: level.yaml has no extra goal "slow"',
      'content/levels/x/fr.yaml:3:1: ["tip-typo"]: level.yaml does not use the text "tip-typo"',
    ]);
  });

  test("a text key used for a file and as a message", () => {
    const level = LEVEL.replace("say: tip-wrong", "say: handover");
    expect(
      problems({
        level,
        en: catalog((line) => line.startsWith("tip-wrong")),
        de: catalog((line) => line.startsWith("tip-wrong")),
      }),
    ).toEqual([
      'content/levels/x/level.yaml:16:5: tips[0].say: the text "handover" is the content of a file (start.files), so it cannot also be a message: file contents are not formatted',
    ]);
  });

  test("catalogs are not compared with a broken level file", () => {
    const result = load({ level: yaml("format: 1", "id: x"), de: catalog(() => false, "x: y") });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.filter((problem) => problem.file.endsWith("de.yaml"))).toEqual([]);
    }
  });
});

describe("commands of the explanation", () => {
  test("German options differ from English", () => {
    expect(
      problems({
        de: catalog(
          (line) => line.includes("cat -n file"),
          // Reordered and one more.
        ).replace(
          "    - [cat file, Prints]",
          "    - [cat -A file, Alles]\n    - [cat file, Gibt aus]",
        ),
      }),
    ).toEqual([
      "content/levels/x/de.yaml:6:3: explanation.options: the options must be the same commands, in the same order, as in English: cat file, cat -n file",
    ]);
  });

  test("German has no options where English has", () => {
    expect(
      problems({
        de: catalog((line) => line.includes("options") || line.startsWith("    - [")),
      }),
    ).toEqual([
      // A missing field is located at the map that lacks it.
      "content/levels/x/de.yaml:4:1: explanation.options: the options must be the same commands, in the same order, as in English: cat file, cat -n file",
    ]);
  });

  test("German has options or an example where English has none", () => {
    const english = catalog(
      (line) => line.includes("options") || line.startsWith("    - [") || line.includes("example"),
    );
    expect(problems({ en: english })).toEqual([
      "content/levels/x/de.yaml:6:3: explanation.options: the options must be the same commands as in English, which has none",
      "content/levels/x/de.yaml:9:3: explanation.example: the example must be the same command as in English, which has none",
    ]);
  });

  test("German example missing or different", () => {
    expect(problems({ de: catalog((line) => line.includes("example")) })).toEqual([
      "content/levels/x/de.yaml:4:1: explanation: the example is missing: English has cat -n a",
    ]);
    expect(
      problems({ de: catalog(() => false).replace("example: cat -n a", "example: cat -A a") }),
    ).toEqual([
      "content/levels/x/de.yaml:9:3: explanation.example: the example must be the same command as in English: cat -n a",
    ]);
  });

  test("a further language may leave out the commands or give no options, but not others", () => {
    expect(
      problems({
        extra: [
          {
            file: "content/levels/x/fr.yaml",
            text: yaml(
              "explanation:",
              "  options:",
              "    - [cat file, Affiche]",
              "  example: cat a",
            ),
          },
          { file: "content/levels/x/es.yaml", text: yaml("explanation:", "  options: []") },
        ],
      }),
    ).toEqual([
      "content/levels/x/fr.yaml:2:3: explanation.options: the options must be the same commands, in the same order, as in English: cat file, cat -n file",
      "content/levels/x/fr.yaml:4:3: explanation.example: the example must be the same command as in English: cat -n a",
    ]);
  });
});

describe("UI catalogs against English", () => {
  function ui(...files: [language: string, text: string][]): ContentFile[] {
    return files.map(([language, text]) => ({ file: `content/ui/${language}.yaml`, text }));
  }

  test("a further language may lack texts", () => {
    expect(
      load({ ui: ui(["en", UI], ["de", UI], ["fr", yaml("menu:", "  new-game: Nouvelle partie")]) })
        .ok,
    ).toBe(true);
  });

  test("German lacks a text; German and a further language have texts that English lacks", () => {
    expect(
      problems({
        ui: ui(
          ["en", UI],
          ["de", yaml("menu:", "  new-game: Neues Spiel", "  quit: Beenden")],
          ["fr", yaml("menu:", "  load: Charger")],
        ),
      }),
    ).toEqual([
      'content/ui/de.yaml:1:1: the UI text "menu.solved" is missing: English has it',
      'content/ui/de.yaml:3:3: menu.quit: English has no UI text "menu.quit"',
      'content/ui/fr.yaml:2:3: menu.load: English has no UI text "menu.load"',
    ]);
  });

  test("placeholders must be the same as in English, used in the same way", () => {
    expect(
      problems({
        ui: ui(
          [
            "en",
            yaml(
              "a: Hi {name}",
              "b: '{count, plural, one {#} other {#}}'",
              "c: Plain",
              "d: '{x} and {y}'",
            ),
          ],
          ["de", yaml("a: Hallo {nme}", "b: '{count}'", "c: '{extra}'", "d: '{y} und {x}'")],
          ["fr", yaml("a: Salut")],
        ),
      }),
    ).toEqual([
      "content/ui/de.yaml:1:1: a: the placeholders must be the same as in English: {name}",
      "content/ui/de.yaml:2:1: b: the placeholders must be the same as in English: {count} (number)",
      "content/ui/de.yaml:3:1: c: the placeholders must be the same as in English, which has none",
      "content/ui/fr.yaml:1:1: a: the placeholders must be the same as in English: {name}",
    ]);
  });
});
