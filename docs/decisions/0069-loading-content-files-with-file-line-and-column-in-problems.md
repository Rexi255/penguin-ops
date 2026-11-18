# 0069. Loading content files with file, line and column in problems

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0010 makes levels YAML data checked by a zod schema, and ADR 0068 built that schema. zod
reports a path inside the parsed value (`start.files["~/a"]`), not a place in the file, so a
level author would have to search for the spot. ROADMAP M2.2 asks for validation errors with
file and line. The content package is pure (ADR 0006): it may not read files, so the Electron
main process and the content tests read them and need a loader that works on text. ADR 0068
also noted that a start file that is neither a string nor an object produced zod's "invalid
union" issue, which lists the issues of every option. ROADMAP M2.2 is split: M2.2a loads one
YAML file with located problems; M2.2b adds `content/chapters.yaml` and loading all levels.

## Decision

- **The `yaml` library** (ISC, no dependencies) reads content files. Its document API keeps the
  position of every node, which a plain `parse` would drop.
- **YAML 1.2 with the core schema:** `yes` stays a string and `0640` is the number 640, as in
  ADR 0068. Duplicate keys are errors. All parser errors and warnings (bad syntax, tabs as
  indentation, unknown tags, more than one document) are problems, because content files must
  be clean. An empty file or one with only comments is a problem. An alias without an anchor is
  located at the alias; a document with too many aliases ("billion laughs") is refused.
- **The loader works on text:** `loadYaml(schema, file, text)` and `loadLevel(file, text)` in
  `packages/content/src/level-loader.ts` return `{ ok: true, value }` or
  `{ ok: false, problems }`. The caller reads the file and names it; problems repeat that name.
  The name is the path from the repository root with forward slashes.
- **A problem** (`ContentProblem`) has the file, line and column (both starting at 1, columns in
  UTF-16 code units like editors count them), the path inside the data written like JavaScript
  (`tips[0].say`, `start.files["~/a"]`) and a message. `formatProblem` writes
  `file:line:column: path: message`, the form compilers use, so editors and terminals can link
  to the spot. Problems are sorted by file, line, column, path and message; repeated ones are
  removed.
- **Where a problem is located:** the nodes along the zod path are followed as far as they
  exist. A map entry is located at its key, a list item at its start, the whole file at its
  first node. Data reached through an alias is located at the entry that holds the alias.
  Locating map entries at their key, also for wrong values, gives one predictable rule: the
  line that names the field.
- **Rewritten zod issues:** an unknown field becomes one problem per field
  (`unknown field "tipps"`), located at the field. A field missing from its map is reported as
  `the required field "solutions" is missing`, whatever value the schema expects, and located at
  the map that lacks it. An "invalid union" issue drops the options that failed only because
  the value has another type: if one option is left, its issues are reported; otherwise the
  union's own message, or "Invalid input: expected string or number" for a union without one.
- **The start file union gets its own message** in `level-schema.ts`, which names both forms of
  a file and of a directory.

## Alternatives considered

- **`js-yaml`:** widely used, but its `load` returns plain values without positions; locating a
  path would need a second parser.
- **YAML 1.1 (`yes` as true, `0640` as octal):** the old behaviour surprises authors and
  differs between tools; ADR 0068 already writes modes as strings for this reason.
- **Locating wrong values at the value instead of the key:** a column further to the right on
  the same line for flow values, but a different line for block maps and lists. One rule is
  easier to explain in `docs/LEVEL-AUTHORING.md`.
- **Reading files in the content package:** would break ADR 0006 and tie the loader to Node.js;
  passing text keeps it usable from tests, Electron and a possible web version.
- **Reporting zod's issues unchanged:** "expected array, received undefined" and the listing of
  every union option are hard to read for level authors.

## Consequences

- Level authors get messages like `content/levels/printer-floor2/level.yaml:11:5:
  start.files["notes.txt"]: a start file path must be absolute or start with "~/"`.
- `chapters.yaml`, worlds and the text catalogs (M2.2b, M2.3) reuse `loadYaml` with their own
  schemas.
- Messages from the `yaml` library and zod's default messages stay in their own wording (they
  start with a capital letter); the schema's own messages are lowercase.
- The content package depends on `yaml` at run time.
