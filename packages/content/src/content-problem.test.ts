import { describe, expect, test } from "vitest";

import {
  type ContentProblem,
  formatDataPath,
  formatProblem,
  sortProblems,
} from "./content-problem";

function problem(changes: Partial<ContentProblem> = {}): ContentProblem {
  return { file: "content/a.yaml", line: 1, column: 1, path: "", message: "wrong", ...changes };
}

describe("formatProblem", () => {
  test("names file, line, column, path and message", () => {
    expect(formatProblem(problem({ line: 12, column: 5, path: "tips[0].say" }))).toBe(
      "content/a.yaml:12:5: tips[0].say: wrong",
    );
  });

  test("leaves out an empty path", () => {
    expect(formatProblem(problem())).toBe("content/a.yaml:1:1: wrong");
  });
});

describe("formatDataPath", () => {
  test.each<[PropertyKey[], string]>([
    [[], ""],
    [["xp"], "xp"],
    [["extra_goals", 0, "when"], "extra_goals[0].when"],
    [[0, "id"], "[0].id"],
    [["start", "files", "~/notes.txt"], 'start.files["~/notes.txt"]'],
    [["teaches", 2], "teaches[2]"],
    [["kebab-key"], '["kebab-key"]'],
    [["1"], '["1"]'],
    [[Symbol.for("s")], '["Symbol(s)"]'],
  ])("%j is %s", (path, text) => {
    expect(formatDataPath(path)).toBe(text);
  });
});

describe("sortProblems", () => {
  test("sorts by file, line, column, path and message", () => {
    const problems = [
      problem({ file: "content/b.yaml" }),
      problem({ line: 3 }),
      problem({ line: 2, column: 7 }),
      problem({ line: 2, column: 3, path: "b" }),
      problem({ line: 2, column: 3, path: "a", message: "z" }),
      problem({ line: 2, column: 3, path: "a", message: "y" }),
    ];
    expect(sortProblems(problems).map(formatProblem)).toEqual([
      "content/a.yaml:2:3: a: y",
      "content/a.yaml:2:3: a: z",
      "content/a.yaml:2:3: b: wrong",
      "content/a.yaml:2:7: wrong",
      "content/a.yaml:3:1: wrong",
      "content/b.yaml:1:1: wrong",
    ]);
  });

  test("removes repeated problems and keeps the input", () => {
    const problems = [problem(), problem({ line: 2 }), problem()];
    expect(sortProblems(problems)).toEqual([problem(), problem({ line: 2 })]);
    expect(problems).toHaveLength(3);
  });
});
