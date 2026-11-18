# Status

_Last updated: 2026-11-18_

## Recently completed

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
- M2.4a Completeness checks (`catalog-completeness.ts`): `loadContent` reports texts and extra
  goal descriptions that English or German lack, unused keys in any catalog, a text key used as
  file content and as a message, explanation commands that differ from English, UI keys
  missing in German or unknown to English, and UI placeholders that differ from English
  (ADR 0075). M2.4 is split: the content test over `content/` with the reference solutions
  (M2.4b) needs the level session of M2.5.
- M2.3d English fallback (`language-fallback.ts`): `levelTexts` and `uiTexts` give every text in
  a language as `{ language, source }`; further languages fall back to English text by text
  (hints and option table as a whole), each text formatted in its own language;
  `missingTexts(content)` lists what falls back, not as errors (ADR 0074). M2.3 is complete.

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M2.4b: content test of `content/` with the reference solutions.
2. ROADMAP M2.6: port the five prototype levels.
3. ROADMAP M2.7: developer mode API.

The owner confirmed the order M2.5, M2.4b, M2.6.

## Blockers and open questions

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
