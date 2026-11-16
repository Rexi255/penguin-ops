# 0026. TypeScript configuration and toolchain versions

- Status: Accepted; partly superseded by [0033](0033-electron-app-structure-and-preload-contract.md)
  (`skipLibCheck` and the environment of `apps/desktop`)
- Date: 2026-11-16
- Supersedes: –

## Context

ROADMAP M0.2 creates the npm workspaces from ADR 0006. That needs concrete choices: which
Node.js and TypeScript versions, how strict the compiler is, how workspaces see each other, and
how the pure packages are kept free of DOM and Node APIs.

Facts on 2026-11-16: Node.js 26 is the current LTS line. The latest TypeScript is 7.0 (the
native compiler), but `typescript-eslint` 8.73, which ROADMAP M0.3 needs for type-checked lint
rules, supports only TypeScript `>=4.8.4 <6.1.0`.

## Decision

- **Node.js 26 LTS**, pinned in `.nvmrc` and in `engines` of the root `package.json`
  (`>=26.0.0 <27.0.0`, npm `>=11`). `.npmrc` sets `engine-strict=true`, so `npm install` fails
  with another Node.js major version.
- **TypeScript 6.0** (`~6.0.3`), the newest version `typescript-eslint` supports. Upgrade to 7.x
  once `typescript-eslint` supports it.
- **One shared `tsconfig.base.json`** with all strict options: `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`,
  `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `skipLibCheck: false`.
- **Project references:** every workspace is a composite project; the root `tsconfig.json`
  lists all of them, and `npm run typecheck` runs `tsc --build`. References follow the
  dependency direction of ADR 0006. `tsc` only emits declarations (`emitDeclarationOnly`)
  into each workspace's ignored `dist/`; Vite builds the JavaScript.
- **Workspaces export their TypeScript source** (`"exports": { ".": "./src/index.ts" }`), so
  Vite and Vitest use the code directly without a separate build step.
- **Environment per workspace through `lib` and `types`:**

  | Workspace | `lib` | `types` |
  |---|---|---|
  | `packages/engine`, `packages/content`, `packages/gameplay` | `ES2024` | none |
  | `apps/ui` | `ES2024`, `DOM`, `DOM.Iterable` | none |
  | `apps/desktop` | `ES2024` | `node` |

  `packages/content` is pure as well, as `docs/ARCHITECTURE.md` describes it. If its loader
  later needs file access at build time, that part goes into a build script, or this record is
  superseded.

## Alternatives considered

- **TypeScript 7.0:** faster, but `typescript-eslint` cannot use it yet, and the strict lint
  rules (M0.3) matter more than compile speed.
- **Exports pointing to built JavaScript:** every change would need a build before tests and
  the UI see it; more steps for no benefit, because Vite compiles TypeScript anyway.
- **One `tsconfig.json` for the whole repository:** cannot give the pure packages a different
  `lib` than the UI, so DOM and Node APIs could not be blocked per package.

## Consequences

- Using `document`, `window`, `process`, `setTimeout`, `node:fs` and similar in engine, content
  or gameplay fails the type check; DOM in `apps/desktop` and Node APIs in `apps/ui` fail too.
  This was verified by hand in M0.2 and is covered by ESLint and CI later.
- **Known gap:** TypeScript does not enforce the direction between workspaces. An import by
  package name (for example `@penguin-ops/ui` inside the engine) resolves through
  `node_modules`, where TypeScript treats it as an external library and does not check project
  references. ROADMAP M0.3 closes this gap with ESLint package boundary rules.
- A TypeScript upgrade to 7.x is a follow-up task once `typescript-eslint` supports it.
