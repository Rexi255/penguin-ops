import { describe, expect, test } from "vitest";

import { sortContentFiles } from "./content-files";
import { formatProblem } from "./content-problem";

const NOT_CONTENT =
  "not a content file: content/ holds chapters.yaml, levels/<level-id>/*.yaml, ui/*.yaml, " +
  "worlds/*.yaml and the generated schemas/*.schema.json";

function file(path: string, text = path): { file: string; text: string } {
  return { file: path, text };
}

describe("sortContentFiles", () => {
  test("sorts the files of the content folder into the inputs of loadContent", () => {
    const sorted = sortContentFiles([
      file("content/worlds/office.yaml"),
      file("content/levels/b/level.yaml"),
      file("content/ui/en.yaml"),
      file("content/levels/a/notes.yaml"),
      file("content/chapters.yaml"),
      file("content/levels/a/level.yaml"),
      file("content/levels/a/en.yaml"),
      file("content/schemas/level.schema.json"),
    ]);
    expect(sorted).toEqual({
      files: {
        chapters: file("content/chapters.yaml"),
        levels: [file("content/levels/a/level.yaml"), file("content/levels/b/level.yaml")],
        levelCatalogs: [file("content/levels/a/en.yaml"), file("content/levels/a/notes.yaml")],
        uiCatalogs: [file("content/ui/en.yaml")],
        worlds: [file("content/worlds/office.yaml")],
      },
      problems: [],
    });
  });

  test("reports files that are not content and a missing chapters file", () => {
    const sorted = sortContentFiles([
      file("content/worlds/office.json"),
      file("content/README.md"),
      file("content/levels/a/level.yml"),
      file("content/levels/a/old/level.yaml"),
      file("levels/a/level.yaml"),
    ]);
    // Sorted by UTF-16 code units: capitals before lowercase letters.
    expect(sorted.problems.map(formatProblem)).toEqual([
      `content/README.md:1:1: ${NOT_CONTENT}`,
      "content/chapters.yaml:1:1: the chapters file is missing",
      `content/levels/a/level.yml:1:1: ${NOT_CONTENT}`,
      `content/levels/a/old/level.yaml:1:1: ${NOT_CONTENT}`,
      `content/worlds/office.json:1:1: ${NOT_CONTENT}`,
      `levels/a/level.yaml:1:1: ${NOT_CONTENT}`,
    ]);
    expect(sorted.files.chapters).toEqual({ file: "content/chapters.yaml", text: "" });
    expect(sorted.files.levels).toEqual([]);
  });
});
