import { describe, expect, test } from "vitest";
import { z } from "zod";

import { type ContentProblem, formatProblem } from "./content-problem";
import { loadLevel, loadYaml } from "./level-loader";

const FILE = "content/levels/first-steps/level.yaml";

/** Joins lines into the text of a file with a final line break. */
function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

/** A valid level, with `extra` lines added at its end. */
function levelText(...extra: string[]): string {
  return yaml(
    "format: 1",
    "id: first-steps",
    "kind: main",
    "teaches: [pwd]",
    "goal:",
    "  output_contains: /home",
    "solutions:",
    "  - [pwd]",
    ...extra,
  );
}

/** The formatted problems of a file that must fail to load. */
function problemsOf(result: ReturnType<typeof loadLevel>): string[] {
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.problems.map(formatProblem);
}

function levelProblems(text: string): string[] {
  return problemsOf(loadLevel(FILE, text));
}

describe("loadLevel: valid levels", () => {
  test("returns the level of the schema", () => {
    const result = loadLevel(FILE, levelText());
    expect(result).toEqual({
      ok: true,
      value: {
        format: 1,
        id: "first-steps",
        kind: "main",
        teaches: ["pwd"],
        xp: 100,
        start: { cwd: "~", files: [] },
        goal: { kind: "output_contains", text: "/home" },
        tips: [],
        extraGoals: [],
        solutions: [["pwd"]],
      },
    });
  });

  test("reads Windows line endings, a byte order mark and comments", () => {
    const text = `\uFEFF# A level\r\n${levelText().replaceAll("\n", "\r\n")}`;
    expect(loadLevel(FILE, text).ok).toBe(true);
  });

  test("reads YAML 1.2: yes is a string and 0640 a decimal number", () => {
    const result = loadLevel(
      FILE,
      levelText(
        "start:",
        "  files:",
        "    ~/answer.txt: yes",
        "extra_goals:",
        "  - id: fast",
        "    when: { cwd_is: '~' }",
        "    xp: 0640",
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.start.files).toEqual([
        { kind: "file", path: "~/answer.txt", source: { kind: "content", content: "yes" } },
      ]);
      expect(result.value.extraGoals[0]?.xp).toBe(640);
    }
  });

  test("follows anchors and aliases", () => {
    const result = loadLevel(
      FILE,
      levelText(
        "tips:",
        "  - when: &home { cwd_is: '~' }",
        "    say: tip-a",
        "  - when: *home",
        "    say: tip-b",
      ),
    );
    expect(result.ok && result.value.tips.map((tip) => tip.when)).toEqual([
      { kind: "cwd_is", path: "~" },
      { kind: "cwd_is", path: "~" },
    ]);
  });
});

describe("loadLevel: YAML errors", () => {
  test("an empty file or one with only comments", () => {
    expect(levelProblems("")).toEqual([`${FILE}:1:1: the file is empty`]);
    expect(levelProblems("# nothing yet\n\n")).toEqual([`${FILE}:1:1: the file is empty`]);
  });

  test("a repeated key names the line of the repetition", () => {
    expect(levelProblems(levelText("kind: side"))).toEqual([
      `${FILE}:9:1: Map keys must be unique`,
    ]);
  });

  test("a syntax error names the line and column where the parser notices it", () => {
    expect(levelProblems(yaml("format: 1", "teaches: [pwd", "kind: main"))).toEqual([
      `${FILE}:3:1: Flow sequence in block collection must be sufficiently indented and end with a ]`,
    ]);
  });

  test("a tab used for indentation", () => {
    expect(levelProblems(yaml("start:", "\tcwd: /tmp"))).toEqual([
      `${FILE}:2:1: Tabs are not allowed as indentation`,
    ]);
  });

  test("a second document", () => {
    expect(levelProblems(`${levelText()}---\nid: other\n`)).toEqual([
      `${FILE}:9:1: Source contains multiple documents; please use YAML.parseAllDocuments()`,
    ]);
  });

  test("an unknown tag", () => {
    expect(levelProblems(levelText("xp: !big 100"))).toEqual([`${FILE}:9:5: Unresolved tag: !big`]);
  });

  test("an alias without an anchor names the alias", () => {
    expect(levelProblems(levelText("tips:", "  - when: *home", "    say: tip-a"))).toEqual([
      `${FILE}:10:11: the alias *home has no anchor &home before it`,
    ]);
  });

  test("too many aliases (a billion laughs file)", () => {
    const lines = ["a0: &a0 [x, x, x, x, x, x, x, x, x, x]"];
    for (let level = 1; level <= 6; level += 1) {
      const previous = `*a${String(level - 1)}`;
      lines.push(`a${String(level)}: &a${String(level)} [${Array(10).fill(previous).join(", ")}]`);
    }
    expect(levelProblems(yaml(...lines))).toEqual([
      `${FILE}:1:1: Excessive alias count indicates a resource exhaustion attack`,
    ]);
  });
});

