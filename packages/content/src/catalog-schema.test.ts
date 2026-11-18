import { describe, expect, test } from "vitest";
import type { z } from "zod";

import {
  isMandatoryLanguage,
  LANGUAGE_PATTERN,
  type LevelCatalog,
  levelCatalogSchema,
  type PartialLevelCatalog,
  partialLevelCatalogSchema,
  uiCatalogSchema,
} from "./catalog-schema";
import { formatProblem } from "./content-problem";
import { loadYaml } from "./level-loader";

const FILE = "content/levels/printer-floor2/en.yaml";

function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

function problems<T>(schema: z.ZodType<T>, text: string): string[] {
  const result = loadYaml(schema, FILE, text);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.problems.map(formatProblem);
}

function value<T>(schema: z.ZodType<T>, text: string): T | undefined {
  const result = loadYaml(schema, FILE, text);
  expect(result).toMatchObject({ ok: true });
  return result.ok ? result.value : undefined;
}

/** The mandatory fields of a level catalog, as YAML lines. */
const REQUIRED = [
  "title: The printer on the second floor",
  "ticket: Find the printer's **IP address**.",
  "hints:",
  "  - The handover is a text file.",
  '  - "`cat file` prints a file."',
  '  - "`cat ~/tickets/handover.txt`"',
  "explanation:",
  '  text: "`cat` prints the content of files."',
];

describe("levelCatalogSchema: valid catalogs", () => {
  test("returns all texts: own fields, extra goals and free text keys", () => {
    const text = yaml(
      ...REQUIRED,
      "  options:",
      '    - ["cat file", "Print the content"]',
      '    - ["cat -n file", "With line numbers"]',
      '  example: "cat -n /etc/hosts"',
      "extra_goals:",
      "  line-numbers: Read the file with line numbers.",
      "handover: |",
      "  Hi! I'm away for two weeks.",
      "  Cheers, Mehmet",
      "tip-wrong-printer: That is the printer on the ground floor.",
    );
    const expected: LevelCatalog = {
      title: "The printer on the second floor",
      ticket: "Find the printer's **IP address**.",
      hints: [
        "The handover is a text file.",
        "`cat file` prints a file.",
        "`cat ~/tickets/handover.txt`",
      ],
      explanation: {
        text: "`cat` prints the content of files.",
        options: [
          ["cat file", "Print the content"],
          ["cat -n file", "With line numbers"],
        ],
        example: "cat -n /etc/hosts",
      },
      extraGoals: new Map([["line-numbers", "Read the file with line numbers."]]),
      texts: new Map([
        ["handover", "Hi! I'm away for two weeks.\nCheers, Mehmet\n"],
        ["tip-wrong-printer", "That is the printer on the ground floor."],
      ]),
    };
    expect(value(levelCatalogSchema, text)).toEqual(expected);
  });

  test("options, example, extra goals and free texts are optional", () => {
    expect(value(levelCatalogSchema, yaml(...REQUIRED))).toEqual({
      title: "The printer on the second floor",
      ticket: "Find the printer's **IP address**.",
      hints: [
        "The handover is a text file.",
        "`cat file` prints a file.",
        "`cat ~/tickets/handover.txt`",
      ],
      explanation: { text: "`cat` prints the content of files.", options: [] },
      extraGoals: new Map(),
      texts: new Map(),
    });
  });
});

