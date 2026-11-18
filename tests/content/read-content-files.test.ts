import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { readContentFiles } from "./read-content-files";

const roots: string[] = [];

/** A temporary repository root with these files below it. */
function repository(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "penguin-ops-content-"));
  roots.push(root);
  mkdirSync(join(root, "content"));
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, ...path.split("/"));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("readContentFiles", () => {
  test("sorts the files of the content folder into the inputs of loadContent", () => {
    const root = repository({
      "content/chapters.yaml": "chapters",
      "content/levels/b/level.yaml": "level b",
      "content/levels/a/level.yaml": "level a",
      "content/levels/a/en.yaml": "en a",
      "content/levels/a/notes.yaml": "notes a",
      "content/ui/en.yaml": "ui en",
      "content/worlds/office.yaml": "office",
      "content/schemas/level.schema.json": "{}",
    });
    expect(readContentFiles(root)).toEqual({
      files: {
        chapters: { file: "content/chapters.yaml", text: "chapters" },
        levels: [
          { file: "content/levels/a/level.yaml", text: "level a" },
          { file: "content/levels/b/level.yaml", text: "level b" },
        ],
        levelCatalogs: [
          { file: "content/levels/a/en.yaml", text: "en a" },
          { file: "content/levels/a/notes.yaml", text: "notes a" },
        ],
        uiCatalogs: [{ file: "content/ui/en.yaml", text: "ui en" }],
        worlds: [{ file: "content/worlds/office.yaml", text: "office" }],
      },
      problems: [],
    });
  });

  test("reports files that are not content and a missing chapters file", () => {
    const root = repository({
      "content/README.md": "",
      "content/levels/a/level.yml": "",
      "content/levels/a/old/level.yaml": "",
      "content/worlds/office.json": "",
    });
    const folder = readContentFiles(root);
    expect(folder.problems).toEqual([
      "content/README.md: not a content file: content/ holds chapters.yaml, levels/<level-id>/*.yaml, ui/*.yaml, worlds/*.yaml and the generated schemas/*.schema.json",
      "content/levels/a/level.yml: not a content file: content/ holds chapters.yaml, levels/<level-id>/*.yaml, ui/*.yaml, worlds/*.yaml and the generated schemas/*.schema.json",
      "content/levels/a/old/level.yaml: not a content file: content/ holds chapters.yaml, levels/<level-id>/*.yaml, ui/*.yaml, worlds/*.yaml and the generated schemas/*.schema.json",
      "content/worlds/office.json: not a content file: content/ holds chapters.yaml, levels/<level-id>/*.yaml, ui/*.yaml, worlds/*.yaml and the generated schemas/*.schema.json",
      "content/chapters.yaml: the chapters file is missing",
    ]);
    expect(folder.files.chapters).toEqual({ file: "content/chapters.yaml", text: "" });
    expect(folder.files.levels).toEqual([]);
  });
});