describe("loadLevel: schema problems with file, line and column", () => {
  test("a wrong value is located at its map entry", () => {
    expect(levelProblems(levelText("xp: lots"))).toEqual([
      `${FILE}:9:1: xp: Invalid input: expected number, received string`,
    ]);
  });

  test("an unknown field is located at its entry, one problem per field", () => {
    expect(levelProblems(levelText("tipps: []", "start:", "  cdw: /tmp", "  files: {}"))).toEqual([
      `${FILE}:9:1: tipps: unknown field "tipps"`,
      `${FILE}:11:3: start.cdw: unknown field "cdw"`,
    ]);
  });

  test("a missing required field is located at the map or list item that lacks it", () => {
    expect(
      levelProblems(
        yaml(
          "format: 1",
          "id: first-steps",
          "kind: main",
          "teaches: [pwd]",
          "goal: { cwd_is: '~' }",
        ),
      ),
    ).toEqual([`${FILE}:1:1: solutions: the required field "solutions" is missing`]);
    expect(levelProblems(levelText("tips:", "  - say: tip-a"))).toEqual([
      `${FILE}:10:5: tips[0].when: the required field "when" is missing`,
    ]);
  });
  test("a missing field is reported as missing whatever value its schema expects", () => {
    expect(
      levelProblems(
        yaml("id: first-steps", "teaches: [pwd]", "goal: { cwd_is: '~' }", "solutions: [[pwd]]"),
      ),
    ).toEqual([
      `${FILE}:1:1: format: the required field "format" is missing`,
      `${FILE}:1:1: kind: the required field "kind" is missing`,
    ]);
  });

  test("a problem of a whole map written in block style is located at its key", () => {
    expect(
      levelProblems(levelText("start:", "  files:", "    ~/notes.txt:", "      owner: alex")),
    ).toEqual([
      `${FILE}:11:5: start.files["~/notes.txt"]: a file needs content or text; end the path with "/" for a directory`,
    ]);
  });

  test("a problem of a start file path is located at the path", () => {
    expect(levelProblems(levelText("start:", "  files:", "    notes.txt: hello"))).toEqual([
      `${FILE}:11:5: start.files["notes.txt"]: a start file path must be absolute or start with "~/" (the player's home)`,
    ]);
  });

  test("a problem in a list is located at the item", () => {
    expect(
      levelProblems(levelText("teaches: [pwd, ls, pwd]").replace("teaches: [pwd]\n", "")),
    ).toEqual([`${FILE}:8:20: teaches[2]: the command "pwd" is repeated`]);
  });

  test("a problem of the whole level is located at its start", () => {
    expect(
      levelProblems(
        yaml(
          "# Level",
          "format: 1",
          "id: first-steps",
          "kind: main",
          "teaches: [pwd]",
          "solutions: [[pwd]]",
        ),
      ),
    ).toEqual([`${FILE}:2:1: a level needs either goal or steps`]);
  });

  test("a file that is not a map", () => {
    expect(levelProblems(yaml("- format: 1"))).toEqual([
      `${FILE}:1:1: Invalid input: expected object, received array`,
    ]);
  });

  test("problems are sorted by line and column", () => {
    const problems = levelProblems(
      yaml(
        "format: 2",
        "id: First",
        "kind: main",
        "teaches: [pwd]",
        "goal: { cwd_is: here }",
        "solutions: []",
      ),
    );
    expect(problems.map((problem) => problem.split(": ")[0])).toEqual([
      `${FILE}:1:1`,
      `${FILE}:2:1`,
      `${FILE}:5:9`,
      `${FILE}:6:1`,
    ]);
  });
});

