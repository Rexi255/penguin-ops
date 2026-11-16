# 0006. Monorepo with enforced package boundaries

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The game has clearly separable parts: the Linux simulation, the level content, the game logic
(tickets, progression, saves), the UI and the desktop shell. Because AI writes the code, the
separation must be enforced by tools, not only by convention. The same core code should run
in Electron, in browser-based tests and in a possible later web version.

## Decision

npm workspaces in one repository:

| Folder | Responsibility | May depend on |
|---|---|---|
| `packages/engine` | Linux simulation: world, hosts, file system, users, shell, commands, rule evaluation | nothing project-internal |
| `packages/content` | Level schema, loader, translation catalogs and formatting | `engine` (types only) |
| `packages/gameplay` | Game logic: level sessions, chapters, steps, progression, XP, achievements, save data model and migrations | `engine`, `content` |
| `apps/ui` | React UI (renderer): screens, terminal component, panels, themes, sounds | `engine`, `content`, `gameplay` |
| `apps/desktop` | Electron main process, preload API, window, file access for saves and settings, packaging | `apps/ui` build output |
| `content/` | Data only: levels, chapter order, UI texts, shared worlds | – |

- `packages/engine` and `packages/gameplay` are pure: no DOM, no Node APIs, no file system,
  network or real time. Enforced by their TypeScript configuration (no `DOM` library, no Node
  types) and by ESLint import restrictions; violations fail the build.
- Process model: engine, gameplay and UI run in Electron's renderer process. The main process
  only handles the window, save files and settings, exposed through a narrow preload API
  (ADR 0014). The same code runs unchanged in a browser for tests.

This refines the planning proposal (`apps/game` was renamed to `apps/ui`; `packages/gameplay`
was added so that game rules stay pure and testable outside the UI).

## Alternatives considered

- **Single package with folders:** boundaries only by convention; AI would eventually import
  UI code into the engine.
- **Engine in Electron's main process with IPC per command:** more complex, slower to test, and
  not reusable in a browser.

## Consequences

- Clear places for every kind of change; tests for engine and gameplay run fast in Node.
- Slightly more configuration (one `tsconfig` per package).