describe("levelCatalogSchema: problems", () => {
  test("missing fields of a complete catalog", () => {
    expect(problems(levelCatalogSchema, yaml("title: T", "explanation:", "  example: x"))).toEqual([
      `${FILE}:1:1: hints: the required field "hints" is missing`,
      `${FILE}:1:1: ticket: the required field "ticket" is missing`,
      `${FILE}:2:1: explanation.text: the required field "text" is missing`,
    ]);
  });

  test("a catalog that is not a map", () => {
    expect(problems(levelCatalogSchema, yaml("- title"))).toEqual([
      `${FILE}:1:1: Invalid input: expected object, received array`,
    ]);
  });

  test("not exactly three hints", () => {
    const message = "a level has exactly three hints: a tip, a concrete tip and the solution";
    const catalog = (hints: string) =>
      yaml("title: T", "ticket: X", `hints: ${hints}`, "explanation: { text: E }");
    expect(problems(levelCatalogSchema, catalog("[a, b]"))).toEqual([
      `${FILE}:3:1: hints: ${message}`,
    ]);
    expect(problems(levelCatalogSchema, catalog("[a, b, c, d]"))).toEqual([
      `${FILE}:3:1: hints: ${message}`,
    ]);
    expect(problems(levelCatalogSchema, catalog("a tip"))).toEqual([
      `${FILE}:3:1: hints: hints are a list of three texts`,
    ]);
  });

  test("texts that are empty or not strings", () => {
    expect(
      problems(
        levelCatalogSchema,
        yaml('title: ""', "ticket: '  '", "hints: [a, '', 3]", "explanation: { text: [x] }"),
      ),
    ).toEqual([
      `${FILE}:1:1: title: a text must not be empty`,
      `${FILE}:2:1: ticket: a text must not be empty`,
      `${FILE}:3:12: hints[1]: a text must not be empty`,
      `${FILE}:3:16: hints[2]: a text must be a string`,
      `${FILE}:4:16: explanation.text: a text must be a string`,
    ]);
  });

  test("options that are not pairs of texts", () => {
    const message = "an option is a pair: [option, description]";
    expect(
      problems(
        levelCatalogSchema,
        yaml(
          ...REQUIRED,
          "  options:",
          "    - [cat]",
          "    - [cat, Print, more]",
          "    - cat file",
          "    - [cat, 3]",
        ),
      ),
    ).toEqual([
      `${FILE}:10:7: explanation.options[0]: ${message}`,
      `${FILE}:11:7: explanation.options[1]: ${message}`,
      `${FILE}:12:7: explanation.options[2]: ${message}`,
      `${FILE}:13:13: explanation.options[3][1]: a text must be a string`,
    ]);
  });

  test("unknown fields of the explanation", () => {
    expect(problems(levelCatalogSchema, yaml(...REQUIRED, "  examples: [ls]"))).toEqual([
      `${FILE}:9:3: explanation.examples: unknown field "examples"`,
    ]);
  });

  test("free keys that are not text keys, also next to other problems", () => {
    const message =
      "a text key must be kebab-case and start with a letter, for example tip-wrong-printer";
    expect(
      problems(
        levelCatalogSchema,
        yaml(
          "title: ''",
          ...REQUIRED.slice(1),
          "Tip: x",
          "tip_wrong: x",
          "2nd-tip: x",
          "tip--wrong: x",
          "good-tip: ''",
        ),
      ),
    ).toEqual([
      `${FILE}:1:1: title: a text must not be empty`,
      `${FILE}:9:1: Tip: ${message}`,
      `${FILE}:10:1: tip_wrong: ${message}`,
      `${FILE}:11:1: ["2nd-tip"]: ${message}`,
      `${FILE}:12:1: ["tip--wrong"]: ${message}`,
      `${FILE}:13:1: ["good-tip"]: a text must not be empty`,
    ]);
  });

  test("a free text that is not a string", () => {
    expect(problems(levelCatalogSchema, yaml(...REQUIRED, "handover: [a, b]"))).toEqual([
      `${FILE}:9:1: handover: a text must be a string`,
    ]);
  });

  test("extra goal descriptions with invalid IDs or values", () => {
    expect(
      problems(
        levelCatalogSchema,
        yaml(...REQUIRED, "extra_goals:", "  Line_Numbers: x", "  quick: ''"),
      ),
    ).toEqual([
      `${FILE}:10:3: extra_goals.Line_Numbers: an extra goal ID must be kebab-case: lowercase letters and digits, separated by single hyphens`,
      `${FILE}:11:3: extra_goals.quick: a text must not be empty`,
    ]);
    expect(problems(levelCatalogSchema, yaml(...REQUIRED, "extra_goals: [a]"))).toEqual([
      `${FILE}:9:1: extra_goals: extra_goals is a map of extra goal IDs and their descriptions`,
    ]);
  });
});

