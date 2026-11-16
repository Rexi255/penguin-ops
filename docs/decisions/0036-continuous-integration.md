# 0036. Continuous integration with GitHub Actions

- Status: Accepted
- Date: 2026-11-17
- Supersedes: [0015](0015-quality-gate-and-testing.md) (only the split of the CI jobs)

## Context

ROADMAP M0.9 adds CI on every push to `main` and on pull requests from outside contributors
(ADR 0027). ADR 0015 defines the gate: Linux runs everything, Windows runs the unit and content
tests and builds the installer, plus a documentation duty check. Since ADR 0034 the packaged
app can be tested end to end, and Linux was never verified locally. Open questions:

- What exactly counts as "code or content" for the documentation duty, given that Dependabot
  changes `package.json` and `package-lock.json` in pull requests that cannot update
  `docs/STATUS.md`?
- How to run Electron on a Linux runner without a display, and with Chromium's sandbox, which
  Ubuntu 24.04 restricts?
- How to protect the workflow against compromised third-party actions and dependency releases?

## Decision

- **One workflow, `.github/workflows/ci.yml`,** on every push to `main` and every pull request.
  All commands are npm scripts. The token is read-only (`contents: read`), and checkout does not
  keep credentials. A newer push cancels an older run only for pull requests. On `main`, every
  commit is checked to the end.
- **Linux job** (`ubuntu-24.04`): `npm ci`, `npm run check`, `npm run e2e`, `npm run package`
  (AppImage), `npm run e2e:packaged`; uploads the AppImage as a build artifact (7 days).
  Electron runs under `xvfb-run` (virtual display). The job allows unprivileged user
  namespaces (`kernel.apparmor_restrict_unprivileged_userns=0`), which Chromium's sandbox needs
  and Ubuntu 24.04 blocks by default. The app keeps its sandbox (ADR 0014).
- **Windows job** (`windows-2025`): `npm ci`, `npm test`, `npm run e2e`, `npm run package` (NSIS
  installer), `npm run e2e:packaged`; uploads the installer as a build artifact (7 days). This
  goes beyond ADR 0015 (unit and content tests and the installer build): Windows is the main
  platform, and the end-to-end tests of the built and the packaged app take less than a minute.
  Format, lint, type and license checks give the same result on both systems and run on Linux
  only.
- **Documentation duty job:** `npm run check:docs-duty -- <base> <head>`
  (`scripts/check-docs-duty.ts`) lists the changed files with `git diff base...head`. For a
  push, base is the commit before the push. For a pull request, base is its base commit, and
  the three-dot range compares with the merge base. It fails if code or content changed and
  `docs/STATUS.md` did not. Without arguments it checks the local commits that are not pushed
  yet (`origin/main...HEAD`).
  - **Code or content** are files in `apps/`, `packages/`, `content/` and `scripts/`, and root
    files ending in `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` or named `tsconfig*.json`.
  - **Not counted:** Markdown files, `package.json` and `package-lock.json` (dependency updates
    by Dependabot), and everything else, for example `.github/`, `.claude/`, `docs/` and
    `license-policy.json`.
- **Actions are pinned to full commit SHAs** with the version as a comment. Dependabot updates
  them.
- **Dependabot** (`.github/dependabot.yml`): weekly on Mondays for npm and GitHub Actions. All
  minor and patch updates of each ecosystem come in one grouped pull request. Electron major
  versions are ignored and upgraded deliberately (ADR 0016). A version must be public for 7
  days before Dependabot proposes it (cooldown), so that a compromised release is usually found
  and withdrawn first. Commit messages start with `chore(deps)`.
- **Pull request template** (`.github/pull_request_template.md`) for outside contributors:
  what and why, a checklist of the gate and the documentation duty, screenshots for visual
  changes.

## Alternatives considered

- **Every root file counts as code for the documentation duty:** Dependabot pull requests would
  always fail, and the owner would have to add a status update to each one.
- **Excluding Dependabot by the actor's name:** works for its pull requests, but not for the push
  to `main` when the owner merges them, because then the owner is the actor.
- **Disabling Chromium's sandbox in CI (`--no-sandbox`):** the tests would no longer run the app
  as players run it.
- **Pinning actions to version tags such as `v7`:** a tag can be moved to other code; a commit
  SHA cannot.
- **Windows job without end-to-end tests (as in ADR 0015):** the packaged app on the main
  platform would only be tested by hand.

## Consequences

- From now on a red run on `main` is fixed before new work (ADR 0027), and branch protection
  (ROADMAP M0.10) can require these checks.
- Changes to `package.json` scripts alone do not trigger the documentation duty. They usually
  come together with code changes that do.
- CI downloads Electron twice per job (npm and electron-builder). Caching is left out until runs
  become slow.
