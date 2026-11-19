# Status

_Last updated: 2026-11-19_

## Recently completed

- M3.1b Save slot screen: Play in the main menu opens a screen with three empty save slots
  (not controls until M3.2) and Back; Back and Esc return to the start screen. The app root
  switches screens with React state and every screen sets the keyboard focus on its first
  control (ADR 0091). Component tests of both screens and the navigation; end-to-end tests in
  both languages with axe-core, which now lives in a shared helper.
- M3.0d-2 Typography: the owner checked the bundled fonts, the icons and the logo on Windows
  at 100 % scaling (styleguide and start screen) and found no problems; M3.0 is complete.
- M3.1a Start screen: the logo as the heading, a main menu with Quit (keyboard focus on it,
  Enter quits) and the version; the renderer bundles `content/` at build time and loads it with
  every check, the UI texts follow the system's language (German for `de*`, else English) and a
  test checks that both catalogs hold exactly the keys and placeholders the UI uses; the desktop
  API has `quit()`; component tests with Testing Library in jsdom; end-to-end tests in both
  languages with axe-core (ADR 0090). The Enter test no longer fails when the app quits before
  Playwright gets the answer to the key press.
- M3.0f-2b Logo files: the five colour SVGs and the favicon SVG recoloured to ADR 0088; all 14
  raster files drawn from the SVGs by `npm run brand:rasters` (ADR 0089, partly superseding
  ADR 0040). The styleguide has a Logo section.
- M3.0f-2a Logo colours: the logo compared in three colour variants (unchanged, interface
  tokens, label tape tokens) on the four surface tokens and two light backgrounds at 2x and 1x;
  the owner chose the interface tokens: black `#0f1114` (`surface-terminal`), white `#e8e6e1`
  (`text`), orange `#e0701a` (`player`) unchanged; mono variants stay pure black and white
  (ADR 0088, partly superseding ADR 0040). M3.0f-2 is split into the choice (f-2a) and the
  regenerated files (f-2b).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M3.1c: game screen frame and pause menu.
2. ROADMAP M3.2: new game flow.
3. ROADMAP M3.3: terminal component.

## Blockers and open questions

- The start and save slot screens have no screenshot tests yet; the screenshot test setup for all screens,
  languages and colour schemes is ROADMAP M3.15.
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
- Some details of `ls`, `clear`, `history`, `cat`, `head`, `tail`, `touch`, `rm`, `cp`, `mv` and
  `grep` could not be checked against a real Debian 13 (tests marked `@differential`, ADR 0054
  to ADR 0064); grep 3.11's own source could not be fetched, so grep follows an earlier 3.x
  and its NEWS. Tab completion and history navigation were measured on bash 5.2.21, not on
  Debian 13's 5.2.37 (ADR 0065, ADR 0066). M6 verifies them.
