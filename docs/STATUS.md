# Status

_Last updated: 2026-11-19_

## Recently completed

- M3.0e-1 Icon style: three icon sets with allowed licenses (Lucide, Phosphor, Carbon) and own
  drafts compared in a specimen page, a side panel mock-up and an enlarged 1x capture; the owner
  chose own icons. Rules for grid, size (one cell), stroke, corners, colour and labels in
  `DESIGN.md`; the 14 drafts are recorded in ADR 0086. M3.0e is split into the choice (e-1) and
  the icon files (e-2).
- M3.0d-2 Typography (built; the owner's Windows check is open): Inter 4.1 (variable),
  JetBrains Mono 2.304 (400, 700) and Barlow Condensed 1.422 (700) bundled as unchanged WOFF2
  files from the upstream releases in `apps/ui/src/fonts/` with their OFL texts, which
  electron-builder ships in `resources/licenses/fonts/`; font, weight and type scale tokens
  with line heights on quarter cells; styleguide sections; tests for faces, files, licenses,
  the scale and loading in the app (ADR 0085). CI green.
- M3.0d-1 Typeface choice: three candidates per role compared in a specimen page and a workplace
  mock-up with the real tokens; all nine are SIL OFL 1.1. The owner chose Barlow Condensed for
  tape, Inter for the interface and JetBrains Mono for the terminal (ADR 0084); `DESIGN.md` and
  `PRODUCT.md` name them. M3.0d is split into the choice (d-1) and the bundling (d-2).
- M3.0c Styleguide page: `apps/ui/styleguide.html` shows every token of `tokens.css` with a
  sample drawn by the real stylesheets, its value and note, plus the contrast pairs; new
  development-only workspace `apps/styleguide` serves it (`npm run styleguide`) and runs
  Playwright tests with axe-core in Playwright's Chromium (`npm run styleguide:test`), in their
  own CI job; tests guard that the app never imports or builds the styleguide (ADR 0083).
- M3.0b-2 Design tokens: `apps/ui/src/tokens.css` with semantic colour tokens, the terminal's
  character cell, spacing, radius, line widths, shadow and motion; ticket blue, mail violet and
  incident red lightened so that every text pair meets WCAG AA; contrast and stylesheet test
  (`design-tokens.test.ts`); `DESIGN.md` and its sidecar regenerated with `/impeccable document`
  (ADR 0082). impeccable works in cloud sessions.

## In progress

- M3.0d-2: the owner checks the bundled fonts on Windows; then the ROADMAP item is ticked.

## Next 3 steps

1. ROADMAP M3.0e-2: icon files, tests of the icon rules, styleguide section.
2. ROADMAP M3.0f-2: logo and tokens.
3. ROADMAP M3.1: app screens.

## Blockers and open questions

- The owner still has to check the bundled fonts on Windows (`npm run styleguide` and
  `npm run dev`), because Windows renders fonts slightly heavier than the Linux screenshots.
- The texts of the five prototype levels and the office world's host name `itdesk` were
  written as test content without the owner's review (the prototype's source is not in the
  repository, so levels 2 to 5 follow the titles in `docs/CURRICULUM.md`); the story workshop
  (M4) replaces them.
- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens (fibre
  orange is unchanged).
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
