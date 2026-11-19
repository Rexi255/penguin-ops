# Status

_Last updated: 2026-11-19_

## Recently completed

- M3.0f-2b Logo files: the five colour SVGs and the favicon SVG recoloured to ADR 0088; all 14
  raster files (app icons, ICOs, Apple touch icon, social preview) drawn from the SVGs by the new
  `npm run brand:rasters` in Playwright's Chromium, following `scripts/brand/raster-plan.ts`;
  the brand test decodes every PNG and ICO image and checks size, background and pixel colours
  (ADR 0089, partly superseding ADR 0040). The styleguide has a Logo section (logo on the
  surfaces and the white tape, signet at 16 to 64 px).
- M3.0f-2a Logo colours: the logo compared in three colour variants (unchanged, interface
  tokens, label tape tokens) on the four surface tokens and two light backgrounds at 2x and 1x;
  the owner chose the interface tokens: black `#0f1114` (`surface-terminal`), white `#e8e6e1`
  (`text`), orange `#e0701a` (`player`) unchanged; mono variants stay pure black and white
  (ADR 0088, partly superseding ADR 0040). M3.0f-2 is split into the choice (f-2a) and the
  regenerated files (f-2b).
- M3.0e-2 Icons: the 14 own icons as SVG files in `apps/ui/src/icons/` in a fixed form, drawn
  by the `Icon` component through a strict reader; tests check every file for whole-pixel
  coordinates, the margin with caps and miter tips, butt caps only on dots, and the component's
  markup; styleguide section with side panel tabs, cable colours and 3x views on the grid. Four
  drafts were corrected within the rules (ticket, incident, server, mail; ADR 0087).
- M3.0d-2 Typography (built; the owner's Windows check is open): Inter 4.1 (variable),
  JetBrains Mono 2.304 (400, 700) and Barlow Condensed 1.422 (700) bundled as unchanged WOFF2
  files from the upstream releases in `apps/ui/src/fonts/` with their OFL texts, which
  electron-builder ships in `resources/licenses/fonts/`; font, weight and type scale tokens
  with line heights on quarter cells; styleguide sections; tests for faces, files, licenses,
  the scale and loading in the app (ADR 0085). CI green.

## In progress

- M3.0d-2: the owner checks the bundled fonts on Windows; then the ROADMAP item is ticked.

## Next 3 steps

1. ROADMAP M3.1: app screens (start screen with the logo).
2. ROADMAP M3.2: new game flow.
3. ROADMAP M3.3: terminal component.

## Blockers and open questions

- The owner still has to check the bundled fonts on Windows (`npm run styleguide` and
  `npm run dev`), because Windows renders fonts slightly heavier than the Linux screenshots.
  The same check covers the icons and the logo in the styleguide at 100 % scaling. M3.0 is
  complete once M3.0d-2 is ticked.
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
