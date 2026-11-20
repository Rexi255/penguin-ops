# Status

_Last updated: 2026-11-20_

## Recently completed

- M3.5c Chapter inbox: "Back to the inbox" in the Tickets tab lists every open chapter (title,
  "1 of 3 solved") with its tickets as rows (New, In progress, Solved; the current one framed in
  fibre orange). Story mode opens a chapter when the ones before it are solved, Sandbox opens all
  (pure model `packages/gameplay/src/inbox.ts`). A solved ticket offers the next one and names a
  chapter it opened; every opened ticket keeps its terminal and progress. Chapter titles are UI
  texts `chapters.<id>`, checked by the content loader; the top bar shows the chapter (ADR 0099).
- M3.5b Hints and explanation: F1 or the footer's "F1 Hint" shows the ticket's next hint (tip,
  concrete tip, solution) in a "Hints" section of the ticket panel, in its own polite live region,
  and brings the Tickets tab to the front while the focus stays in the terminal; hints stay after
  solving. A solved ticket shows "What you learned" with the explanation, its variants as a
  definition list and a command to try. The hint count is part of the ticket's progress, and the
  game screen keeps the chosen side panel tab (ADR 0098).
- M3.5a Ticket panel, part 1: the Tickets tab shows the ticket being played (title, text with
  paragraphs and lists, the steps as tape segments with "Step 1 of 2", "Solved") and below it
  the step messages and tips the game says, in a polite live region; the top bar shows the
  ticket's title and its step or state. The terminal reports the game events of every input to
  the game screen. Level texts now write each paragraph on one line (ADR 0097, partly
  superseding ADR 0096: Shift+Tab from the terminal reaches the ticket first).
- M3.4 Workplace layout: the side panel has the tabs Tickets, Mail and Handbook after the
  WAI-ARIA tabs pattern (arrow keys, Home and End, automatic activation, only the chosen tab in
  the tab order), each with its icon and the cable colour of its kind of work on the chosen tab;
  mail and handbook show their empty states, the tickets panel waits for M3.5. The footer shows
  "Tab Complete" as text and "Esc Menu" as a button; the top bar stays empty until M3.5 and
  M3.12 (ADR 0096). Shift+Tab leaves the terminal for the tabs.
- M3.3 Terminal component: the game screen plays the first level in a terminal that behaves
  like bash 5.2 on Debian 13: Debian's green and blue colour prompt (engine `prompt.ts`),
  output with partial lines, continuation lines behind `> `, game notices with one general text
  until M3.6, Up/Down history, Tab completion with the list on a second Tab and readline's
  question from 100 matches, Ctrl+C (`^C`, exit status 130), Ctrl+L, Ctrl+A/E, Home/End,
  Shift+PageUp/Down and 10,000 lines of scrollback. A pure terminal model with one function per
  key; typed text comes from a transparent text field, so AltGr and dead keys work; unsimulated
  readline Ctrl keys are swallowed (ADR 0095). Model, component and end-to-end tests in both
  languages with axe-core.

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M3.5d: extra goals in the ticket panel.
2. ROADMAP M3.6: game commands `help` and `hint`; engine notices in the player's language.
3. ROADMAP M3.7: save system (three slots, autosave, versioned format).

## Blockers and open questions

- The start, save slot, new game and game screens, the pause menu, the terminal, the ticket
  panel and the inbox have no screenshot tests yet; the screenshot test setup for all screens,
  languages and colour schemes is ROADMAP M3.15.
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
- The game lives only in the game screen: the started and solved tickets, each ticket's messages
  and hint count and its terminal. The save system (M3.7) has to keep or rebuild them when it
  resumes a ticket at a checkpoint, and decide how game time runs across tickets, which each
  start at the game's start time now (ADR 0097, ADR 0098, ADR 0099).
- A later world that adds an account with a name an existing save already uses would collide
  with that save (ADR 0093); M3.7 or M4 decides how to handle it. The reserved Debian accounts
  are verified in M6.
- Some details of `ls`, `clear`, `history`, `cat`, `head`, `tail`, `touch`, `rm`, `cp`, `mv` and
  `grep` could not be checked against a real Debian 13 (tests marked `@differential`, ADR 0054
  to ADR 0064); grep 3.11's own source could not be fetched, so grep follows an earlier 3.x
  and its NEWS. Tab completion and history navigation were measured on bash 5.2.21, not on
  Debian 13's 5.2.37 (ADR 0065, ADR 0066). M6 verifies them.
