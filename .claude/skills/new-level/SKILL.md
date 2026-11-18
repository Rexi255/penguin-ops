---
name: new-level
description: Creates a new PenguinOps level as one folder with level.yaml, en.yaml and de.yaml, adds it to content/chapters.yaml and proves it complete and solvable with the content tests. Use when the user types /new-level or asks for a new level, ticket, incident or side ticket.
---

# New level

Create one level in `content/levels/<level-id>/` with exactly three files and prove it with
`npm run check`. The format is in `docs/LEVEL-AUTHORING.md`; the path rules in
`.claude/rules/content.md` load automatically. Talk to the user in German; the files are
English, except `de.yaml`.

## 1. Clarify the level

Read `docs/CURRICULUM.md`, `docs/STORY.md` and `content/chapters.yaml`, then settle with the
user (ask in German if anything is open, do not guess):

- **Chapter and position:** which chapter, and where in its level list.
- **Kind:** `main`, `review`, `side` or `incident` (ADR 0017).
- **Commands:** what the level teaches (`teaches`). Every command a player needs, in the
  ticket, the hints and the reference solutions, comes from this chapter or an earlier one.
- **Ticket idea:** who asks for what, in one or two sentences, in the tone of `docs/STORY.md`.
- **Level ID:** kebab-case, describing the task (`printer-floor2`, `disk-full`). It is stored
  in save files and never changes, so check that it is not used yet
  (`content/levels/<level-id>/` must not exist).

## 2. Design the data (`level.yaml`)

Start from the closest existing level: `first-steps` (single goal, `cwd_is`), `printer-floor2`
(output rule, prose file), `project-folders` and `switch-backup` (steps, tips, extra goals),
`disk-full` (incident, `not` rules).

- **World:** the standard world `office` unless the level needs another base world. Put the
  level's files into `start.files`: technical content (configs, logs, data) literal and
  English, prose written by people (`{ text: <key> }`) translated in the catalogs.
- **Goal:** check the result in the world (`dir_exists`, `same_content`, `not: { exists }`),
  not the command typed, so that every sensible way solves the ticket. Output rules
  (`output_contains`) only for tickets about finding information, and only on technical,
  untranslated text. Rules never depend on translated text or on the player's name.
- **Steps** instead of `goal` when the ticket has stages the player should see; the first
  reference solution must pass through every step in order (checkpoints replay it).
- **Tips** for typical mistakes (wrong folder, `mv` instead of `cp`, a directory given to
  `cat`). A tip must not fire on any reference solution, and it must not fire at the start.
- **Extra goals** (optional) for a sensible bonus the ticket mentions; describe each in the
  catalogs under `extra_goals.<id>`.
- **Reference solutions:** the shortest one first (checkpoints replay it), then alternatives
  that should also work: relative and absolute paths, `cd` first, options such as `mkdir -p`.
- **No failure:** the game has no losing. A mistake must never make the ticket unsolvable; if
  a mistake can destroy what the goal needs, change the goal or add a tip that shows the way
  back.

## 3. Write the texts (`en.yaml`, `de.yaml`)

- Exactly the same keys in both: `title`, `ticket`, three `hints` (a tip, a concrete tip, the
  solution), `explanation` (`text`, optional `options` and `example`), every text key that
  `level.yaml` uses, and `extra_goals.<id>` for every extra goal.
- Short ticket texts: the terminal is the main stage. German uses "du"; use the glossary of
  `docs/STORY.md`. `options` and `example` are commands and identical in both languages.
- Markup: `code`, **bold**, lists, paragraphs; no HTML, no placeholders in level texts.
- Fictional names only, private IP ranges, no real companies, brands, people, mails or phone
  numbers.

## 4. Register and prove it

1. Add the level ID to its chapter in `content/chapters.yaml`.
2. Run `npx vitest run --project content-tests`. It loads the content with every check and
   plays every reference solution in English, German and every further language with the
   players `alice` and `max-2`. Fix every problem it reports; never weaken a rule or delete a
   solution only to make it pass.
3. Prove that the goal needs the whole solution: temporarily delete the last command line of
   the first reference solution (replace a solution's only line with `pwd`) and run the
   content tests. They must report "the ticket is not
   solved after the solution" (for a multi-step ticket: the last step). If they do not, that
   line is not needed or the goal is too loose: fix it. Restore the line.
4. Run `npm run check`.

## 5. Show it and finish

- Show the user, in German: the ticket text (German), what the goal checks, the tips and the
  reference solutions. Ask for an OK of the texts before committing; offer changes.
- Documentation duty in the same commit: `docs/STATUS.md`, `docs/ROADMAP.md` if a work package
  is ticked, `docs/CURRICULUM.md` if the level adds commands to a chapter, `docs/STORY.md` for
  new characters, places, running gags or glossary terms, `CHANGELOG.md` once levels are
  player-visible.
- Commit on `main` with `feat(content): add the level <level-id>` and push (Git rules in
  `CLAUDE.md`).
