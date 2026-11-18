# 0078. Content tests read content from disk and play every reference solution

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0011 requires automated tests that replay every reference solution in every language and
with two different user names and assert that the goal is not reached at the start, is reached
afterwards, and that no tip fires on the way. ADR 0015 runs "unit and content tests" on Linux
and Windows. ROADMAP M2.4b is that content test; it needed the level session (ADR 0077). The
loader already checks the schemas, the catalogs and the worlds (ADR 0069 to ADR 0076) but never
reads files: content and gameplay are pure (ADR 0006). The repository tooling project
(`tsconfig.tooling.json`) runs scripts directly in Node.js with `NodeNext` resolution, which
cannot type-check the packages' extensionless imports. `content/` held no level, world or UI
catalog yet, so a test of it could not run.

## Decision

- **Playing the levels is gameplay code.** `checkReferenceSolutions(content)` in
  `packages/gameplay` plays every level in English, German and every further language it has a
  catalog for, with the player names `alice` and `max-2`, from a fixed game time
  (2026-01-05 08:00 UTC), at a terminal width of 80. It reports, per level, language and
  player:
  - a level that cannot start (its world does not build, the name is taken, the start
    directory is missing);
  - any game event before the first input (goal or step holds, tip, extra goal);
  - per reference solution: an incomplete command line, unsupported syntax, a shell feature or
    command option the game does not simulate, a tip, and a ticket that is not solved at the
    end;
  - a checkpoint (every step but the last) at which the level cannot resume.
  The developer mode (M2.7) can reuse it.
- **Reading the folder is a test helper in its own project.** `tests/content/` is a TypeScript
  project with Node types that may import engine, content and gameplay (an ESLint boundary like
  the workspaces'). `readContentFiles(root)` sorts `content/` into the inputs of
  `loadContent` with paths from the repository root and forward slashes, skips the generated
  `schemas/*.schema.json` and reports every other file and a missing `chapters.yaml`.
- **The content test** (`tests/content/content.test.ts`, Vitest project `content-tests`, part
  of `npm test` on Linux and Windows) asserts that `content/` holds only content files, loads
  without problems and that `checkReferenceSolutions` finds none. It prints the texts that
  further languages lack (`missingTexts`); they are not errors (ADR 0074).
- **First real content.** To give the test something to play, M2.4b adds the standard world
  `office` (one host `itdesk`, the prototype's name, provisional until the story workshop),
  the chapter `first-day`, minimal UI catalogs and the prototype's first level as
  `first-steps` (`pwd`, `ls`, `cd`), as test content in the sense of M2.6.

## Alternatives considered

- **The content test inside the gameplay package:** gameplay tests may not use Node APIs
  (ADR 0030), and reading the repository is not gameplay's concern.
- **A script in `scripts/`:** the tooling project cannot type-check the packages, and a script
  would duplicate what Vitest already reports.
- **A test that passes on an empty `content/`:** it would prove nothing and hide a missing
  chapters file; the M2 acceptance criterion needs real levels.
- **Many player names or random ones:** two fixed names that differ in length and letters are
  enough to catch rules that depend on the name, and keep failures reproducible.

## Consequences

- Adding a level fails `npm test` until it loads, builds and is solvable in every language.
- M2.6 ports the remaining four prototype levels; the first one is already there.
- The texts of `first-steps` and the office world's names change in the story workshop (M4).
- Running the content tests alone: `npx vitest run --project content-tests`.
