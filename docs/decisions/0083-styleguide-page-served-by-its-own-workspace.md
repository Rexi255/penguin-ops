# 0083. Styleguide page served by its own workspace

- Status: Accepted
- Date: 2026-11-19
- Supersedes: –

## Context

ROADMAP M3.0c asks for a styleguide page outside the packaged app that renders all design tokens
of ADR 0082 with the real styles, opened by an npm script and covered by a Playwright test with an
axe check. Typography (M3.0d), the icon style (M3.0e) and the logo (M3.0f-2) are shown there next.

Constraints:

- The page must use the UI's own stylesheets and, later, its components, which live in `apps/ui`
  and are not exported: the package boundary rules (ADR 0006) allow imports of a workspace only
  through its entry point, and `apps/ui` exports only the types of the preload contract.
- `apps/ui` must not use Node APIs, tests included (ADR 0030). A development server
  configuration and a Playwright test need them (paths, reading `tokens.css`, injecting axe-core).
- The desktop end-to-end tests drive Electron's Chromium; Electron does not start in cloud
  sessions, and the styleguide is a web page, not part of the app.
- axe-core is approved as a development-only MPL-2.0 exception in `license-policy.json`.
  `@axe-core/playwright` is MPL-2.0 too and has no exception.

## Decision

- **The page lives in `apps/ui`:** `apps/ui/styleguide.html` and `apps/ui/src/styleguide/`
  (entry `main.tsx`, the page `styleguide.tsx`, its layout `styleguide.css` and the token catalog
  `token-catalog.ts`). It imports `tokens.css` and `styles.css` like the app does, so it shows the
  real styles, and it can import UI components without a new export.
- **The page reads the tokens from `tokens.css` itself** (with a `?raw` import and the existing
  `css-rules.ts` reader) and sorts them into sections by name prefix. A token that fits no section
  is shown under "Unsorted tokens" instead of being hidden, and a unit test fails while the real
  stylesheet has one. Each token shows its value, the note written next to it in `tokens.css` and a
  sample drawn with the token: swatches, measured lengths, radius, line widths, the shadow, the
  printing tape strip, font samples and the terminal text on the character cell grid. The
  contrast pairs of ADR 0082 are listed with their measured ratio.
- **Texts are English and not translated:** the page is for the people who build the game, not
  for players, so the rule that player-facing texts come from `content/ui/` does not apply.
- **A new workspace `apps/styleguide` serves and tests it:** its `vite.config.ts` uses `apps/ui`
  as root, its `playwright.config.ts` starts that server and runs `e2e/styleguide.spec.ts` in
  Playwright's own Chromium. The workspace may use Node APIs and imports no other workspace
  (ESLint boundary entry). `npm run styleguide` opens the page with hot reload;
  `npm run styleguide:test` runs the browser tests.
- **axe-core is injected directly** from `axe-core/axe.min.js` with `page.addScriptTag`, not
  through `@axe-core/playwright`, so no new license exception is needed. The tests run the rule
  sets `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `best-practice` at desktop width
  and at 360 px, and expect no violations.
- **The browser tests also check** that every custom property of `tokens.css` (read with Node,
  independent of the page's reader) is shown with its value, that every colour swatch is drawn in
  the token's colour, that every contrast pair passes, that lengths are measured as expected, that
  the focus ring appears on keyboard focus, that the tape prints in 480 ms and at once with reduce
  motion, and that the page loads without console errors.
- **The styleguide never reaches the app:** the app's renderer build reads only
  `apps/ui/index.html` (`apps/desktop/electron.vite.config.test.ts`), and no app source outside
  `src/styleguide/` imports from it (`apps/ui/src/styleguide/styleguide-isolation.test.ts`).
  `styleguide.css` follows the token rules of ADR 0082 and is checked by the design token test.
- **CI runs the browser tests in their own job** ("Styleguide (browser tests)", Linux), which
  installs Playwright's Chromium. A failure there is visible on its own and does not hide or delay
  the Electron end-to-end tests. Machines that cannot download the browser can point
  `STYLEGUIDE_CHROMIUM_PATH` at an installed Chromium.

## Alternatives considered

- **Everything in `apps/ui`, with tooling files allowed to use Node:** fewer folders, but it would
  loosen the boundary rule of `apps/ui` and need a second kind of TypeScript project there.
- **The page code in `apps/styleguide`:** it would need deep imports of the UI's stylesheets and
  components, which the boundary rules forbid, or a public export of UI internals.
- **Serving the page from the app's development server (`npm run dev`):** the page would sit next
  to the app's build configuration, and its tests would depend on Electron, which does not start in
  cloud sessions.
- **Storybook or a similar tool:** many dependencies for one page, and its license tree would need
  a review; the page needs no stories, only the tokens.
- **`@axe-core/playwright`:** convenient, but MPL-2.0 without an approved exception.
- **Running the browser tests as part of `npm run check` or the Electron job:** `check` would need
  a browser on every machine, and in the Electron job a styleguide failure would stop the
  installer build steps after it.

## Consequences

- New tokens appear on the page automatically; a new prefix needs an entry in `TOKEN_SECTIONS`.
- M3.0d, M3.0e and M3.0f-2 add their sections to the page and their checks to the browser tests.
- Components built in M3 can be shown on the page without exporting them.
- Running the browser tests locally needs `npx playwright install chromium` once.
- CI has a fourth job; it runs only on Linux, because the page does not depend on the platform and
  `npm run styleguide` itself is plain Vite.
