# Status

_Last updated: 2026-11-27_

## Recently completed

- M3.10 UI sounds: four sounds generated with Web Audio from recipes of tones (click,
  notification, extra goal, solved), played at `(master × effects)²` on a context that opens with
  the first sound. Buttons, choices and sliders click through a listener on the document; the game
  screen plays the biggest moment of every change in the open ticket. The settings have a Sound
  group with the master, music and effects sliders; the music slider says that music comes later.
  The terminal's bell stays silent (ADR 0113).
- M3.9b Effects (M3.9 complete): glow and scanlines are effect tokens in tokens.css that the
  root's `data-glow` and `data-scanlines` turn on and "reduce motion" turns off; only the
  terminal reads them. The glow lights only the terminal's text colour, checked in every scheme
  against a measured bound that the styleguide's browser test measures; the scanlines' stripes are
  the new colour token `--color-terminal-scanline` with contrast pairs. The settings offer both
  switches; the styleguide has an Effects section (ADR 0112).
- M3.9a Colour schemes: Retro CRT, Solarized (dark) and High contrast are each one
  `:root[data-color-scheme]` rule in tokens.css that redefines every colour token; the design
  token test checks every scheme's contrast pairs (7:1 text and visible dividers in High
  contrast). The settings offer the four schemes; the styleguide has a scheme switch. Solarized's
  accents are lightened to meet WCAG AA (ADR 0111).
- M3.8c Font size and reduce motion (M3.8 complete): a font size slider from 80 to 200 percent
  sets the root font size, so the whole interface scales; the game screen's side panel takes at
  most 45 % of the width. Reduce motion (like the system, on, off) is the root's
  `data-reduce-motion`, which tokens.css reads. The volume sliders move to M3.10, the colour
  scheme and effects to M3.9, so that the settings offer only what works (ADR 0110).
- M3.8b Settings screen: Settings in the main menu (a screen) and the pause menu (a dialog in its
  place) with the language and fullscreen; every change applies at once and is written to the
  settings file; a new language during a game asks first, then saves the game and starts it again
  from the checkpoints. The window starts hidden and appears in the mode of the setting with the
  renderer's first request; F11 toggles fullscreen in the main process, which reports it and the
  system's changes to the renderer (preload API `display`, ADR 0109).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M3.11: mail panel with toasts and the handbook panel.
2. ROADMAP M3.12: ranks, XP and achievements framework.
3. ROADMAP M3.13: sandbox free play unlock rules.

## Blockers and open questions

- The owner has not heard the UI sounds yet (Claude cannot listen); their recipes in
  `apps/ui/src/sounds/ui-sounds.ts` may need tuning after the first game on Windows (ADR 0113).
- The start, save slot, new game, settings and game screens, the pause menu, the slot menu and
  dialogs, the terminal, the ticket panel and the inbox have no screenshot tests yet; the
  screenshot test setup for all screens, languages and the four colour schemes (and the two
  effects, ADR 0112) is ROADMAP M3.15.
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
  with `STYLEGUIDE_CHROMIUM_PATH` set to the preinstalled Chromium. Playwright's keyboard does
  not reach Electron's `before-input-event`, so the end-to-end tests press F11 with
  `sendInputEvent`.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- A hint asked for with the game command `hint` is announced twice to screen readers, by the
  terminal's log and the ticket panel (ADR 0103); M3.14 decides which stays quiet.
- At a large font size in a small window the game screen is cramped (at 200 % in 960 × 600 px
  the terminal has about 27 columns); a layout for large font sizes belongs to M3.14 (ADR 0110).
- Electron's default application menu stays, hidden: Ctrl+R reloads the page and Ctrl+Plus or
  Ctrl+Minus zoom in the game (ROADMAP ideas). Whether the game keeps it needs a decision.
- A save whose user name a later world reserves is locked (ADR 0106); the player can only delete
  it or import over it. A way to rename the user is an idea for later. The reserved Debian
  accounts are verified in M6.
- Some details of `ls`, `clear`, `history`, `cat`, `head`, `tail`, `touch`, `rm`, `cp`, `mv` and
  `grep` could not be checked against a real Debian 13 (tests marked `@differential`, ADR 0054
  to ADR 0064); grep 3.11's own source could not be fetched, so grep follows an earlier 3.x
  and its NEWS. Tab completion and history navigation were measured on bash 5.2.21, not on
  Debian 13's 5.2.37 (ADR 0065, ADR 0066). M6 verifies them.
