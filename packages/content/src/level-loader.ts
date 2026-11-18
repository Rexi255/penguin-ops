// Loads content files from their text (ADR 0069). The content package stays pure (ADR 0006):
// it never reads files itself. Callers (content tests, the Electron main process) read a file
// and pass its name and text; problems name that file with line and column.

import type { z } from "zod";

import { type LoadResult, sortProblems } from "./content-problem";
import { type Level, levelSchema } from "./level-schema";
import { schemaProblems } from "./schema-problems";
import { parseYaml } from "./yaml-source";

/**
 * Reads a YAML file and checks it with a schema. `file` names the file in problems; use the
 * path from the repository root with forward slashes, for example
 * `content/levels/first-steps/level.yaml`.
 */
export function loadYaml<T>(schema: z.ZodType<T>, file: string, text: string): LoadResult<T> {
  const parsed = parseYaml(file, text);
  if (!parsed.ok) {
    return { ok: false, problems: sortProblems(parsed.problems) };
  }
  const result = schema.safeParse(parsed.source.value);
  if (!result.success) {
    return {
      ok: false,
      problems: sortProblems(schemaProblems(parsed.source, result.error.issues)),
    };
  }
  return { ok: true, value: result.data };
}

/** Reads and checks a `level.yaml` file (format: docs/LEVEL-AUTHORING.md). */
export function loadLevel(file: string, text: string): LoadResult<Level> {
  return loadYaml(levelSchema, file, text);
}