describe("loadLevel: a start file that is neither a string nor an object", () => {
  test("is one problem with the union's message", () => {
    expect(levelProblems(levelText("start:", "  files:", "    ~/a.txt: 42"))).toEqual([
      `${FILE}:11:5: start.files["~/a.txt"]: a start file is its content (a string) or an object with content or text; a directory is {} or an object with owner, group and mode`,
    ]);
  });

  test("an object with a wrong field reports only the object's problem", () => {
    expect(levelProblems(levelText("start:", "  files:", "    ~/a.txt: { content: 42 }"))).toEqual([
      `${FILE}:11:16: start.files["~/a.txt"].content: Invalid input: expected string, received number`,
    ]);
  });
});

describe("loadYaml with other schemas", () => {
  const FILE_NAME = "content/example.yaml";

  function problems(schema: z.ZodType, text: string): ContentProblem[] {
    const result = loadYaml(schema, FILE_NAME, text);
    expect(result.ok).toBe(false);
    return result.ok ? [] : [...result.problems];
  }

  test("returns the parsed value", () => {
    expect(loadYaml(z.object({ a: z.number() }), FILE_NAME, "a: 1\n")).toEqual({
      ok: true,
      value: { a: 1 },
    });
  });

  test("a union without its own message lists the expected types", () => {
    const schema = z.object({ a: z.union([z.string(), z.number()]) });
    expect(problems(schema, "a: [1]\n")).toEqual([
      {
        file: FILE_NAME,
        line: 1,
        column: 1,
        path: "a",
        message: "Invalid input: expected string or number",
      },
    ]);
  });

  test("a union whose options fail inside keeps zod's message", () => {
    const schema = z.object({
      a: z.union([z.object({ b: z.string() }), z.object({ c: z.number() })]),
    });
    expect(problems(schema, "a: { b: 1, c: x }\n")).toEqual([
      { file: FILE_NAME, line: 1, column: 1, path: "a", message: "Invalid input" },
    ]);
  });

  test("data reached through an alias is located at the entry that holds the alias", () => {
    const schema = z.object({ a: z.object({ b: z.string() }), c: z.object({ b: z.string() }) });
    expect(problems(schema, yaml("a: &x { b: 1 }", "c: *x"))).toEqual([
      {
        file: FILE_NAME,
        line: 1,
        column: 9,
        path: "a.b",
        message: "Invalid input: expected string, received number",
      },
      {
        file: FILE_NAME,
        line: 2,
        column: 1,
        path: "c.b",
        message: "Invalid input: expected string, received number",
      },
    ]);
  });

  test("a problem with a numeric map key", () => {
    const schema = z.record(z.string(), z.string());
    expect(problems(schema, "1: 2\n")).toEqual([
      {
        file: FILE_NAME,
        line: 1,
        column: 1,
        path: '["1"]',
        message: "Invalid input: expected string, received number",
      },
    ]);
  });

  test("an unknown field and a missing field in a flow map", () => {
    const schema = z.strictObject({ a: z.object({ b: z.string() }) });
    expect(problems(schema, yaml("x: 1", "a: { }"))).toEqual([
      { file: FILE_NAME, line: 1, column: 1, path: "x", message: 'unknown field "x"' },
      {
        file: FILE_NAME,
        line: 2,
        column: 1,
        path: "a.b",
        message: 'the required field "b" is missing',
      },
    ]);
  });
});
