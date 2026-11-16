# Status

_Last updated: 2026-11-16_

## Recently completed

- M0.5 License check: `npm run check:licenses` checks every package in `package-lock.json`
  (all platforms) against `license-policy.json`, with SPDX expressions and development-only
  exceptions; own checker without dependencies (ADR 0032).
- M0.4 Test setup: Vitest 5 with V8 coverage (engine threshold 90 %, proven to fail below it),
  first engine module (seeded random generator, Mulberry32), lint rule tests moved to Vitest;
  separate test tsconfig so only tests see Node types (ADR 0030). Playwright moved to M0.7.
  lightningcss (MPL-2.0, required by Vite 8) approved as a development-only exception (ADR 0031).
- M0.3 Formatting and linting: Prettier (Markdown excluded), ESLint 10 with strict type-checked
  rules, exhaustive switches, package boundary rules and no focused or skipped tests (ADR 0029).
- Workflow change: all work happens directly on `main`, no branches or pull requests
  (ADR 0027, supersedes ADR 0016); terse chat replies (ADR 0028).
- M0.2 Monorepo skeleton: five npm workspaces, strict TypeScript configs with project
  references, Node.js 26 LTS and TypeScript 6.0 pinned (ADR 0026). `npm run typecheck` is green.

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M0.6: `npm run check` with `format:check`, `lint`, `typecheck`, `test:coverage` and
   `check:licenses`.
2. ROADMAP M0.7: Electron window and Playwright configuration.
3. ROADMAP M0.8: packaging with electron-builder.

## Blockers and open questions

- Linux was not verified locally (no WSL); CI covers it from M0.9.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- Until M0.6, `npm run check` does not exist; the Definition of Done applies without it.
