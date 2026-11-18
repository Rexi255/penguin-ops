# Status

_Last updated: 2026-11-18_

## Recently completed

- M2.7 Developer mode API (`developer-mode.ts`): `levelSetup` (also used by the content
  test), `startAtStep`, `autoPlay` of a reference solution and `inspectRules` with the state of
  every rule, step, tip and extra goal; unknown levels, steps and solutions throw a
  `DeveloperModeError` (ADR 0079). The UI follows in M3.16.
- M2.6 Prototype levels 2 to 5 as test content: `printer-floor2` (`cat`, chapter
  `left-behind`), `project-folders` (`mkdir`, `touch`, two steps, extra goal),
  `switch-backup` (`cp`, `mv`, two steps, extra goal) and the incident `disk-full` (`rm`) in
  chapter `tidying-up`; the content test plays all their reference solutions.
- M2.4b Content test (`tests/content/`, `reference-solutions.ts`): `npm test` reads `content/`,
  loads it and plays every reference solution in every language with the players `alice` and
  `max-2` (start events, incomplete or unsimulated command lines, tips, unsolved tickets,
  checkpoints); first content: world `office` (host `itdesk`, provisional), chapter
  `first-day`, prototype level 1 as `first-steps` (ADR 0078). M2.4 is complete.
- M2.5b–d Level session (`level-world.ts`, `level-session.ts`): `startLevel` builds the
  level's world with the player's account and starts in `start.cwd`; `runInput` handles
  incomplete input, bash syntax errors (exit status 2) and unsupported syntax, records the
  history and evaluates the goal or the steps in order, extra goals once, tips once while
  unsolved; checkpoints resume by replaying the first reference solution (ADR 0077). M2.5 is
  complete.
- M2.5a Base worlds (`world-schema.ts`, `file-entries-schema.ts`): `content/worlds/<id>.yaml`
  with hosts, groups, users and literal files (first host is the default host, standard world
  `office`); the game adds the player's account (UID/GID 1000) to every host; `loadContent`
  checks a level's world, start host and start file owners; `world.schema.json` for VS Code
  (ADR 0076).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M2.8: `/new-level` skill.
2. ROADMAP M3.0a: set up the impeccable design skill.
3. ROADMAP M3.0b: visual tone and design tokens.

## Blockers and open questions

- `CLAUDE.md` still describes `npm run schemas:update` as regenerating only
  `level.schema.json`; it now also writes `world.schema.json`. Changing `CLAUDE.md` waits
  for the owner's OK.
- The texts of the five prototype levels and the office world's host name `itdesk` were
  written as test content without the owner's review (the prototype's source is not in the
  repository, so levels 2 to 5 follow the titles in `docs/CURRICULUM.md`); the story workshop
  (M4) replaces them.
- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- Some details of `ls`, `clear`, `history`, `cat`, `head`, `tail`, `touch`, `rm`, `cp`, `mv` and
  `grep` could not be checked against a real Debian 13 (tests marked `@differential`, ADR 0054
  to ADR 0064); grep 3.11's own source could not be fetched, so grep follows an earlier 3.x
  and its NEWS. Tab completion and history navigation were measured on bash 5.2.21, not on
  Debian 13's 5.2.37 (ADR 0065, ADR 0066). M6 verifies them.
