# PenguinOps

PenguinOps is a desktop learning game for Linux commands. The player solves support tickets in
a fictional company's IT department inside a simulated terminal. It is relaxed and humorous: no
time pressure, no failure, only hints. Bilingual (German/English), open source (MIT).

The whole project is built with Claude Code. The owner (GitHub: Rexi255) is an IT specialist
apprentice (system integration) with Linux basics and no TypeScript experience. He steers
through questions and reviews and plays the game on Windows.

@docs/STATUS.md

## Language rules

- Talk to the user in German: explanations, questions, summaries.
- Write everything that goes into the repository or onto GitHub in English: code, identifiers,
  comments, commit messages, test names, config, all Markdown files, skills, rules, issues,
  release notes.
- The only exception: translation files for game content (`de.yaml` files in
  `content/levels/*/` and `content/ui/de.yaml`).
- Inside the simulated Linux world everything is English in every language: folder and file
  names, paths, commands and options, user, group and host names, domains, configs, logs, and
  the output and error messages of simulated commands.

## Reply style

- Replies to the user are short and direct: no filler, no pleasantries, no repetition, no
  narration of tool calls. Short sentences and fragments are fine. Facts, commands, numbers,
  paths and error messages stay exact.
- Clarity wins over brevity for explanations of new concepts, security warnings, irreversible
  actions and step-by-step instructions for the user.
- This applies to chat only. Everything written into the repository or onto GitHub is normal,
  complete prose. Reasons: [ADR 0028](docs/decisions/0028-terse-replies.md).

## Session routine

- In your first reply of a session, summarise the state from `docs/STATUS.md` (imported above)
  and the git context from the SessionStart hook in 2–3 German sentences and name the next
  step. If the first message is `/next` or `/wrap-up`, the skill's output replaces this.
- Work on exactly one small work package at a time: one ROADMAP checkbox or a part of it.
- After finishing a work package, remind the user of `/wrap-up` in one short German sentence.

## Working rules

- Do not expand the scope beyond the agreed work package. Put new ideas into the "Ideas"
  section of `docs/ROADMAP.md` instead.
- When something is unclear, ask in German instead of guessing.
- Explain new concepts (TypeScript, React, Electron, testing, architecture) in 1–3 German
  sentences when they first come up.
- Record every important decision as a new file in `docs/decisions/` (copy `template.md`; use
  `/adr` once it exists).
- Quality over speed: no shortcuts, no TODO hacks, no placeholder implementations that pretend
  to work.
- In cloud sessions the user cannot run the app. Verify UI work with Playwright screenshots.

## Definition of Done

A work package is done only when all of these are true:

1. The code builds and runs on Windows and Linux.
2. `npm run check` passes.
3. New or changed behaviour has tests, including error cases. Every level has reference
   solutions that are tested in every language.
4. The documentation duty below is fulfilled in the same commit.
5. The work is committed on `main` and pushed.

## Documentation duty

For every work package, without being asked, in the same commit:

- `docs/STATUS.md`: update Recently completed (last ~5 items), In progress, Next 3 steps
  (ROADMAP ids), Blockers and open questions. Keep it to one screen.
- `docs/ROADMAP.md`: tick completed items.
- `docs/decisions/`: add a record for every new or changed decision. Never rewrite an accepted
  record; a changed decision gets a new record that supersedes the old one, and only the old
  record's status line changes.
- `docs/ARCHITECTURE.md`: update when the structure or the interplay of parts changes.
- `CHANGELOG.md`: add player-visible changes under "Unreleased".
- `docs/LEVEL-AUTHORING.md`, `docs/CURRICULUM.md`: update when the level format or the
  curriculum changes.
- `docs/STORY.md`: update when characters, places, running gags or glossary terms are added.
- `THIRD-PARTY-LICENSES.md`: add every hand-added third-party font, image, sound or copied code.

From ROADMAP M0.9 on, CI fails on pushes that change code or content without changing
`docs/STATUS.md`.

## License rule

The project is MIT licensed. Before adding any dependency, font, image, sound or copied code,
check its license against `license-policy.json` and
[ADR 0005](docs/decisions/0005-mit-license-and-dependency-allowlist.md). Anything not allowed
there (including GPL, AGPL, LGPL, MPL and CC-BY-SA) needs the user's approval first.
Non-commercial licenses (CC-BY-NC) are never allowed. Record hand-added third-party content in
`THIRD-PARTY-LICENSES.md`.

