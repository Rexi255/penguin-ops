# Status

_Last updated: 2026-11-16_

## Recently completed

- M0.2 Monorepo skeleton: five npm workspaces, strict TypeScript configs with project
  references, Node.js 26 LTS and TypeScript 6.0 pinned (ADR 0026). `npm run typecheck` is green.
- M0.1 Repository is public; GitHub email privacy is enabled.
- Planning phase finished: 25 decision records in `docs/decisions/`.
- Documentation system and Claude Code setup (skills `/next`, `/wrap-up`, path-scoped rules,
  SessionStart hook).
- `LICENSE` holder set to Rexi255; `license-policy.json` created.

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M0.3: formatting and linting, including the package boundary rules.
2. ROADMAP M0.4: test setup (Vitest, Playwright).
3. ROADMAP M0.5: license check.

## Blockers and open questions

- TypeScript does not enforce the dependency direction between workspaces for package-name
  imports (ADR 0026); M0.3 must close this with ESLint.
- M0.2 was committed directly to `main` on the owner's explicit instruction, against ADR 0016.
  Open: one-time exception or a changed workflow (would need a new ADR and a `CLAUDE.md` change)?
- Linux was not verified locally (no WSL); CI covers it from M0.9.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- Until M0.6, `npm run check` does not exist; the Definition of Done applies without it.
