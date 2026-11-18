# 0068. Level schema v1 with zod and a generated JSON Schema

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0010 decided that levels are YAML data checked by a zod schema at build time, with a JSON
Schema generated from it for VS Code. ADR 0011 and ADR 0067 defined the check rules and how the
engine evaluates them; ADR 0067 left the YAML form of the rules to the content package.
`docs/LEVEL-AUTHORING.md` described the target format, but some parts were open: multi-step
tickets were sketched as `{ goal, on_complete }` without a meaning for `on_complete`, the form
of file modes was only shown by one example, and the content package may only import types from
the engine (ADR 0006), so it cannot call the engine's `checkRule`. ROADMAP M2.1 implements the
schema.

## Decision

- **zod 4** (MIT) checks `level.yaml` after the YAML parser has read it. `levelSchema` in
  `packages/content/src/level-schema.ts` checks the data and turns it into a `Level`: rules
  become engine `Rule` values, modes become numbers, `start.files` becomes a list of entries,
  defaults are filled in (`xp: 100`, `start.cwd: "~"`, empty `tips` and `extra_goals`), and
  `extra_goals` is called `extraGoals` in TypeScript. Unknown fields are errors everywhere, so
  typos do not go unnoticed. Every issue carries the path inside the level; the loader (M2.2)
  turns it into file and line.
- **Format version 1:** `format: 1` is required; any other value is an error.
- **Rules** are objects with exactly one key, the rule type (`{ cwd_is: "~" }`,
  `{ file_contains: [path, text] }`, `{ same_content: [path, path] }`, `{ all: [...] }`,
  `{ not: {...} }`). An unknown key is reported as an unknown rule type with the list of rule
  types; no key or two keys are errors that point to `all`, `any` and `not`.
- **The schema repeats the engine's rule checks** (paths absolute or starting with `~/`,
  non-empty `all` and `any`, `output_matches` a valid JavaScript regular expression with the
  flags `m` and `u`), because the content package may not call `checkRule`. A gameplay test,
  which sees both packages, makes sure that the schema accepts exactly the rules that
  `checkRule` accepts.
- **Multi-step tickets:** `steps` is a list of at least two `{ id, goal, say? }`; `id` is a
  stable kebab-case ID (save files store the last completed step, ADR 0013) and `say` an
  optional text key shown when the step is completed. A level has exactly one of `goal` and
  `steps`. Further step effects are added when a level needs them.
- **IDs and keys:** level, world, step and extra goal IDs are kebab-case; IDs inside a level
  are unique. Text keys are kebab-case and start with a letter; `title`, `ticket`, `hints` and
  `explanation` are reserved for the catalog's own texts. `teaches` lists at least one command
  name, each once.
- **Start files:** keys are absolute or start with `~/`, without empty components, `.` or `..`;
  a key ending with `/` is a directory. A file is a string (literal content) or an object with
  either `content` or `text` and optional `owner`, `group` and `mode`; a directory is `{}` or
  an object with only the attributes. No path is both a file and a directory, and nothing lies
  inside a file. Modes are written like `ls -l` shows them (`rw-r-----`, also with `s`, `S`,
  `t`, `T`), because YAML would read `0640` as the decimal number 640.
- **What the schema does not check:** that the folder name is the level ID, that the world,
  host, owners and groups exist, that text keys exist in the catalogs and that the commands in
  `teaches` exist. The loader, the content tests and the level session (M2.2 to M2.5) do that.
- **JSON Schema:** `levelJsonSchema()` generates a draft-07 JSON Schema (the draft every editor
  reads) from the input side of the zod schema, with descriptions for every field and rule
  type. It is committed as `content/schemas/level.schema.json`; a content test compares it with
  a fresh one (CI fails if it is stale) and `npm run schemas:update` rewrites it. Prettier
  skips the generated file. `.vscode/settings.json` maps it to `content/levels/*/level.yaml`
  for the YAML extension. The zod schema stays the authority: the JSON Schema cannot express
  every check (duplicate IDs, "a directory has no content", valid regular expressions).
- **A type-only `URL`:** zod's type declarations name the global `URL` type. The pure packages
  have no DOM library and no Node types (ADR 0006), so `types/zod-url.d.ts` declares `URL` as
  an interface without a value, included by the content and gameplay projects. Code there still
  cannot create or use URLs.
- **Test projects:** content and gameplay get the same split into a library and a test
  TypeScript project as the engine (ADR 0030), and their own Vitest projects.

## Alternatives considered

- **A union with one object per rule type:** the natural zod form, but a typo or a wrong value
  produces an "invalid union" error that lists the issues of every rule type. One object with
  optional keys and an "exactly one key" check gives one precise message and lets editors
  offer all rule types for completion.
- **Calling the engine's `checkRule` from the content package:** would break ADR 0006, which
  allows content only type imports from the engine. Moving the checks into a shared package
  would add a workspace for three small checks.
- **Octal modes (`mode: 0o640` or `"0640"`):** YAML 1.2 reads `0640` as 640 and `0o640` is
  easy to forget; the `ls -l` form is what the player sees in the game.
- **Generating the JSON Schema with a separate script:** Node.js cannot run the package sources
  directly (their imports have no file extensions), so a script would need an extra runner.
  Vitest's file snapshots already compare and update a generated file.
- **zod 3 with `zod-to-json-schema`:** an extra dependency; zod 4 generates JSON Schema itself.

## Consequences

- Level authors get completion and error highlighting in VS Code with the YAML extension, and
  precise messages from the schema.
- Every change of the schema needs `npm run schemas:update`; the test says so when the
  committed file is stale.
- The rule checks exist twice, kept in line by the gameplay test.
- The loader (M2.2) formats zod issues with file and line; it should flatten the "invalid
  union" error of a start file that is neither a string nor an object.
