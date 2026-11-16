# 0029. Formatting, linting and boundary enforcement

- Status: Accepted; partly superseded by [0033](0033-electron-app-structure-and-preload-contract.md)
  (`apps/desktop` may import types from `@penguin-ops/ui`)
- Date: 2026-11-16
- Supersedes: –

## Context

ADR 0015 requires a format check and a lint step with strict type-checked rules, the
exhaustiveness check, enforced package boundaries and a ban on focused or skipped tests. ADR
0026 left a known gap: TypeScript does not enforce the dependency direction between workspaces
when a workspace imports another one by package name. ROADMAP M0.3 sets this up and needs
concrete choices for the tools, their scope and how the boundary rules are built and proven.

## Decision

- **Prettier 3**, pinned to an exact version because formatting can change in minor releases.
  Only `printWidth: 100` deviates from the defaults. Prettier formats code, JSON and YAML.
  **Markdown is excluded**: documentation is wrapped by hand at 100 characters, and Prettier
  would rewrite tables in accepted decision records, which must not change (ADR 0001).
- **ESLint 10 with flat config** (`eslint.config.js`) and `typescript-eslint`:
  `js.configs.recommended`, `strictTypeChecked` and `stylisticTypeChecked`, with type
  information from the TypeScript project service. Unused disable comments are errors.
  Formatting rules are not used; Prettier owns formatting.
- **Exhaustive switches:** `switch-exhaustiveness-check` with
  `considerDefaultExhaustiveForUnions: false` (a `default` branch does not hide a missing union
  member), `allowDefaultCaseForExhaustiveSwitch: false` and `requireDefaultForNonUnion: true`.
- **Package boundaries** with `@typescript-eslint/no-restricted-imports`, generated per
  workspace from one table in `eslint.config.js` that mirrors ADR 0006:

  | Workspace | May import by package name | Node.js built-ins |
  |---|---|---|
  | `packages/engine` | – | no |
  | `packages/content` | `@penguin-ops/engine` (types only) | no |
  | `packages/gameplay` | `@penguin-ops/engine`, `@penguin-ops/content` | no |
  | `apps/ui` | `@penguin-ops/engine`, `@penguin-ops/content`, `@penguin-ops/gameplay` | no |
  | `apps/desktop` | – | yes |

  Every other `@penguin-ops/*` import fails, including subpaths such as
  `@penguin-ops/engine/src/x` and workspaces added later. Node.js built-ins are blocked with
  and without the `node:` prefix. Dynamic `import()` is banned in all workspaces, because the
  import rule cannot see it. Relative imports into another workspace need no ESLint rule:
  `tsc --build` already rejects them (TS6059, TS6307), which was verified.
- **No focused or skipped tests:** `@vitest/eslint-plugin` with `no-focused-tests` (without
  autofix) and `no-disabled-tests`, applied to all source files.
- **The rules are tested:** `scripts/lint-rules.test.ts` lints small code snippets as if they
  were files in each workspace and asserts which rules fire (`npm run test:lint-rules`). It
  uses Node's built-in test runner because Vitest arrives only in ROADMAP M0.4.
- **Tooling project:** `eslint.config.js` and `scripts/` form their own TypeScript project
  (`tsconfig.tooling.json`, referenced by the root solution), so they are type-checked and
  linted like the workspaces. Scripts are TypeScript that Node.js runs directly through type
  stripping (`erasableSyntaxOnly`), without a build step.

## Alternatives considered

- **`eslint-plugin-boundaries` or `eslint-plugin-import-x` (`no-restricted-paths`):** more
  powerful, but they need a module resolver and more configuration. Package-name imports are
  the only gap, and the built-in rule closes it without new dependencies.
- **`eslint.config.ts`:** needs `jiti` or an unstable ESLint flag for Node's native
  TypeScript support. A type-checked JavaScript file gives the same safety without either.
- **Prettier for Markdown too:** consistent, but it would rewrite accepted decision records
  and hand-formatted tables.
- **Testing the rules with fixture files on disk:** the files would be linted and type-checked
  in every normal run and fail on purpose there.

## Consequences

- The ADR 0026 gap is closed: an import against the dependency direction fails `npm run lint`.
- A new workspace must be added to the boundary table in `eslint.config.js`; until then any
  import of it fails, which is the safe default.
- Lazy loading with `import()` needs a new decision if the UI ever wants it.
- ROADMAP M0.4 moves `scripts/lint-rules.test.ts` to Vitest or keeps Node's runner for
  tooling tests; M0.6 adds `format:check`, `lint` and `test:lint-rules` to `npm run check`.
