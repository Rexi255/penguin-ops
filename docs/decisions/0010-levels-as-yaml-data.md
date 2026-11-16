# 0010. Levels are YAML data, the engine provides the vocabulary

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

In the prototype, levels are JavaScript objects with `check` and `note` functions, so every
level contains code. Levels must be easy to write, review, validate and test automatically,
also for very complex tasks later (multi-step incidents, several servers, scripts written by
the player).

## Decision

- Every level is a folder `content/levels/<level-id>/` with three files: `level.yaml`
  (language-independent data), `de.yaml` and `en.yaml` (texts, see ADR 0012).
- `level.yaml` is validated at build time against a **zod schema**. A JSON Schema generated
  from it gives autocompletion and error highlighting in VS Code.
- Level IDs are stable kebab-case strings. They are stored in save files and never change.
- The order of chapters and levels is defined in `content/chapters.yaml`, not inside the levels.
- The level format has a version number. A breaking change comes with a migration script that
  updates all levels.
- **The "Ansible principle":** like Ansible playbooks (YAML) and modules (code), level files
  only say *what* should happen; the engine provides the vocabulary that knows *how*: rule
  types, world building blocks, deterministic data generators, multi-step tickets and events.
  Each vocabulary item is TypeScript code with its own tests and an entry in
  `docs/LEVEL-AUTHORING.md`. Complex tasks grow the vocabulary; levels never contain code.

## Alternatives considered

- **TypeScript files containing only data:** checked by the compiler, but harder for the owner
  to read and tempting to sneak logic into levels again.
- **JSON:** no comments, multi-line file contents become unreadable `\n` strings.
- **TOML:** awkward for nested check rules.

## Consequences

- Content and code are physically separated; reviews of levels are easy to read.
- A YAML parser and the schema validation are part of the build.
- Adding an unusual task may require a new engine vocabulary item first.
