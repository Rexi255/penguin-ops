# Status

_Last updated: 2026-11-17_

## Recently completed

- M0.8 Packaging: `npm run package` builds an NSIS installer wizard (Windows) or an AppImage
  (Linux) into `apps/desktop/release` with electron-builder; app id
  `io.github.rexi255.penguin-ops`; `npm run e2e:packaged` runs the end-to-end tests against
  the packaged app (ADR 0034). The owner tested install and uninstall on Windows.
  `truncate-utf8-bytes` (WTFPL) approved as a development-only exception (ADR 0035).
- M0.7 Electron window: electron-vite builds main, preload (CommonJS) and the React renderer
  from `apps/ui`; placeholder screen with name and version; security baseline; typed preload
  contract `DesktopApi`; Playwright end-to-end tests against Electron (ADR 0033).
- M0.6 `npm run check` runs format check, type check, lint, tests with coverage and the
  license check in one command.
- M0.5 License check: `npm run check:licenses` checks every package in `package-lock.json`
  against `license-policy.json` (ADR 0032).
- M0.4 Test setup: Vitest 5 with V8 coverage (engine threshold 90 %), first engine module;
  lightningcss approved as a development-only exception (ADR 0030, ADR 0031).

## In progress

- ROADMAP M0.9: CI on every push to `main`.

## Next 3 steps

1. ROADMAP M0.9: CI on every push to `main` (including `npm run e2e`, `npm run package` and
   `npm run e2e:packaged`).
2. ROADMAP M0.10: branch protection on `main` (owner, guided by Claude).
3. ROADMAP M0.11: `/adr` skill.

## Blockers and open questions

- Linux was not verified locally (no WSL), including the AppImage; CI covers it from M0.9.
  Electron on Linux CI may need extra setup for its sandbox and a virtual display.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
