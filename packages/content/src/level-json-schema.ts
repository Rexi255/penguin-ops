// The JSON Schemas of level and world files, generated from the zod schemas (ADR 0010,
// ADR 0068, ADR 0076). Editors use them for completion and error highlighting in level.yaml and
// in the world files; VS Code's YAML extension finds it
// through .vscode/settings.json. The zod schema stays the authority: the JSON Schema cannot
// express every check (for example duplicate IDs or that a file path takes no "/" at its end).
// The generated files content/schemas/level.schema.json and world.schema.json are kept up to
// date by a test.

import { z } from "zod";

import { levelSchema } from "./level-schema";
import { baseWorldSchema } from "./world-schema";

/** Returns the JSON Schema (draft 7, which every editor reads) of `level.yaml` files. */
export function levelJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(levelSchema, { target: "draft-7", io: "input", unrepresentable: "throw" });
}

/** Returns the JSON Schema (draft 7) of `content/worlds/<world-id>.yaml` files. */
export function worldJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(baseWorldSchema, {
    target: "draft-7",
    io: "input",
    unrepresentable: "throw",
  });
}
