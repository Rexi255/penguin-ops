// The content test (ADR 0011, ADR 0078): loads the repository's content/ folder with every check
// of the loader and plays every reference solution in every language and with two player names.
// The texts that further languages lack are listed, not errors (ADR 0074).

import { join } from "node:path";

import { formatProblem, loadContent, missingTexts } from "@penguin-ops/content";
import { checkReferenceSolutions, formatSolutionProblem } from "@penguin-ops/gameplay";
import { describe, expect, test } from "vitest";

import { readContentFiles } from "./read-content-files";

const folder = readContentFiles(join(import.meta.dirname, "..", ".."));
const loaded = loadContent(folder.files);

function content() {
  if (!loaded.ok) {
    throw new Error("content/ has problems (see the test that loads it)");
  }
  return loaded.value;
}

describe("content/", () => {
  test("holds only content files", () => {
    expect(folder.problems).toEqual([]);
  });

  test("loads without problems", () => {
    expect(loaded.ok ? [] : loaded.problems.map(formatProblem)).toEqual([]);
  });

  test("every reference solution solves its level in every language with two player names", () => {
    expect(checkReferenceSolutions(content()).map(formatSolutionProblem)).toEqual([]);
  });

  test("lists the texts that further languages lack", () => {
    const missing = missingTexts(content());
    for (const entry of missing) {
      const where = entry.level === undefined ? "UI" : `level "${entry.level}"`;
      const what = entry.catalogMissing ? "no catalog" : entry.keys.join(", ");
      console.info(`${entry.language}: ${where}: ${what}`);
    }
    expect(missing.every((entry) => entry.language !== "en" && entry.language !== "de")).toBe(true);
  });
});
