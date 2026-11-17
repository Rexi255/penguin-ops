# Architecture

> **Status: skeleton.** The workspaces exist with strict TypeScript configs (ROADMAP M0.2);
> the Electron app opens a placeholder window (M0.7), and the engine has the core types of the
> world model (M1.1), path lookup and permission checks (M1.2), its random generator, game
> clock and world builder (M1.3), the shell lexer, parser, word expansion and execution
> (M1.4–M1.6b) and the write side of the file system (M1.6c-1).
> Most sections below describe the target architecture decided in the planning phase. Update this document whenever the real structure differs or grows.
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
  assets/brand/  logo SVGs and web icons, with usage rules (ADR 0040)
  docs/          documentation (see CLAUDE.md, "Where to find what")
  .claude/       Claude Code skills, rules and hooks
  .github/       CI workflows, Dependabot, pull request template (from M0)
  scripts/       repository tooling in TypeScript, run directly by Node.js
                 (license-check/: the dependency license checker; docs-duty/: the
                 documentation duty check; adr/: new decision records)
  package.json         npm workspaces, root scripts, pinned Node.js version (engines)
  tsconfig.base.json   shared strict compiler options
  tsconfig.json        solution file: references all workspaces and the tooling for `tsc --build`
  tsconfig.tooling.json  TypeScript project for `eslint.config.js`, `vitest.config.ts` and `scripts/`
  vitest.config.ts     test projects and coverage thresholds
  eslint.config.js     lint rules, including the package boundaries
  .prettierrc.json     formatting (Markdown is excluded, see .prettierignore)
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
  imports by package name. ESLint enforces it (ADR 0029): `eslint.config.js` holds one table of
  allowed imports per workspace and blocks every other `@penguin-ops/*` import, Node.js
  built-ins outside `apps/desktop`, and dynamic `import()`. Relative imports into another
  workspace already fail `tsc --build`. Tests in `scripts/lint-rules.test.ts` prove that these
  rules fire.
- A workspace with tests has a solution `tsconfig.json` with two projects:
  `tsconfig.lib.json` (production code) and `tsconfig.test.json` (only `*.test.ts`, with Node
  types because Vitest needs them). Production code keeps its environment (ADR 0030).

## Formatting and linting

Details and reasons: ADR 0029.

- Prettier formats code, JSON and YAML (`npm run format`, `npm run format:check`); Markdown is
  wrapped by hand.
- ESLint (`npm run lint`) uses the strict type-checked rules of `typescript-eslint`, the
  exhaustive switch check, the package boundaries and the ban on focused or skipped tests.

## License check

Details and reasons: ADR 0005, ADR 0031, ADR 0032.

- `npm run check:licenses` runs `scripts/check-licenses.ts`. It reads every third-party
  package from `package-lock.json` (all platforms, so Windows and Linux give the same result),
  parses its SPDX license expression and checks it against `license-policy.json`.
- A package marked `dev` in the lockfile is in development scope; every other package is
  shipped (runtime). Development exceptions such as `lightningcss-*` are accepted only in
  development scope.

## Engine (`packages/engine`)

