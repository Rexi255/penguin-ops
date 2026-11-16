# 0015. Strict quality gate and test strategy

- Status: Accepted; partly superseded by [0027](0027-work-directly-on-main.md) (the gate runs on
  pushes to `main`, not on pull requests)
- Date: 2026-11-16
- Supersedes: –

## Context

All code is written by AI. The owner reviews but cannot check every line. Tests and CI are
therefore the main safety net. AI-written tests can also be weak (always green), and code must
work on Windows (main target) and Linux.

## Decision

**Test layers**

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | parser, interpreter, every command (including error cases), file system, permissions, every rule type, gameplay logic, save migrations |
| Content | Vitest | schema of every level, completeness of German and English, reference solutions in every language and with two user names, "not solved at start", no tip fires on reference solutions |
| UI components | Vitest + Testing Library | components and keyboard handling |
| End-to-end and screenshots | Playwright | main screens in both languages and all colour schemes, compared with approved screenshots |
| Accessibility | axe-core via Playwright | contrast, labels, keyboard reachability |
| Desktop smoke | Playwright (Electron) | app starts, saves, loads |
| Differential (later, M6) | Vitest + Debian 13 container | simulation vs. real Linux (ADR 0004) |
| Mutation (on demand) | Stryker | strength of the engine tests |

**Gate on every pull request** (all required): format (Prettier), lint (ESLint with strict
type-checked rules, exhaustiveness check, enforced package boundaries, no focused or skipped
tests), type check, all test layers above except differential and mutation, license check
(ADR 0005), Windows build of the installer, engine coverage of at least 90 %, and the
documentation duty check (a pull request that changes code or content must also change
`docs/STATUS.md`).

**CI jobs:** Linux runs everything; Windows runs unit and content tests and builds the
installer.

**Mutation tests** (a tool deliberately inserts small bugs and checks whether the tests notice)
run before every release and on demand via an npm script; no scheduled runs.

**Developer mode:** a hidden mode (start flag or key combination) to jump to any level or
step, auto-play reference solutions, show check rules live and switch language during a
ticket. It is used for reviews and screenshot tests and is disabled in release builds,
guarded by a test.

**Commands** are defined once as npm scripts (planned: `dev`, `check`, `e2e`, `package`,
`test:mutation`) and must run on Windows and Linux.

## Alternatives considered

- **Basic gate (format, lint, types, unit tests only):** too weak for an AI-built project.
- **Weekly scheduled mutation tests:** considered overkill by the owner.

## Consequences

- Pull requests take longer to get green, but broken code cannot reach `main` unnoticed.
- Intentional visual changes require updating the approved screenshots in the same pull
  request, with before/after images in the description.
