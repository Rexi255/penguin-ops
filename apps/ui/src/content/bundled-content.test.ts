import { assert, describe, expect, test } from "vitest";

import {
  ContentLoadError,
  contentFilesFromBundle,
  loadBundledContent,
  loadContentFiles,
} from "./bundled-content";

describe("loadBundledContent", () => {
  test("loads the content folder with its chapters, levels and catalogs", () => {
    const content = loadBundledContent();
    expect(content.chapters.length).toBeGreaterThan(0);
    expect(content.levels.has("first-steps")).toBe(true);
    expect(content.uiCatalogs.en.get("start.quit")).toBe("Quit");
    expect(content.uiCatalogs.de.get("start.quit")).toBe("Beenden");
  });
});

describe("contentFilesFromBundle", () => {
  test("names each file by its path from the repository root", () => {
    expect(
      contentFilesFromBundle({
        "../../../../content/chapters.yaml": "a",
        "../../../../content/levels/x/level.yaml": "b",
      }),
    ).toEqual([
      { file: "content/chapters.yaml", text: "a" },
      { file: "content/levels/x/level.yaml", text: "b" },
    ]);
  });

  test("rejects a file outside the content folder", () => {
    expect(() => contentFilesFromBundle({ "../../../../assets/a.yaml": "" })).toThrow(
      "The bundled file ../../../../assets/a.yaml lies outside the content folder.",
    );
  });
});

/** The error that a function throws. */
function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("The function did not throw.");
}

describe("loadContentFiles", () => {
  test("lists every problem of the files", () => {
    const error = thrownBy(() => loadContentFiles([{ file: "content/notes.yaml", text: "" }]));
    assert.instanceOf(error, ContentLoadError);
    expect(error.problems[0]).toBe("content/chapters.yaml:1:1: the chapters file is missing");
    expect(error.problems).toContain(
      "content/notes.yaml:1:1: not a content file: content/ holds chapters.yaml, " +
        "levels/<level-id>/*.yaml, ui/*.yaml, worlds/*.yaml and the generated " +
        "schemas/*.schema.json",
    );
    expect(error.message).toBe(`The bundled content has problems:\n${error.problems.join("\n")}`);
  });
});