- **World model** (ADR 0009, ADR 0041): a world has hosts and a network. Each host has a file
  system, users, groups, services and processes. A session belongs to one host and user.
  Current state: all world data is immutable; a change returns a new world.
  - `src/ids.ts`: branded `Uid` and `Gid` number types, created with `toUid` and `toGid`.
  - `src/fs-node.ts`: `FsNode`, a discriminated union of `file` and `directory`. A directory
    maps entry names to nodes; every node has owner, group, mode and mtime.
  - `src/world.ts`: `World`, `Host`, `User`, `Group`; `createWorld` checks the structural rules
    and throws an `InvalidWorldError`; lookups by name and ID; `groupIdsOf` (like `id -G`);
    `replaceHostRoot` returns a world with a changed file system of one host.
    Hosts have no services, processes or network yet.
  - `src/credentials.ts`: `Credentials` (UID, primary GID, all GIDs), fixed at login.
  - `src/session.ts`: `Session` with host name, credentials, working directory, shell
    variables, the last exit status and the umask; `createSession` (starts in the home
    directory, or in `/` if the user cannot enter it, sets the login variables such as `HOME`
    and `PATH`, ADR 0046, and the umask of Debian 13's `pam_umask`, ADR 0048) and `userAtHost`
    (the `\u@\h` part of the prompt).
  - `src/world-builder.ts`: `buildWorld` creates a checked world from a short `WorldSpec`
    (users and groups by name, files as a map from absolute paths to contents); it creates
    missing parent directories and fills in defaults for owner, group, mode and mtime
    (ADR 0043). Tests use it, and the content loader (M2.2) will map levels onto it.
- **File system** (ADR 0042): tree of directories and files with owner, group, mode and mtime.
  - `src/path.ts`: `splitPath` and `joinAbsolute` for path strings. The file system treats `~`
    as a name; the shell expands it (`src/expand.ts`).
  - `src/permissions.ts`: `hasPermission` with exactly one class (owner, group, other) like the
    kernel; root may read, write and search everything and execute files with any x bit.
  - `src/lookup.ts`: `lookup` walks a path component by component from the root or the working
    directory, needs search permission on every directory on the way and returns the node with
    its canonical path, or `ENOENT`, `ENOTDIR` or `EACCES` as a value. `nodeAtCanonicalPath`
    walks a canonical path without checks, for files a redirection already opened (ADR 0050).
  - `src/collation.ts`: `compareNames` sorts names like Debian's en_US.UTF-8 locale (an
    approximation of glibc's collation, ADR 0046); glob results use it, `ls` will too.
  - `src/fs-write.ts`: `writeFile` creates, truncates or appends to a file like `open(2)` for
    `>` and `>>` (ADR 0048): kernel error order (`ENOENT`, `ENOTDIR`, `EACCES`, `EISDIR`), new
    files with the session's user, its primary group (or the group of a setgid directory) and
    the mode `0o666 & ~umask`, mtimes from the game clock. It copies only the directories on
    the changed path, puts the new root into a new world with `replaceHostRoot` and returns the
    file's canonical path. `writeToOpenFile` adds text to a file that a redirection opened
    before, without permission checks, and drops it if the file is gone (ADR 0049).
  - `src/fs-read.ts`: `openForReading` opens a file or directory like `open(2)` with
    `O_RDONLY` (lookup errors, read permission); a file gives its canonical path and content, a
    directory only errors on reading (ADR 0049). `readOpenFile` reads an opened file again
    without permission checks (ADR 0050).
- **Shell** (ADR 0007): lexer → parser → AST → interpreter. Expansion of variables, `~` and
  globs; pipelines; lists with `;`, `&&`, `||`; redirections; exit codes.
  - `src/lexer.ts`: `lex` splits an input text into word, control operator, redirection and
    newline tokens with offsets (ADR 0044). Words keep their parts (text, parameter, tilde)
    with a `quoted` flag, so the interpreter expands and globs only unquoted parts. Incomplete
    input and features the game does not simulate yet are returned as errors.
  - `src/parser.ts`: `parse` lexes an input text and builds the tree (ADR 0045): a `Script` of
    and-or lists, each a chain of pipelines with `&&`/`||`, each a list of simple commands with
    assignments, words and `<`/`>`/`>>` redirections. It finds tildes in assignments and
    returns bash's syntax errors, incomplete input and unsupported bash syntax as values.
  - `src/expand.ts`: `expandWords` turns the words of a command into fields in bash's order
    (ADR 0046): tilde and parameter expansion, field splitting with `IFS`, pathname expansion,
    quote removal. `expandAssignment` expands assignment values without splitting and
    globbing. Brace expansion is not simulated; `$$` and `$-` are returned as unsupported.
  - `src/glob.ts`: `expandPathname` matches `*`, `?` and bracket expressions against the
    directories of the session's host, with bash 5.2's default options and the read and
    search permissions of the session.
  - `src/interpreter.ts`: `runScript` runs a parsed input (ADR 0047): and-or lists with `&&`
    and `||`, pipelines whose commands run one after the other with the output of one as the
    input of the next (session changes inside a pipeline are lost like in a subshell), the exit
    status in `$?`, and assignments (shell variables, or only for one command before its name).
    Commands are `ShellCommand` functions found through a `CommandLookup`; they get a
    `CommandContext` with `stdout` and `stderr` writers and return their exit status and a
    changed world or session. The result has `ShellEvent`s: output and game notices for
    unsupported features, which stop the rest of the input. Unknown commands give bash's
    `command not found` and exit status 127.
  - Redirections (ADR 0049): after the assignments and before the command lookup, `<`, `>`,
    `>>`, `2>` and `2>>` open their targets from left to right (`openForReading`,
    `writeFile`). The command gets its `stdin` as a `StandardInput` (`terminal`, `text` or
    `directory`); a file from `<` is read with `readOpenFile` when the command starts, so
    `< f > f` sees the emptied file (ADR 0050). Output for a file is collected and added with
    `writeToOpenFile` after the command. A failed redirection writes bash's message and gives exit status 1 without running
    the command; file descriptors from 3 on and reversed forms (`0>`, `1<`) are game notices.
- **Commands:** registry of command implementations with declared options, a shared option
  parser and coreutils-style errors, matching Debian 13 (ADR 0004).
- **Full-screen programs:** one mechanism for `less`, `man`, `top`, `nano` and later `vim`.
- **Rule evaluation** (ADR 0011): rule types plus `all`, `any`, `not`, evaluated against world
  state and command output.
- **Events:** the engine emits structured events (output, game notices with message keys,
  screen clear, full-screen program start and end). It never produces translatable text.
- **Determinism** (ADR 0008, ADR 0043): injected game clock and seeded random generator;
  deterministic data generators.
  - `src/random.ts`: Mulberry32 generator created from a 32-bit seed.
  - `src/clock.ts`: `createGameClock(start)` gives a `GameClock` that stands still until its
    owner calls `advance`. `runScript` advances it by one second per input (ADR 0047); all
    other engine functions and the commands take the read-only `Clock` view (`now()`).
  - Data generators are added when a level needs them.
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
- Design tokens (colours, spacing, radii, shadows, motion, type scale) defined before the
  screens; colour schemes swap token values (ADR 0039).
- Colour schemes, optional effects, bundled fonts, UI sounds via Web Audio.
- All texts come from the catalogs; no hard-coded strings.

Current state (ADR 0033): `index.html` (with the strict Content Security Policy) loads
`src/main.tsx`, which asks the desktop API for the app info and renders the placeholder screen
(`src/app.tsx`). `src/styles.css` holds the first design tokens. `src/desktop-api.ts` defines
the preload contract (`DesktopApi`); `src/index.ts` exports only its types, for
`apps/desktop`.

## Desktop (`apps/desktop`)

- Electron main process: window and fullscreen, save slots and settings in the per-user data
  folder (atomic writes, backup), slot export and import.
- Preload: a small typed API; inputs are validated in the main process.
- Security baseline (ADR 0014): context isolation, sandbox, no Node integration in the
  renderer, strict Content Security Policy, no remote content, no network requests.
- Packaging with electron-builder: NSIS installer (Windows), AppImage (Linux).

Current state (ADR 0033):

```
apps/desktop/
  electron.vite.config.ts   builds main, preload and the renderer (root: apps/ui) into out/
  electron-builder.config.ts  packages out/ into the installer or AppImage in release/ (ADR 0034)
  build/                    app icons that electron-builder reads while packaging (ADR 0040)
  playwright.config.ts      end-to-end tests against the built and the packaged app
  src/main/index.ts         app start, hardening of all web contents and the session, IPC handlers
  src/main/window.ts        the main window
  src/main/web-preferences.ts  secure web preferences of every window
  src/main/security.ts      pure checks: allowed request URLs, trusted IPC senders
  src/preload/index.ts      exposes DesktopApi as window.penguinOps (built as CommonJS)
  src/shared/ipc-channels.ts  IPC channel names used by main and preload
  e2e/                      Playwright tests (*.spec.ts)
```

- `apps/desktop` may import only types from `@penguin-ops/ui` (the preload contract); ESLint
  enforces it.
- Requests: only the app's files (or the development server during `npm run dev`) and
  `data:`, `blob:`, `devtools:` URLs pass the `webRequest` filter; everything else is
  cancelled. New windows, navigation, `<webview>` and permission requests are denied.
- `apps/desktop` has three TypeScript projects (`tsconfig.lib.json`, `tsconfig.test.json`,
  `tsconfig.tooling.json`); they skip checking third-party declaration files because Electron's
  and electron-vite's declarations are not self-contained.

## Testing and CI

Test layers, quality gate and CI jobs: ADR 0015. Tests live next to the code (`*.test.ts`);
end-to-end tests in `apps/desktop/e2e/` (`*.spec.ts`).

- `npm run check` is the local quality gate: `format:check`, `typecheck`, `lint`,
  `test:coverage` and `check:licenses`, in this order; it stops at the first failing step.

- Vitest (ADR 0030): one root `vitest.config.ts` with one project per workspace that has tests
  (`engine`, `desktop`, `tooling` for `scripts/`). `npm test` runs them;
  `npm run test:coverage` also enforces at least 90 % coverage for `packages/engine/src`.
- Playwright (ADR 0033, ADR 0034): `npm run e2e` builds the app and starts it through Electron
  for each test (project `built`); no browser download is needed. `npm run e2e:packaged` runs
  the same tests against the unpacked app from the last `npm run package` (project
  `packaged`). Neither is part of `npm run check`.
- CI (ADR 0036): `.github/workflows/ci.yml` runs on every push to `main` and every pull
  request. The Linux job runs `npm run check`, the end-to-end tests (under `xvfb-run`), builds
  the AppImage and tests the packaged app. The Windows job runs `npm test`, the end-to-end
  tests, builds the installer and tests the packaged app. The documentation duty job runs
  `npm run check:docs-duty` (`scripts/check-docs-duty.ts`, rule in `scripts/docs-duty/`).
  Dependabot (`.github/dependabot.yml`) proposes grouped weekly updates.
- Packaging (ADR 0034): `npm run package` builds the app and runs electron-builder for the
  current platform: NSIS installer wizard on Windows, AppImage on Linux, both in
  `apps/desktop/release/`. Nothing is published by a build.
- App icon (ADR 0040): `apps/desktop/build/icon.ico` for Windows (executable, shortcuts,
  installer), `apps/desktop/build/icons/NxN.png` for the AppImage. On Linux the main window
  also sets the 256 px PNG as its icon; electron-vite copies it into `out/` through an
  `?asset` import. The source files and usage rules are in `assets/brand/README.md`;
  `scripts/brand-assets.test.ts` guards them.

## Claude Code setup

- `CLAUDE.md`: rules for every session; imports `docs/STATUS.md`.
- `.claude/rules/`: path-scoped rules (`engine.md`, `content.md`, `ui.md`) that load only when
  matching files are read.
- `.claude/skills/`: `/next`, `/wrap-up`, `/adr`; more are planned in the roadmap. `/adr` runs
  `npm run adr:new` (`scripts/new-adr.ts`, logic in `scripts/adr/`), which creates the next
  record from the template and updates the status lines of superseded records (ADR 0038).
- `.claude/settings.json` and `.claude/hooks/session-start.mjs`: a SessionStart hook that adds
  the git state to the context. It runs `node` in exec form, so it works on Windows and Linux.
- Details and reasons: ADR 0025.
