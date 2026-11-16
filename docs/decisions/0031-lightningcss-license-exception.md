# 0031. License exception for lightningcss

- Status: Accepted
- Date: 2026-11-16
- Supersedes: [0005](0005-mit-license-and-dependency-allowlist.md) (only the list of approved
  exceptions)

## Context

Vite 8, which Vitest 5 (ADR 0030) and electron-vite (ADR 0003) use, has a required dependency on
`lightningcss`, a CSS parser and transformer. `lightningcss` and its platform-specific binary
packages (`lightningcss-<platform>`) are licensed under MPL-2.0, which ADR 0005 puts on the
"ask the owner first" list. MPL-2.0 is a file-level copyleft: it only requires sharing changes
to MPL-licensed files that are distributed. `lightningcss` runs at build and test time; the CSS
it produces is our own output and is not covered by its license.

## Decision

- The owner approved `lightningcss` and its `lightningcss-*` platform packages as an exception
  under MPL-2.0 with **development scope**: they may be used by build and test tools, but must
  not become runtime dependencies of the shipped app.
- The exception is recorded in `license-policy.json` like the existing axe-core exception.
- Everything else in ADR 0005 stays unchanged.

## Alternatives considered

- **An older Vite or Vitest without lightningcss:** would pin the toolchain to outdated
  versions and still conflict with electron-vite, which follows current Vite.
- **Another test runner:** contradicts ADR 0003 and ADR 0015 for a dependency that is never
  shipped.

## Consequences

- The license check (ROADMAP M0.5) must accept these packages only in development scope.
- If `lightningcss` code is ever modified or shipped, the owner has to decide again.