## Git

Reasons: [ADR 0027](docs/decisions/0027-work-directly-on-main.md).

- Work directly on `main`: no feature branches, no pull requests. Each work package ends with
  one or a few commits on `main`, pushed to `origin/main`.
- Commit messages: Conventional Commits in English (`feat: …`, `fix: …`, `docs: …`, `test: …`,
  `refactor: …`, `chore: …`).
- Run `npm run check` before every commit. Never commit a red state.
- You may commit, push to `main` and fix CI failures without asking. A red CI run on `main` is
  fixed before any new work.
- Ask the user before pushing a commit that changes `CLAUDE.md`, anything in `.claude/`,
  `.github/workflows/`, `license-policy.json` or an accepted decision record, or that deletes
  levels or story content, unless the user asked for exactly that change.
- Never weaken a check to make CI green: no skipped, focused or deleted tests, no lowered
  coverage target, no removed CI jobs, no relaxed lint rules, no changes to branch protection.
  Fix the cause or ask.
- Never force-push or rewrite published history on `main`.
- After every push, give the user a short German summary of what was pushed.
- For visual changes, show the user before/after screenshots before committing.
- Cloud sessions also push to `main`. Only if the environment cannot push to `main`, push to the
  session's branch, open a pull request with the screenshots and squash-merge it as soon as all
  checks are green.

## Tech stack

TypeScript (strict), React, Electron, Vite via electron-vite, electron-builder (NSIS installer
for Windows, AppImage for Linux), npm workspaces, Node.js LTS, zod, YAML, intl-messageformat,
Vitest, Testing Library, Playwright, axe-core, Stryker, ESLint, Prettier. Reasons:
[ADR 0003](docs/decisions/0003-tech-stack.md). Structure: `docs/ARCHITECTURE.md`.

## Commands

Commands are defined only as npm scripts in `package.json`. Existing:

- `npm run check`: format check, type check, lint, all tests with coverage, license check. Run
  it before every commit.
- `npm run format`: format all files with Prettier.
- Single steps of `check`: `npm run format:check`, `npm run typecheck`, `npm run lint`,
  `npm test` (without coverage), `npm run test:coverage`, `npm run check:licenses`.

Planned:

- `npm run dev`: start the game in development mode (M0.7).
- `npm run e2e`: end-to-end and screenshot tests (M0.7).
- `npm run package`: build the installer (M0.8).
- `npm run test:mutation`: mutation tests of the engine (before releases).

Update this section whenever a script is added.

## Code conventions

- TypeScript strict mode. No `any`, no non-null assertions (`!`), no `@ts-ignore`. Exhaustive
  `switch` over union types.
- `packages/engine` and `packages/gameplay` stay pure: no DOM, no Node APIs, no file system, no
  network, no real time, no `Math.random()`. Use the injected clock and random generator.
- Levels are data only (YAML). Never put code into a level; extend the engine vocabulary
  instead ([ADR 0010](docs/decisions/0010-levels-as-yaml-data.md),
  [ADR 0011](docs/decisions/0011-declarative-check-rules.md)).
- Check rules never depend on translated text or on the player's user name.
- Everything must work on Windows and Linux: no bash-only syntax in npm scripts (use Node
  scripts), no hard-coded path separators, LF line endings.
- File and folder names in kebab-case; React components in PascalCase.
- Path-specific rules load automatically from `.claude/rules/` when you work on matching files.

## Where to find what

| Need | File |
|---|---|
| Current state and next steps | `docs/STATUS.md` (imported above) |
| Milestones and work packages | `docs/ROADMAP.md` |
| Why something was decided | `docs/decisions/` |
| How the system is built | `docs/ARCHITECTURE.md` |
| Commands per chapter | `docs/CURRICULUM.md` |
| Level format | `docs/LEVEL-AUTHORING.md` |
| Story, characters, tone, glossary | `docs/STORY.md` |
| Contribution workflow | `CONTRIBUTING.md` |

## Skills

- `/next`: propose the next small work package and wait for the user's OK.
- `/wrap-up`: end-of-session check (only the user starts it).
- Planned: `/adr` (M0.11), `/new-level` (M2.8), `/playtest` (M3.17), `/release` (M5.5).
