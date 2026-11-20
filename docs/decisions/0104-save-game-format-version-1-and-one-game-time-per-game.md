# 0104. Save game format version 1 and one game time per game

- Status: Accepted
- Date: 2026-11-20
- Supersedes: [0099](0099-chapter-inbox-chapter-titles-in-the-ui-catalogs-and-a-terminal-per-ticket.md)
  (only the game time of a ticket opened for the first time)

## Context

ADR 0013 decided three save slots with autosave, safe writing and a versioned format with
migrations. Before the main process can store files (M3.7b) and the game can save and resume
(M3.7c), the format itself has to be fixed: which fields a slot keeps, how a file is read back,
how old files are converted and what happens with broken or newer files.

Two open questions from earlier records meet here. ADR 0099 let every opened ticket start its
own game clock at the game's start time and left it to M3.7 to decide how game time runs across
tickets. ADR 0013 lists XP, rank and achievements among a slot's data, but the framework for them
only comes with M3.12.

## Decision

- **Pure format module.** `packages/gameplay/src/save-game.ts` defines the format. It reads and
  writes text only; the main process stores it, and the UI passes the real times. Reading a save
  does not need the content.
- **Fields of version 1.** A save file is a JSON object with, in this order: `format`
  (`"penguin-ops-save"`), `version` (1), `playerName`, `userName`, `mode`, `gameTime`,
  `playTime`, `lastPlayed`, `currentTicket` and `tickets`. Each ticket the player opened is one
  entry with `level`, `solved`, an optional `checkpoint`, `hintsShown` and
  `reachedExtraGoals`. All times are whole milliseconds; `gameTime` is game time,
  `playTime` and `lastPlayed` are real time.
- **The checkpoint is a step ID**, the one `lastCompletedStep` returns, not a step count, so a
  step added to a level later does not move a saved checkpoint onto another step.
- **What is not saved.** The terminal (screen, history, world) and the ticket's messages are not
  saved: a ticket restarts at its checkpoint (ADR 0013), and the game rebuilds the messages of
  its completed steps and reached extra goals. Tips are not kept.
- **One game time per game.** A game has one game time. It starts at `GAME_START_TIME` and runs
  on across every ticket: a ticket the player opens starts at the game's current game time, not
  at the game's start time. This replaces the part of ADR 0099 that started every ticket at the
  game's start time; the game screen follows in M3.7c.
- **Writing.** `serializeSave` writes the fields in a fixed order, indented by two spaces, with a
  final line break, so the same save always gives the same text.
- **Reading.** `parseSave` never throws for a broken file. It returns the save and the file's
  version, or the first problem as a code: `not-json`, `not-a-save` (no object or another
  `format`), `too-new` (a newer game wrote it; the file is left alone) or `invalid` with the path
  and an English message for logs. The checks are strict: unknown fields, a player name that is
  not normalized, a user name that breaks the user name rules, a game time before the start,
  more than three hints, a ticket or extra goal listed twice and a current ticket that is not
  among the opened ones are all invalid. Names reserved by the content's worlds are checked when
  the game resumes, not when the file is read.
- **Migrations.** `SAVE_MIGRATIONS` holds one migration for each version before the current one.
  `parseSave` applies them one version at a time to the parsed JSON object and checks the result
  against the current schema. Every format change bumps `SAVE_FORMAT_VERSION`, adds a migration
  and stores an example save of the old version in `packages/gameplay/save-fixtures/`
  (`v<version>.json`, kept byte for byte, so Prettier skips the folder). Tests check that every
  version has a fixture and a migration, that every fixture reads, and that the current version's
  fixture is written back byte for byte.
- **XP, rank and achievements** are not in version 1. M3.12 adds them with version 2 and its
  migration.

## Alternatives considered

- **Keep a game clock per ticket:** switching between tickets would move the office's time back
  and forth, and file times of a later ticket could lie before those of an earlier one. One game
  time per game reads like one working day after another.
- **Save the terminal and the world of every ticket:** comfortable, but the world snapshot must
  stay compatible with levels that change in updates; ADR 0013 rejected it already.
- **Checkpoint as a step count:** shorter, but silently wrong when a level gains a step.
- **Lenient reading that ignores unknown fields:** would hide damaged files and lose data written
  by a newer game; the version check and strict fields make both visible.
- **Fields for XP, rank and achievements now:** they would be placeholders until M3.12 defines
  them; the first real migration is the better test of the migration path.
- **Fixtures formatted by Prettier:** the fixtures are data that an old game wrote; reformatting
  them would make them a different file.

## Consequences

- M3.7b stores the text atomically with a backup and writes a migrated save back in the current
  version; it can tell the player when a file is too new or broken.
- M3.7c builds the game from a save: it checks the levels, steps and extra goals against the
  content, starts tickets at the slot's game time and at their checkpoint, and rebuilds the
  messages. It also decides what to do with a level that an update removed.
- Every format change needs a migration and a fixture, which the tests enforce.
- The gameplay package depends on zod directly, and its tests read files with Vite's
  `import.meta.glob`.
