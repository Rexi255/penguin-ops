import { describe, expect, test } from "vitest";

import { type Chapters, chaptersSchema } from "./chapters-schema";
import { formatProblem } from "./content-problem";
import { loadYaml } from "./level-loader";

const FILE = "content/chapters.yaml";

function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

function load(text: string) {
  return loadYaml(chaptersSchema, FILE, text);
}

function problems(text: string): string[] {
  const result = load(text);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.problems.map(formatProblem);
}

describe("chaptersSchema: valid files", () => {
  test("returns the chapters and their levels in the order of the file", () => {
    const text = yaml(
      "format: 1",
      "chapters:",
      "  - id: first-day",
      "    levels: [first-steps, where-am-i]",
      "  - id: left-behind",
      "    levels:",
      "      - printer-floor2",
    );
    const expected: Chapters = {
      format: 1,
      chapters: [
        { id: "first-day", levels: ["first-steps", "where-am-i"] },
        { id: "left-behind", levels: ["printer-floor2"] },
      ],
    };
    expect(load(text)).toEqual({ ok: true, value: expected });
  });
});

describe("chaptersSchema: problems", () => {
  test("a wrong format version", () => {
    expect(problems(yaml("format: 2", "chapters: [{ id: a, levels: [b] }]"))).toEqual([
      `${FILE}:1:1: format: the chapters format version must be 1`,
    ]);
  });

  test("missing fields", () => {
    expect(problems(yaml("format: 1"))).toEqual([
      `${FILE}:1:1: chapters: the required field "chapters" is missing`,
    ]);
    expect(problems(yaml("format: 1", "chapters:", "  - id: a"))).toEqual([
      `${FILE}:3:5: chapters[0].levels: the required field "levels" is missing`,
    ]);
  });

  test("unknown fields in the file and in a chapter", () => {
    expect(
      problems(
        yaml(
          "format: 1",
          "chapters:",
          "  - id: a",
          "    title: First day",
          "    levels: [b]",
          "icon: penguin",
        ),
      ),
    ).toEqual([
      `${FILE}:4:5: chapters[0].title: unknown field "title"`,
      `${FILE}:6:1: icon: unknown field "icon"`,
    ]);
  });

  test("no chapters and a chapter without levels", () => {
    expect(problems(yaml("format: 1", "chapters: []"))).toEqual([
      `${FILE}:2:1: chapters: the game needs at least one chapter`,
    ]);
    expect(problems(yaml("format: 1", "chapters:", "  - id: a", "    levels: []"))).toEqual([
      `${FILE}:4:5: chapters[0].levels: a chapter has at least one level`,
    ]);
  });

  test("IDs that are not kebab-case", () => {
    expect(
      problems(yaml("format: 1", "chapters:", "  - id: First_Day", "    levels: [Level1]")),
    ).toEqual([
      `${FILE}:3:5: chapters[0].id: a chapter ID must be kebab-case: lowercase letters and digits, separated by single hyphens`,
      `${FILE}:4:14: chapters[0].levels[0]: a level ID must be kebab-case: lowercase letters and digits, separated by single hyphens`,
    ]);
  });

  test("a repeated chapter ID is reported at the repetition", () => {
    expect(
      problems(
        yaml(
          "format: 1",
          "chapters:",
          "  - id: a",
          "    levels: [x]",
          "  - id: a",
          "    levels: [y]",
        ),
      ),
    ).toEqual([`${FILE}:5:5: chapters[1].id: the chapter ID "a" is repeated`]);
  });
});
