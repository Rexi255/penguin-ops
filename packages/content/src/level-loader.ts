// Loads content files from their text (ADR 0069). The content package stays pure (ADR 0006):
// it never reads files itself. Callers (content tests, the Electron main process) read a file
// and pass its name and text; problems name that file with line and column.

import type { z } from "zod";

import { type LoadResult, sortProblems } from "./content-problem";
import { type Level, levelSchema } from "./level-schema";
import { schemaProblems } from "./schema-problems";
import { parseYaml, type YamlSource } from "./yaml-source";

/**
 * Reads a YAML file and checks it with a schema. `file` names the file in problems; use the
 * path from the repository root with forward slashes, for example
 * `content/levels/first-steps/level.yaml`.
 */
export function loadYaml<T>(schema: z.ZodType<T>, file: string, text: string): LoadResult<T> {
  return readYaml(schema, file, text).result;
}

/** A YAML file read with a schema: the result and, if the YAML was readable, its source. */
export interface ReadYaml<T> {
  readonly result: LoadResult<T>;
  /** Locates data in the file for later checks; unset if the YAML could not be read. */
  readonly source?: YamlSource;
}

/** Like `loadYaml`, but also returns the source for checks across files. */
export function readYaml<T>(schema: z.ZodType<T>, file: string, text: string): ReadYaml<T> {
  const parsed = parseYaml(file, text);
  if (!parsed.ok) {
    return { result: { ok: false, problems: sortProblems(parsed.problems) } };
  }
  const { source } = parsed;
  const result = schema.safeParse(source.value);
  if (!result.success) {
    return {
      result: { ok: false, problems: sortProblems(schemaProblems(source, result.error.issues)) },
      source,
    };
  }
  return { result: { ok: true, value: result.data }, source };
}

/** Reads and checks a `level.yaml` file (format: docs/LEVEL-AUTHORING.md). */
export function loadLevel(file: string, text: string): LoadResult<Level> {
  return loadYaml(levelSchema, file, text);
}
