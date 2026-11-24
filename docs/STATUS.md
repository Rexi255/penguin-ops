# Status

_Last updated: 2026-11-24_

## Recently completed

- M3.8a Settings model and file: `packages/gameplay/src/settings.ts` defines version 1 of the
  global settings (language, volumes, fullscreen, font size, colour scheme, effects, reduce
  motion) with defaults and reads a file setting by setting, so that a broken file never stops
  the game; the main process stores `<userData>/settings.json` atomically through the preload API
  `settings`, which the end-to-end tests check in the preload API inventory too; the game takes
  its language from the settings (ADR 0108).
- M3.7d Export and import (M3.7 complete): the slot menu offers Export for a game, Import for
  every slot and Delete; the main process shows the system's file dialogs with the texts the
  renderer passes and writes or reads the file; the renderer refuses a file that is no playable
  save with a message and asks before an import replaces a game (ADR 0107).
- M3.7c Saving and resuming: the slots are read at start (backup restored, migrated saves written
  again, damaged, too new or taken user names locked); every save is fitted to the content and
  resumed at its tickets' checkpoints with one game time; autosave on a new game, every progress
  change, the main menu and the window's close (the main process waits for the page, at most
  5 s); the slot shows solved tickets, play time and last played; a menu button per slot with
  Delete and a confirmation; a failed save shows an alert in the footer (ADR 0106).
- M3.7b Save files: the main process stores each slot's save as a text in
  `<userData>/saves/slot-N.json`, written atomically (temporary file, flushed, renamed) with the
  replaced save as `slot-N.backup.json`; restore, delete, one operation per slot at a time and
  rename retries for Windows. The preload API `saves` validates slot and size in the main
  process; the renderer parses the texts. End-to-end tests run with an empty user data folder of
  their own (ADR 0105).
- M3.7a Save game format: `packages/gameplay/src/save-game.ts` defines version 1 of a save slot's
  file (name, user name, mode, one game time for the whole game, play time, last played, current
  ticket, and per opened ticket solved, checkpoint step, hints shown and extra goals), writes it
  as JSON in a fixed order and reads it back with problem codes (`not-json`, `not-a-save`,
  `too-new`, `invalid`). Migrations run one version at a time; example saves of every version are
  stored byte for byte and tested (ADR 0104, partly superseding ADR 0099).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M3.8b: settings screen with language (restarts the ticket) and fullscreen (F11).
2. ROADMAP M3.8c: font size, reduce motion, volumes, colour scheme and effects in the settings.
3. ROADMAP M3.9: colour schemes and effects.

## Blockers and open questions

- The start, save slot, new game and game screens, the pause menu, the slot menu and dialogs,
  the terminal, the ticket panel and the inbox have no screenshot tests yet; the screenshot test
  setup for all screens, languages and colour schemes is ROADMAP M3.15.
- The texts of the five prototype levels, the three chapter titles and the office world's host
  name `itdesk` were written as test content without the owner's review (the prototype's source
  is not in the repository, so levels 2 to 5 follow the titles in `docs/CURRICULUM.md`); the
  story workshop (M4) replaces them.
- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- Electron does not start in the cloud container (the end-to-end tests hang there); cloud
  sessions take UI screenshots of the built renderer in Playwright's Chromium with a stub of the
  desktop API. CI still runs the real end-to-end tests. The styleguide tests run in the cloud
  with `STYLEGUIDE_CHROMIUM_PATH` set to the preinstalled Chromium.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- A hint asked for with the game command `hint` is announced twice to screen readers, by the
  terminal's log and the ticket panel (ADR 0103); M3.14 decides which stays quiet.
- The window does not know the fullscreen setting yet: the main process cannot parse the
  settings (ADR 0108), so M3.8b decides how the window learns it before or after it shows.
- A save whose user name a later world reserves is locked (ADR 0106); the player can only delete
  it or import over it. A way to rename the user is an idea for later. The reserved Debian
  accounts are verified in M6.
- Some details of `ls`, `clear`, `history`, `cat`, `head`, `tail`, `touch`, `rm`, `cp`, `mv` and
  `grep` could not be checked against a real Debian 13 (tests marked `@differential`, ADR 0054
  to ADR 0064); grep 3.11's own source could not be fetched, so grep follows an earlier 3.x
  and its NEWS. Tab completion and history navigation were measured on bash 5.2.21, not on
  Debian 13's 5.2.37 (ADR 0065, ADR 0066). M6 verifies them.