describe("partialLevelCatalogSchema", () => {
  test("accepts a catalog that lacks any text", () => {
    const expected: PartialLevelCatalog = { extraGoals: new Map(), texts: new Map() };
    expect(value(partialLevelCatalogSchema, yaml("{}"))).toEqual(expected);
  });

  test("returns the texts that are there", () => {
    const expected: PartialLevelCatalog = {
      title: "L'imprimante",
      explanation: { example: "cat -n /etc/hosts" },
      extraGoals: new Map([["line-numbers", "Avec numéros de ligne."]]),
      texts: new Map([["handover", "Salut !"]]),
    };
    expect(
      value(
        partialLevelCatalogSchema,
        yaml(
          "title: L'imprimante",
          'explanation: { example: "cat -n /etc/hosts" }',
          "extra_goals: { line-numbers: Avec numéros de ligne. }",
          "handover: Salut !",
        ),
      ),
    ).toEqual(expected);
  });

  test("returns a complete catalog like the complete schema", () => {
    const text = yaml(...REQUIRED, "  options: [[ls, List]]", "  example: ls", "tip: A tip.");
    expect(value(partialLevelCatalogSchema, text)).toEqual(value(levelCatalogSchema, text));
  });

  test("checks the texts that are there like the complete schema", () => {
    expect(
      problems(
        partialLevelCatalogSchema,
        yaml("title: ''", "hints: [a, b]", "explanation: { options: [[a]], more: x }", "Tip: x"),
      ),
    ).toEqual([
      `${FILE}:1:1: title: a text must not be empty`,
      `${FILE}:2:1: hints: a level has exactly three hints: a tip, a concrete tip and the solution`,
      `${FILE}:3:26: explanation.options[0]: an option is a pair: [option, description]`,
      `${FILE}:3:32: explanation.more: unknown field "more"`,
      `${FILE}:4:1: Tip: a text key must be kebab-case and start with a letter, for example tip-wrong-printer`,
    ]);
  });
});

describe("uiCatalogSchema", () => {
  test("returns every text by its dotted key, in the order of the file", () => {
    const text = yaml(
      "app-name: PenguinOps",
      "menu:",
      "  new-game: New game",
      "  settings:",
      "    title: Settings",
      "    language: Language",
      "  quit: Quit",
    );
    expect(value(uiCatalogSchema, text)).toEqual(
      new Map([
        ["app-name", "PenguinOps"],
        ["menu.new-game", "New game"],
        ["menu.settings.title", "Settings"],
        ["menu.settings.language", "Language"],
        ["menu.quit", "Quit"],
      ]),
    );
  });

  test("keys, empty groups and entries that are neither texts nor groups", () => {
    const message =
      "a UI text key must be kebab-case and start with a letter, for example new-game";
    expect(
      problems(
        uiCatalogSchema,
        yaml(
          "menu:",
          "  New_Game: x",
          "  empty: {}",
          "  count: 3",
          "  list: [a]",
          "  blank: ''",
          "1st: x",
        ),
      ),
    ).toEqual([
      `${FILE}:2:3: menu.New_Game: ${message}`,
      `${FILE}:3:3: menu.empty: a group of UI texts must not be empty`,
      `${FILE}:4:3: menu.count: a UI entry is a text or a group of texts`,
      `${FILE}:5:3: menu.list: a UI entry is a text or a group of texts`,
      `${FILE}:6:3: menu.blank: a text must not be empty`,
      `${FILE}:7:1: ["1st"]: ${message}`,
    ]);
  });

  test("a catalog that is not a map or is empty", () => {
    expect(problems(uiCatalogSchema, yaml("- a"))).toEqual([
      `${FILE}:1:1: UI texts are a map of keys and texts or groups of texts`,
    ]);
    expect(problems(uiCatalogSchema, yaml("{}"))).toEqual([
      `${FILE}:1:1: a group of UI texts must not be empty`,
    ]);
  });
});

describe("languages", () => {
  test("language codes of catalog files", () => {
    for (const code of ["en", "de", "fr", "fil", "pt-br"]) {
      expect(LANGUAGE_PATTERN.test(code), code).toBe(true);
    }
    for (const code of ["", "e", "english", "DE", "pt-BR", "pt_br", "de-", "zh-hans", "level"]) {
      expect(LANGUAGE_PATTERN.test(code), code).toBe(false);
    }
  });

  test("English and German are mandatory", () => {
    expect(isMandatoryLanguage("en")).toBe(true);
    expect(isMandatoryLanguage("de")).toBe(true);
    expect(isMandatoryLanguage("fr")).toBe(false);
    expect(isMandatoryLanguage("de-at")).toBe(false);
  });
});
