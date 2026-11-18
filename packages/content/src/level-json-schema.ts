// The JSON Schema of level files, generated from the zod schema (ADR 0010, ADR 0068). Editors
// use it for completion and error highlighting in level.yaml; VS Code's YAML extension finds it
// through .vscode/settings.json. The zod schema stays the authority: the JSON Schema cannot
// express every check (for example duplicate IDs or that a file path takes no "/" at its end).
// The generated file content/schemas/level.schema.json is kept up to date by a test.

import { z } from "zod";

import { levelSchema } from "./level-schema";

/** Returns the JSON Schema (draft 7, which every editor reads) of `level.yaml` files. */
export function levelJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(levelSchema, { target: "draft-7", io: "input", unrepresentable: "throw" });
}
