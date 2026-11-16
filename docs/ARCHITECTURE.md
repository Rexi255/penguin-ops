# Architecture

> **Status: skeleton.** The workspaces exist with strict TypeScript configs (ROADMAP M0.2) but
> contain no code yet. The sections below describe the target architecture decided in the
> planning phase. Update this document whenever the real structure differs or grows.
> Reasons for each choice are in `docs/decisions/`.

## Overview

```
┌──────────────────────── Electron ─────────────────────────────┐
│  Main process (apps/desktop)          Renderer process        │
│  ┌──────────────────────────┐        ┌──────────────────────┐ │
│  │ window, menu, fullscreen │        │ apps/ui (React)      │ │
│  │ save slots, settings     │◄──────►│   uses               │ │
│  │ export / import files    │preload │ packages/gameplay    │ │
│  └──────────────────────────┘  API   │ packages/content     │ │
│                                      │ packages/engine      │ │
│                                      └──────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
        content/ (YAML data) ──► validated and bundled at build time
```

- The **engine** simulates Linux. The **gameplay** package runs tickets, chapters and progress.
  The **UI** shows everything. The Electron **main process** only owns the window and files.
- Engine, content, gameplay and UI run in the renderer, so the same code runs in a plain
  browser for tests and a possible later web version (ADR 0006).

## Repository layout

```
penguin-ops/
  packages/
    engine/      Linux simulation (pure TypeScript)
    content/     schema, loader, translation formatting (pure TypeScript)
    gameplay/    game logic and save data model (pure TypeScript)
  apps/
    ui/          React renderer
    desktop/     Electron main process, preload, packaging config
  content/       data only
    chapters.yaml
    levels/<level-id>/level.yaml, de.yaml, en.yaml
    ui/de.yaml, ui/en.yaml
    worlds/      shared base worlds (e.g. the company network, the playground)
  docs/          documentation (see CLAUDE.md, "Where to find what")
  .claude/       Claude Code skills, rules and hooks
  .github/       CI workflows, Dependabot, pull request template (from M0)
  package.json         npm workspaces, root scripts, pinned Node.js version (engines)
  tsconfig.base.json   shared strict compiler options
  tsconfig.json        solution file: references all workspaces for `tsc --build`
```

Allowed dependencies: `engine` ← `content` ← `gameplay` ← `ui` ← `desktop`. The engine
depends on nothing project-internal (ADR 0006).

## TypeScript setup

Details and reasons: ADR 0026.

- Every workspace is named `@penguin-ops/<folder>`, exports its TypeScript source
  (`src/index.ts`) and is a composite TypeScript project extending `tsconfig.base.json`.
  `npm run typecheck` runs `tsc --build` over the root `tsconfig.json`; it emits only
  declarations into the ignored `dist/` folders. Vite builds the JavaScript.
- Each workspace declares its environment through `lib` and `types`: engine, content and
  gameplay get plain `ES2024` without DOM or Node types; `apps/ui` adds the DOM; `apps/desktop`
  adds Node types. Using a wrong-environment API is a type error.
- The dependency direction between workspaces is declared in each `package.json`
  (`dependencies`) and `tsconfig.json` (`references`), but TypeScript does not enforce it for
  imports by package name. ESLint package boundary rules enforce it from ROADMAP M0.3 on.

## Engine (`packages/engine`)

- **World model** (ADR 0009): a world has hosts and a network. Each host has a file system,
  users, groups, services and processes. A session belongs to one host and user.
- **File system:** tree of directories and files with owner, group, mode and mtime; path
  resolution (`~`, `.`, `..`), permission checks and errors like Linux (ENOENT, ENOTDIR,
  EACCES).
- **Shell** (ADR 0007): lexer → parser → AST → interpreter. Expansion of variables, `~` and
  globs; pipelines; lists with `;`, `&&`, `||`; redirections; exit codes.
- **Commands:** registry of command implementations with declared options, a shared option
  parser and coreutils-style errors, matching Debian 13 (ADR 0004).
- **Full-screen programs:** one mechanism for `less`, `man`, `top`, `nano` and later `vim`.
- **Rule evaluation** (ADR 0011): rule types plus `all`, `any`, `not`, evaluated against world
  state and command output.
- **Events:** the engine emits structured events (output, game notices with message keys,
  screen clear, full-screen program start and end). It never produces translatable text.
- **Determinism** (ADR 0008): injected game clock and seeded random generator; deterministic
  data generators.
- **Completion and history:** APIs for tab completion and command history.

## Content (`packages/content` and `content/`)

- Level schema (zod) with a format version; generated JSON Schema for editor support
  (ADR 0010).
- Loader for `content/chapters.yaml`, levels, worlds and catalogs; validation errors with file
  and line.
- Translation catalogs per level and for the UI; ICU MessageFormat; small text markup without
  HTML; English fallback for extra languages (ADR 0012).
- Format details: `docs/LEVEL-AUTHORING.md`.

## Gameplay (`packages/gameplay`)

- Level session: builds the world from the level, passes commands to the engine, evaluates
  goals, steps, tips and extra goals.
- Campaign: chapters, inbox, unlocking, Story and Sandbox modes, playground (ADR 0017).
- Progress: XP, ranks, achievements (ADR 0018).
- Save data model with format version and migrations; settings model (ADR 0013).
- Developer mode API: load any level or step, auto-play reference solutions, inspect rules.

## UI (`apps/ui`)

- React screens: start, save slots, new game, game, pause menu, settings, credits.
- Workplace layout: top bar, side panel tabs (Tickets, Mail, Handbook), terminal area, footer
  (ADR 0020).
- Terminal component: input line, coloured output, history, completion, key handling like
  bash; full-screen programs take over the area.
- Colour schemes, optional effects, bundled fonts, UI sounds via Web Audio.
- All texts come from the catalogs; no hard-coded strings.

## Desktop (`apps/desktop`)

- Electron main process: window and fullscreen, save slots and settings in the per-user data
  folder (atomic writes, backup), slot export and import.
- Preload: a small typed API; inputs are validated in the main process.
- Security baseline (ADR 0014): context isolation, sandbox, no Node integration in the
  renderer, strict Content Security Policy, no remote content, no network requests.
- Packaging with electron-builder: NSIS installer (Windows), AppImage (Linux).

## Testing and CI

Test layers, quality gate and CI jobs: ADR 0015. Tests live next to the code (`*.test.ts`);
end-to-end tests in `apps/ui/e2e/`.

## Claude Code setup

- `CLAUDE.md`: rules for every session; imports `docs/STATUS.md`.
- `.claude/rules/`: path-scoped rules (`engine.md`, `content.md`, `ui.md`) that load only when
  matching files are read.
- `.claude/skills/`: `/next`, `/wrap-up`; more are planned in the roadmap.
- `.claude/settings.json` and `.claude/hooks/session-start.mjs`: a SessionStart hook that adds
  the git state to the context. It runs `node` in exec form, so it works on Windows and Linux.
- Details and reasons: ADR 0025.
