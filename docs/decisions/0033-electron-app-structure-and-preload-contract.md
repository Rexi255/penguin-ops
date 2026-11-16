# 0033. Electron app structure, preload contract and end-to-end tests

- Status: Accepted
- Date: 2026-11-17
- Supersedes: [0029](0029-formatting-linting-and-boundary-enforcement.md) (only the boundary
  row of `apps/desktop`), [0026](0026-typescript-configuration-and-toolchain-versions.md) (only
  `skipLibCheck` and the environment of `apps/desktop`)

## Context

ROADMAP M0.7 creates the first Electron window with electron-vite (ADR 0003), a React
placeholder screen, the security baseline of ADR 0014, a typed preload stub and the Playwright
configuration that ADR 0030 moved here. Several questions had no answer yet:

- electron-vite expects one package with `src/main`, `src/preload` and `src/renderer`, but the
  repository splits the main process (`apps/desktop`) and the renderer (`apps/ui`, ADR 0006).
- The preload script (in `apps/desktop`) and the UI (in `apps/ui`) must agree on the API
  between them. ADR 0029 allowed `apps/desktop` no imports from other workspaces.
- Electron's type declarations need DOM types (for `<webview>` and video frames), and
  electron-vite's declarations import its optional peer dependency `@swc/core`. With
  `skipLibCheck: false` (ADR 0026) neither type-checks in a project without DOM types or
  without `@swc/core`.
- The Vite development server injects CSS as inline `<style>` elements and reloads through a
  WebSocket, both of which the strict Content Security Policy blocks.

## Decision

- **One electron-vite configuration in `apps/desktop/electron.vite.config.ts`.** Main process
  and preload script come from `apps/desktop/src/main` and `src/preload`; the renderer root is
  `apps/ui` (`index.html`, `src/main.tsx`). All output goes to `apps/desktop/out`, and
  `apps/desktop/package.json` points `main` to `out/main/index.js`. The main process is an ES
  module; the preload script is built as CommonJS (`index.cjs`), because sandboxed preload
  scripts cannot be ES modules.
- **The preload contract lives in `apps/ui/src/desktop-api.ts`** (`DesktopApi`, `AppInfo`),
  because the UI is the consumer. `apps/ui/src/index.ts` exports only these types.
  `apps/desktop` may import types (`import type`) from `@penguin-ops/ui`, nothing else; ESLint
  enforces this through the boundary table (row `apps/desktop`: type-only `ui`). This follows
  the dependency direction `ui ← desktop` of ADR 0006. IPC channel names are shared between
  main and preload in `apps/desktop/src/shared/ipc-channels.ts`.
- **Security baseline (ADR 0014) as implemented:** `app.enableSandbox()`; every window uses
  `secureWebPreferences()` (context isolation, sandbox, no Node.js integration, no `<webview>`,
  web security on); new windows, navigation and `<webview>` are denied for all web contents;
  all permission requests are denied; a `webRequest` filter blocks every request except the
  app's own files (or the development server in development) and `data:`, `blob:` and
  `devtools:` URLs; IPC handlers answer only the app's own page. The decisions are pure
  functions in `src/main/security.ts` with unit tests. The development server URL is used only
  when the app is not packaged.
- **Content Security Policy** as a `<meta>` tag in `apps/ui/index.html`:
  `default-src 'none'`, scripts, styles, fonts and images only from the app (`data:` images
  allowed), `connect-src 'none'`. A plugin in the electron-vite configuration relaxes exactly
  two directives for the development server (`style-src` gets `'unsafe-inline'`,
  `connect-src` becomes `'self'`) and fails the start if the policy text no longer matches.
  Production builds keep the strict policy.
- **Type checking:** `apps/desktop` has three TypeScript projects: `tsconfig.lib.json` (main
  process and preload script, Node.js types, no DOM), `tsconfig.test.json` (Vitest tests) and
  `tsconfig.tooling.json` (electron-vite and Playwright configuration and the end-to-end tests,
  with DOM types because the tests contain functions that run in the page). These three use
  `skipLibCheck: true`; our own code is still fully checked. All other projects keep
  `skipLibCheck: false`.
- **Tests:** the main process logic runs in the Vitest project `desktop`. Playwright drives the
  built app through Electron (`apps/desktop/playwright.config.ts`, tests in
  `apps/desktop/e2e/*.spec.ts`, no browser download). `npm run e2e` builds the app and runs
  them; they are not part of `npm run check`, CI runs them from ROADMAP M0.9. The test helper
  removes `ELECTRON_RUN_AS_NODE` from the environment, because some hosts (for example VS Code
  extension hosts) set it and Electron would then start as plain Node.js.
- **No screenshot comparison test for the placeholder screen:** it has no texts, colour
  schemes or bundled fonts yet and will be replaced. The first real screen gets screenshot
  tests as `.claude/rules/ui.md` requires.

## Alternatives considered

- **Contract types in `apps/desktop`:** the UI would have to import from the desktop, against
  the dependency direction of ADR 0006.
- **A new shared workspace for the contract:** a sixth workspace for two interfaces.
- **Duplicated types on both sides:** they could drift apart without a type error.
- **DOM types for the main process instead of `skipLibCheck`:** the main process could then use
  `document` or `window` without a type error and crash at run time, which is worse than not
  checking third-party declaration files.
- **Installing `@swc/core` only for its types:** a large native package for a type the
  configuration never uses.
- **A custom `app://` protocol instead of `file://`:** recommended by Electron's security
  checklist and a candidate for later; with the request filter and CSP, `file://` is safe for
  the placeholder and keeps the first step small (see ROADMAP ideas).

## Consequences

- `npm run dev` starts the app with hot reload; `npm run build` builds it; `npm run e2e`
  builds and tests it.
- Every new native capability is added to `DesktopApi`, implemented in the preload script and
  handled in the main process with sender and input validation.
- ESLint rules for React hooks are not set up yet; they are needed once components use hooks
  (ROADMAP ideas).
