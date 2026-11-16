# 0013. Save games: three slots, autosave, safe file handling

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

A real game needs reliable saving. The prototype only had an export code because a browser
artifact cannot store files. Several people might play on one PC, and players may want to
start over without losing progress. A crash while saving must never destroy a save.

## Decision

- **Three save slots.** Each slot stores its game mode (Story or Sandbox, ADR 0017), the
  player's name and Linux user name (ADR 0019), progress, XP, rank, achievements and
  metadata shown on the slot screen (progress, rank, play time, last played).
- **Settings are global**, not per slot: language, volumes, fullscreen, font size, colour
  scheme, effects, reduce motion.
- **Autosave** after every solved ticket, after every completed step of a multi-step ticket,
  and on exit.
- **Quitting in the middle of a ticket:** progress is kept; the current ticket restarts on the
  next start. Multi-step tickets resume at the last completed step (checkpoint).
- **Export and import** per slot as a file (backup, moving to another PC).
- **Location:** Electron's per-user data folder (on Windows under `%APPDATA%`).
- **Safe writing:** write to a temporary file, then rename (atomic); keep the last good
  version as a backup; every save file has a format version, and migrations convert old
  saves. Migrations are covered by tests with stored example saves.

## Alternatives considered

- **One save with autosave:** simplest, but no second run without exporting.
- **Named profiles:** more UI for little benefit for a mostly single-player setup.
- **Exact resume inside a ticket (full world snapshot):** comfortable, but snapshots must stay
  compatible with changed levels after updates; much more complex and error-prone.

## Consequences

- One slot screen and per-slot files are needed (about one or two extra work packages, cheap
  because planned from the start).
- Save format changes always need a migration and a test.
