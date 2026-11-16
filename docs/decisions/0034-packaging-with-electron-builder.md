# 0034. Packaging with electron-builder

- Status: Accepted
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M0.8 turns the built app (`apps/desktop/out`, ADR 0033) into the installer wizard for
Windows and the AppImage for Linux that ADR 0002 promises, built with electron-builder (ADR
0003). Several details had no answer yet:

- The Windows installation needs a permanent identity (app id), because Windows recognises an
  installed version by it when a newer one is installed.
- npm hoists `electron` to the workspace root. electron-builder looks for it next to
  `apps/desktop` and, when it cannot find it, refuses the version range `^45.3.3` from
  `package.json`, because it must download the exact matching Electron binaries.
- The end-to-end tests of ADR 0033 only start the built app with the development Electron. They
  do not prove that the packaged app (files inside `app.asar`, `app.isPackaged` true) starts.
- `apps/desktop/package.json` has no `author`, and its `description` is written for developers.

## Decision

- **Configuration in `apps/desktop/electron-builder.config.ts`**, a typed module that
  electron-builder loads itself (`--config`). `npm run package` (root and `apps/desktop`) runs
  `electron-vite build` and then electron-builder for the platform it runs on. Output goes to
  `apps/desktop/release/` (ignored by Git, ESLint and Prettier).
- **App id `io.github.rexi255.penguin-ops`** (ADR 0021: technical identifier `penguin-ops`),
  product name `PenguinOps`. The app id must never change after the first release.
- **Electron version:** the configuration reads the exact version from the installed
  `electron/package.json`, so the lockfile stays the only place that pins it.
- **Contents:** only `out/**` without source maps, packed into `app.asar`. The app has no
  runtime dependencies because electron-vite bundles everything.
- **Windows:** NSIS installer wizard for x64 (`oneClick: false`). The player chooses between an
  installation for the current user (no administrator rights) and for all users, and chooses
  the folder. The installer creates a desktop shortcut and a Start menu entry, offers to start
  the game at the end, and comes with an uninstaller. The uninstaller keeps the per-user data
  folder, so save games survive an uninstall (ADR 0013). The installer follows the Windows
  display language, German or English. File name: `PenguinOps-Setup-<version>.exe`, as in the
  README.
- **Linux:** AppImage for x64, executable `penguin-ops`, menu category `Game`, file name
  `PenguinOps-<version>.AppImage`.
- **No code signing and the default Electron icon** for now (ADR 0002; the icon follows with the
  branding).
- **Never published by a build:** `publish: null`. Publishing to GitHub Releases is the job of
  the release pipeline (ROADMAP M5.3).
- **`author` in `apps/desktop/package.json` is `Rexi255`**, as in `LICENSE`. electron-builder
  uses it as the publisher, and the copyright line is set explicitly. The Linux menu
  description is set in the configuration, so the developer description in `package.json` is
  not shown to players.
- **Tests:** a Vitest test (`apps/desktop/electron-builder.config.test.ts`, project `desktop`)
  guards these settings. The Playwright configuration has two projects with the same tests:
  `built` (`npm run e2e`) and `packaged` (`npm run e2e:packaged`), which starts the unpacked app
  that `npm run package` leaves in `release/win-unpacked` or `release/linux-unpacked`. A test
  checks that `app.isPackaged` is true exactly in the `packaged` project.

## Alternatives considered

- **Configuration in YAML or in `package.json`:** no types and no comments (JSON). The
  configuration would also be harder to share with the tests.
- **Pinning the exact Electron version in `package.json`:** works, but duplicates the lockfile
  and every update would have to change two places.
- **A one-click installer:** simpler, but ADR 0002 asks for a wizard with a choice of folder.
- **Electron fuses** (for example disabling `ELECTRON_RUN_AS_NODE` in the packaged app): a useful
  hardening step, but not part of this work package. It is listed in the ROADMAP ideas.

## Consequences

- `npm run package` builds the installer on Windows and the AppImage on Linux; CI builds both
  from ROADMAP M0.9 on and runs `npm run e2e:packaged` against them.
- The installer itself (wizard pages, shortcuts, uninstall) is checked by hand; the automated
  tests cover the packaged app it installs.
- The license texts of bundled dependencies are not shipped yet. ROADMAP M5.3 adds generated
  license texts to releases.
- `npm audit` reports moderate advisories for `minimatch` inside electron-builder. It only
  processes our own file patterns at build time and never ships, so the advisories do not
  affect players.
