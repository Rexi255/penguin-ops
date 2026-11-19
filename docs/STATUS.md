# Status

_Last updated: 2026-11-20_

## Recently completed

- M3.3 Terminal component: the game screen plays the first level in a terminal that behaves
  like bash 5.2 on Debian 13: Debian's green and blue colour prompt (engine `prompt.ts`),
  output with partial lines, continuation lines behind `> `, game notices with one general text
  until M3.6, Up/Down history, Tab completion with the list on a second Tab and readline's
  question from 100 matches, Ctrl+C (`^C`, exit status 130), Ctrl+L, Ctrl+A/E, Home/End,
  Shift+PageUp/Down and 10,000 lines of scrollback. A pure terminal model with one function per
  key; typed text comes from a transparent text field, so AltGr and dead keys work; unsimulated
  readline Ctrl keys are swallowed (ADR 0095). Model, component and end-to-end tests in both
  languages with axe-core.
- M3.2b New game screen (M3.2 complete): an empty slot opens "New game" with the player's name,
  the Linux user name (derived while typing until the player edits it), a catalog text for
  every problem code in a live region, and the mode as two cards, Career (Story, the default)
  and Sandbox; Start fills the slot in memory (until M3.7) and opens the game (ADR 0094).
- M3.2a User name logic: `deriveUserName` turns the player's whole name into a Linux user name
  ("Jörg Müller" → `joerg-mueller`; umlauts transliterated, accents and apostrophes dropped,
  empty without a Latin letter), `checkUserName` returns the first problem as a code, and
  `reservedUserNames` holds Debian's system accounts and every account of the base worlds
  (ADR 0093). `isValidPlayerName` uses the same check.
- M3.1c Game screen and pause menu (M3.1 complete): an empty slot is now a button ("Slot 1 New
  game", first slot focused) that opens the game screen, the workplace frame as a CSS grid (top
  bar, side panel, terminal area, footer with an "Esc Menu" key hint button). Esc opens a modal
  pause menu (Continue, Main menu) over the inert game; Esc or Continue closes it and returns the
  focus (ADR 0092, partly superseding ADR 0091).
- M3.0d-2 Typography: the owner checked the bundled fonts, the icons and the logo on Windows
  at 100 % scaling (styleguide and start screen) and found no problems; M3.0 is complete.

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M3.4: workplace layout (top bar, side panel tabs, footer key hints).
2. ROADMAP M3.5: ticket panel.
3. ROADMAP M3.6: game commands `help` and `hint`; engine notices in the player's language.

## Blockers and open questions

- The start, save slot, new game and game screens, the pause menu and the terminal have no
  screenshot tests yet; the screenshot test setup for all screens, languages and colour schemes
  is ROADMAP M3.15.
- The texts of the five prototype levels and the office world's host name `itdesk` were
  written as test content without the owner's review (the prototype's source is not in the
  repository, so levels 2 to 5 follow the titles in `docs/CURRICULUM.md`); the story workshop
  (M4) replaces them.
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
- A later world that adds an account with a name an existing save already uses would collide
  with that save (ADR 0093); M3.7 or M4 decides how to handle it. The reserved Debian accounts
  are verified in M6.
- Some details of `ls`, `clear`, `history`, `cat`, `head`, `tail`, `touch`, `rm`, `cp`, `mv` and
  `grep` could not be checked against a real Debian 13 (tests marked `@differential`, ADR 0054
  to ADR 0064); grep 3.11's own source could not be fetched, so grep follows an earlier 3.x
  and its NEWS. Tab completion and history navigation were measured on bash 5.2.21, not on
  Debian 13's 5.2.37 (ADR 0065, ADR 0066). M6 verifies them.
