# Status

_Last updated: 2026-11-17_

## Recently completed

- M0.10 dropped: `main` stays without branch protection, so nothing in the repository
  settings gets in the way of direct pushes; the process guardrails stay (ADR 0037).
- M0.9 CI with GitHub Actions on every push to `main` and every pull request: Linux job
  (`npm run check`, end-to-end tests, AppImage, packaged app), Windows job (tests, end-to-end
  tests, installer, packaged app), documentation duty check (`npm run check:docs-duty`),
  Dependabot with grouped weekly updates, pull request template (ADR 0036).
- M0.8 Packaging: `npm run package` builds an NSIS installer wizard (Windows) or an AppImage
  (Linux) into `apps/desktop/release`; `npm run e2e:packaged` tests the packaged app; the owner
  tested install and uninstall on Windows (ADR 0034). `truncate-utf8-bytes` (WTFPL) approved as
  a development-only exception (ADR 0035).
- M0.7 Electron window with placeholder screen, security baseline, typed preload contract and
  Playwright end-to-end tests (ADR 0033).
- M0.6 `npm run check` runs format check, type check, lint, tests with coverage and the
  license check in one command.

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M0.11: `/adr` skill.
2. ROADMAP M1.1: core types of the engine (world, host, file system node, user, group, session).
3. ROADMAP M1.2: virtual file system (paths, owner, group, mode, lookup errors, permission
   checks).

## Blockers and open questions

- Linux is verified only by CI (no WSL locally). The AppImage itself is built but not started
  in CI (the tests start the unpacked app); a manual check on a Linux machine is still open.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
