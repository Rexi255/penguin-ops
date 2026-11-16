# 0030. Vitest setup and coverage threshold

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

ADR 0015 makes Vitest the runner for unit, content and UI component tests and requires at least
90 % engine coverage. ROADMAP M0.4 sets Vitest up. ADR 0029 left open whether the lint rule
tests (`scripts/lint-rules.test.ts`) move from Node's built-in test runner to Vitest. Two
constraints shape the setup:

- The engine must not see Node.js or DOM types (ADR 0006, ADR 0026), but Vitest's type
  declarations use Node.js globals such as `AbortSignal` and `EventTarget`. Type-checking a test
  file inside the engine's project fails without them.
- The roadmap also listed a Playwright configuration in M0.4. Before ROADMAP M0.7 there is no
  window to test, so a Playwright configuration would have nothing to run.

## Decision

- **Vitest 5** with the V8 coverage provider (`@vitest/coverage-v8`), configured once in the
  root `vitest.config.ts`. Each workspace with tests is one Vitest project there (`engine`,
  `tooling`); a workspace gets its project when it gets its first test.
- **Commands:** `npm test` runs all projects; `npm run test:coverage` runs them with coverage
  and fails when a threshold is missed. `npm run check` (ROADMAP M0.6) uses `test:coverage`.
- **Coverage** is measured for `packages/*/src` and `apps/*/src` without test files. The
  threshold of 90 % for statements, branches, functions and lines applies to
  `packages/engine/src/**`. It was verified by adding uncovered code: the run failed with exit
  code 1.
- **Separate TypeScript projects for tests:** a workspace with tests turns its `tsconfig.json`
  into a solution file with two projects: `tsconfig.lib.json` (production code, environment
  unchanged, test files excluded) and `tsconfig.test.json` (only `*.test.ts`, with Node.js
  types, referencing the lib project). Production code still cannot use Node.js APIs; ESLint
  keeps forbidding Node.js imports in every file of a pure workspace, tests included.
- **One test runner:** the lint rule tests move to Vitest as the `tooling` project. The script
  `test:lint-rules` is removed; `npm test` covers it. The ESLint exception for floating
  promises from `node:test` is removed because nothing uses `node:test` any more.
- **Playwright moves to ROADMAP M0.7**, where it is configured together with the first real
  test against the placeholder window.

## Alternatives considered

- **Node types for the whole engine project:** simpler, but production code could then use
  `process` or `Buffer` without a type error, which ADR 0006 rules out.
- **Keep Node's test runner for tooling tests:** two runners, two assertion styles and two
  commands for no benefit.
- **A Playwright configuration without tests now:** it would pretend to test something and
  could not be verified.

## Consequences

- Workspaces with tests have three `tsconfig` files instead of one.
- The first engine module, the seeded random generator (part of ROADMAP M1.3, ADR 0008), was
  written in M0.4 so that the first test and the coverage threshold check real code.
