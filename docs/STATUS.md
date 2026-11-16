# Status

_Last updated: 2026-11-16_

## Recently completed

- M0.3 Formatting and linting: Prettier (Markdown excluded), ESLint 10 with strict type-checked
  rules, exhaustive switches, package boundary rules and no focused or skipped tests; the rules
  are proven by `npm run test:lint-rules` (ADR 0029).
- Workflow change: all work happens directly on `main`, no branches or pull requests
  (ADR 0027, supersedes ADR 0016); terse chat replies (ADR 0028).
- M0.2 Monorepo skeleton: five npm workspaces, strict TypeScript configs with project
  references, Node.js 26 LTS and TypeScript 6.0 pinned (ADR 0026). `npm run typecheck` is green.
- M0.1 Repository is public; GitHub email privacy is enabled.
- Planning phase finished: 25 decision records in `docs/decisions/`.

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M0.4: test setup (Vitest, Playwright); decide whether `scripts/lint-rules.test.ts`
   moves to Vitest (ADR 0029).
2. ROADMAP M0.5: license check.
3. ROADMAP M0.6: `npm run check`, including `format:check`, `lint` and `test:lint-rules`.

## Blockers and open questions

- Linux was not verified locally (no WSL); CI covers it from M0.9.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- Until M0.6, `npm run check` does not exist; the Definition of Done applies without it.
