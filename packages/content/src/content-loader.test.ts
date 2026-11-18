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

function problemsOf(files: ContentFiles): string[] {
  const result = loadContent(files);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.problems.map(formatProblem);
}

describe("loadContent: valid content", () => {
  test("returns the chapters and the levels in the order of the chapters", () => {
    const result = loadContent({
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
    const result = loadContent({
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
