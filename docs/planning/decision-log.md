# Planning Decision Log

> **Temporary planning document.** It records every requirement and decision from the
> planning phase so that nothing gets lost. When the repository is set up, its content is
> moved into the permanent docs (`docs/decisions/`, `ARCHITECTURE.md`, `ROADMAP.md`,
> `CURRICULUM.md`, `LEVEL-AUTHORING.md`, `CLAUDE.md`, ...) and this file is deleted.
>
> Status values: **Decided** (owner confirmed), **Decided by Claude** (owner delegated or did
> not object), **Assumed** (needs confirmation), **Open** (not yet discussed).

Last updated: 2026-11-16 (after planning round 4)

---

## 1. Project in one paragraph

A learning game for Linux commands. The player works through support tickets in a fictional
IT department and learns Linux commands step by step inside a simulated terminal. The
learning curve is flat and relaxed: no time pressure, no failure states, only hints. The game
is a real desktop game (Windows installer, polished UI) and is fully open source under MIT.
The whole project is built with Claude Code; the owner steers through questions and reviews.

Prototype (single HTML file, about 1400 lines): https://claude.ai/artifact/ATxPWy9oUsvHPssgJwRiNd
It contains a simulated shell (pipes, `>`/`>>`, `;`/`&&`/`||`, globs, read-only predefined
variables, quoting, tab completion, history), a virtual file system with owner, group, mode
and mtime, 18 commands, 5 levels as data plus JavaScript `check`/`note` functions, XP, ranks,
hint bonus, level unlocking and an export code. Everything in it is German, including paths,
the user name (`azubi`), host names and shell messages; all of that must change (see 2.1).

Working title: **penguin-ops** (repo `Rexi255/penguin-ops`, already exists with a placeholder
README and an MIT LICENSE reading "Copyright (c) 2026 Jan"). Name and copyright holder are
still to be confirmed.

---

## 2. Binding requirements from the planning brief

### 2.1 Language rules

1. Everything in the repo and on GitHub is **English**: code, identifiers, comments, commit
   messages, branch names, test names, config, CI, all Markdown files (README, CLAUDE.md,
   CHANGELOG, CONTRIBUTING, docs, decision records, skills, rules), issues, pull requests,
   release notes. **Only exception:** translation files for game content (e.g. German texts).
2. Communication with the owner is **German**: planning chat and every Claude Code session
   (explanations, questions, summaries). This rule goes into `CLAUDE.md`.
3. The game is **bilingual (German/English)**, selectable in-game, stored, with a sensible
   default; more languages must be easy to add later.
   - Translated: UI, tickets, level titles, hints, explanations, story, ranks, game messages,
     output of the game commands `help` and `hint`.
   - Never translated (always English): everything inside the simulated Linux world:
     folder and file names, paths, commands and options, user/group/host names, domains,
     output and error messages of simulated Linux commands.
   - German and English are mandatory and must always be complete. Additional languages may be
     incomplete and fall back to English.
4. Architecture consequences: level data (file system layout, check rules, XP, order) is
   language-independent and separate from translatable text. Check rules never depend on
   translated text. Automated tests (also in CI): (a) mandatory languages complete for every
   level, otherwise CI fails; (b) every level solvable in every language; (c) missing texts in
   additional languages are reported without failing CI.

### 2.2 License and contributions

- Everything created in the project (code, levels, texts, docs) is **MIT**. Decided, no
  alternatives. Only real pitfalls are to be pointed out.
- Third-party content keeps its own license and must be compatible with distributing an MIT
  project. A **license allowlist** is defined during planning; anything not on it (especially
  GPL, AGPL, LGPL, MPL) needs the owner's approval first. A CI license check enforces it.
- `THIRD-PARTY-LICENSES.md` lists hand-added third-party content (fonts, images, sounds,
  copied code) with source and license. Dependency license texts for releases are generated
  automatically.
- Contributions are welcome in principle and come in under the same license. Question to
  answer: is DCO/CLA needed or do GitHub's terms suffice? (Simplest solution wanted.)
- The owner accepts that MIT allows closed-source and commercial reuse.

### 2.3 Documentation system (proposal, to be finalised)

```
penguin-ops/                 (working title)
  CLAUDE.md                  Entry point for Claude Code, short and concrete
  README.md                  For players: what it is, how to install and start it
  LICENSE                    MIT text
  THIRD-PARTY-LICENSES.md    Hand-added third-party content with source and license
  CONTRIBUTING.md            For contributors: setup, workflow, level and translation contributions
  CHANGELOG.md               Player-visible changes per version
  docs/
    ROADMAP.md               Milestones with checkboxes
    STATUS.md                Current state, updated with every work package
    ARCHITECTURE.md          How the project is built
    CURRICULUM.md            Which commands in which levels
    LEVEL-AUTHORING.md       How to write levels
    decisions/               One file per decision (at least: tech stack, simulation vs.
                             real shell, license)
  .claude/
    settings.json            Only if hooks are used
    rules/                   Rules with `paths` frontmatter (load only for matching files)
    skills/
      wrap-up/SKILL.md
      next/SKILL.md
  ...                        Code folders (see D-017)
```

One piece of information has exactly one place:

| Question | Place |
|---|---|
| Where are we going? | `docs/ROADMAP.md` |
| Where are we, what is next? | `docs/STATUS.md` |
| Why was it decided this way? | `docs/decisions/` |
| What changed? | git log (all technical changes), `CHANGELOG.md` (player-visible, per version) |
| How does the system work? | `docs/ARCHITECTURE.md` |
| How do I build, test, check? | Commands defined once (npm scripts); docs only name them |

`STATUS.md` format (English, max one screen, imported into every session): Recently completed
(last ~5 items), In progress, Next 3 steps (referencing roadmap items), Blockers and open
questions.

### 2.4 CLAUDE.md requirements

- English, under 200 lines, concrete and free of contradictions; it is context, not enforced
  configuration.
- Contains: purpose, tech stack, build/test/lint commands, code conventions, pointers to docs,
  and the import `@docs/STATUS.md`.
- Mandatory **language rule**: talk to the user in German; write everything in the repo and on
  GitHub in English; only exception are game-content translation files; inside the simulated
  Linux world everything is English (names, paths, commands, user/group/host names, command
  output and errors).
- Mandatory **license rule**: MIT project; check every new dependency, font, image, sound or
  copied code against the allowlist; anything else needs the user's approval; record
  hand-added third-party content in `THIRD-PARTY-LICENSES.md`.
- Mandatory **documentation duty**, part of every completed work package and in the same
  commit, without being asked: update `STATUS.md`; tick `ROADMAP.md`; new decision → new file in
  `docs/decisions/` (accepted records are never rewritten; a changed decision gets a new record
  that supersedes the old one); update `ARCHITECTURE.md`, `CHANGELOG.md` (Unreleased),
  `LEVEL-AUTHORING.md`, `CURRICULUM.md`, `THIRD-PARTY-LICENSES.md` when affected.
- Session start: in the first reply of a session, summarise the state from `STATUS.md` in 2–3
  German sentences and name the next step (Claude cannot speak first).
- Session end: after every completed work package, remind the user of `/wrap-up`.
- Guardrails: one small work package at a time; no unrequested scope growth; ask instead of
  guessing; tests with every code change; every level has an automated solvability test in
  every language; explain new concepts briefly; important decisions as decision records.
- Definition of Done per work package: code runs, format and lint clean, tests green, license
  check green (when dependencies changed), docs updated, commit made. Claude commits itself, in
  small commits with a consistent message format.

### 2.5 Skills and hooks

- Project skills in `.claude/skills/<name>/SKILL.md` with YAML frontmatter (`description` says
  when to use). Written in English; summaries and questions to the user in German.
- `/wrap-up` (`disable-model-invocation: true`): end-of-session check, not the main place for
  docs. Check git state; check docs are up to date for every work package and fill gaps; run
  tests, lint, license check; commit leftovers with an English message shown beforehand; short
  German summary.
- `/next`: read `STATUS.md` and `ROADMAP.md`, check git state, propose the next small step with
  a German explanation (why, what is new), wait for OK.
- Later candidates (build only when needed): `/new-level`, `/adr`.
- Hooks (in `.claude/settings.json`) are still to be discussed. Notes: `STATUS.md` is already
  imported, so a SessionStart hook is only useful for dynamic info (branch, uncommitted
  changes). A Stop hook runs after every reply, including questions, so a "STATUS.md updated?"
  check must not fire on every intermediate reply. Hooks must work on Windows too.

### 2.6 Deliverables of the planning phase

- A detailed project plan (German, in chat).
- Repo files in English, written directly into the repo and committed on the working branch:
  `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `LICENSE` (confirmed name), `THIRD-PARTY-LICENSES.md`,
  `CHANGELOG.md`, `docs/ROADMAP.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md` (marked as planned),
  `docs/CURRICULUM.md`, `docs/LEVEL-AUTHORING.md` (draft), first decision records (including
  tech stack, simulation vs. real shell, license), `.claude/skills/wrap-up/SKILL.md`,
  `.claude/skills/next/SKILL.md`, optional `.claude/rules/*` and `.claude/settings.json`,
  `.gitignore`, license allowlist configuration.
- Not included: code skeleton and CI workflow; they are the first work package in Claude Code.
- A start guide for the first Claude Code session (repo already exists, no `git init`).

---

## 3. Decisions

### Round 1: Foundation

**D-001 Audience: the owner first** (Decided)
The owner is the first and main player. The repo stays open source (MIT), but no community
infrastructure is built (no DCO/CLA, no issue templates, short CONTRIBUTING). Contributor docs
still matter because Claude Code in every new session is effectively a new contributor.

**D-002 Platforms** (Decided)
Windows is the primary target (owner's system). Linux is the secondary target (also used by
cloud sessions and CI). macOS is not officially supported.

**D-003 Development environment** (Decided)
Claude Code locally in VS Code on Windows, plus cloud sessions. Local setup: Node.js LTS and
Git. VS Code extensions: ESLint, Playwright, YAML (Red Hat, for schema completion).
Consequences to handle later: line endings (`.gitattributes`), hooks and scripts must run on
Windows and Linux.

**D-004 Time and quality** (Decided)
No deadline. Quality over speed. Milestones get acceptance criteria instead of dates.

**D-005 Commits** (Decided by Claude, owner did not object)
Claude commits after every completed work package (part of the Definition of Done).
`/wrap-up` only commits leftovers.

**D-006 Planning deliverables go straight into the repo** (Decided by Claude, owner did not object)
Files are written and committed on the working branch instead of being copied from chat.

### Round 2: Product form and stack (revised after the "real game" requirement)

**D-007 Product form: a real desktop game** (Decided)
Windows `.exe` with an installer wizard, polished game-like UI: own window and fullscreen,
main menu, settings, music and sound, visual effects. A terminal UI (TUI) was considered and
rejected because it cannot deliver this.

Reference games researched (2026-11-16):

| Game | Genre | Technology |
|---|---|---|
| The Farmer Was Replaced | Program a farm drone in a Python-like language | Unity |
| World of Haiku | Cyberpunk RPG with a simulated Linux environment | Unity |
| Bitburner | Terminal and scripting game, open source | TypeScript/React; Steam build is Electron |
| Hacknet | Hacking game in a fake terminal | C# with XNA/FNA |

Pattern: games with large 2D/3D worlds use game engines; terminal and text-centred games use
web technology or draw their own UI.

**D-008 Tech stack: TypeScript + HTML/CSS in Electron** (Decided)
Reasons: the core of the game is text and terminal, where HTML/CSS is strongest; Claude can
check its own UI via Playwright screenshots (Chromium is available in cloud sessions) and
visual regression tests; TypeScript is the language AI writes most reliably; strict
TypeScript plus the lint rule `switch-exhaustiveness-check` gives exhaustive-case checking;
the prototype (HTML/JS) can be ported directly; Electron needs only Node.js, renders
identically on Windows and Linux, and is proven for Steam games (Bitburner).
Rejected: Tauri (smaller, but Rust toolchain plus C++ build tools locally, different web engine
on Linux, error-prone v2 configuration), Godot 4 (best game feel out of the box, but Claude
would work mostly blind on visuals, GDScript is less reliable for AI), Unity (proprietary, does
not fit an MIT project, hard to build in CI), Rust TUI (no game-like UI).
Accepted downsides: installer about 80–120 MB, higher RAM use, game feel must be built by
hand, Electron must be updated regularly for Chromium security fixes.

**D-009 Simulation with reality check** (Decided)
Commands are simulated (no real shell). Later milestone: differential tests in CI run a
curated list of command cases both in the simulation and on a real Linux reference system and
compare stdout, stderr and exit code (exceptions for inherently different output such as
timestamps). Not part of the MVP. Real shell in a sandbox rejected (impossible on Windows
without WSL/Docker, hard to test, cannot show multiple servers or systemd well).

**D-010 Distribution** (Decided; Steam part Assumed)
Setup `.exe` with an installer wizard, built by CI and published on GitHub Releases. Unsigned
for now (Windows SmartScreen warning accepted; free open-source code signing exists via the
SignPath Foundation if ever needed). Linux package format still open (AppImage likely).
Steam: maybe later, nothing built for it now (owner wrote "2b", interpreted as 4B; confirm).
If Steam ever happens: USD 100 Steam Direct fee; the Steamworks SDK is not open source, its
redistributable DLL may ship with the game but the SDK must not go into the public repo.

**D-011 Web version** (Decided)
Possible later for the owner's own server, using the same frontend as static files. Not on
the roadmap for now.

### Round 3: Levels, check rules, languages

**D-012 Level format: YAML with a schema** (Decided)
One folder per level: `level.yaml` (language-independent data), `de.yaml`, `en.yaml` (texts).
Validated at build time with a zod schema; a JSON Schema generated from it gives VS Code
completion. Level IDs are stable strings (stored in save files, never changed). The format
has a version number; breaking changes come with a migration script for all levels. Level
order is defined outside the level files (exact mechanism to be specified in the architecture
docs).

Example (illustrative):

```yaml
# content/levels/printer-floor2/level.yaml
id: printer-floor2
teaches: [cat]
xp: 100
start:
  cwd: "~"
  files:
    "~/tickets/handover.txt": { text: handover }   # prose, text from de.yaml/en.yaml
    "~/tickets/printer-floor2.txt": |               # technical, always English
      Device:     Kyocera ECOSYS M3655idn
      IP address: 10.20.2.50
goal:
  output_contains: "10.20.2.50"
tips:
  - when: { output_contains: "10.20.0.41" }
    say: tip-wrong-printer
solutions:
  - ["cat ~/tickets/handover.txt", "cat ~/tickets/printer-floor2.txt"]
```

**D-013 Scalability: the "Ansible principle"** (Decided)
Level files are always pure data that say *what* happens. The engine provides the vocabulary
that knows *how*: rule types, world building blocks, deterministic data generators, multi-step
tickets, events (mails, service failures, ...). Each vocabulary item is TypeScript code with
its own tests and an entry in `LEVEL-AUTHORING.md`. Complex tasks grow the vocabulary, never
put code into levels.

**D-014 Check rules** (Decided by Claude on the owner's request)
Fixed rule types (e.g. `cwd_is`, `exists`, `file_exists`, `dir_exists`, `file_contains`,
`same_content`, `output_contains`, `output_matches`; later `mode_is`, `owner_is`,
`service_running`, `script_works`, ...) combined with `all`, `any`, `not`. Success never
depends on the typed command line, only on world state or output (optional technique tips are
a game design topic and never block). Tips use the same rules. Every level has at least one
reference solution; tests replay each solution in every language and assert: goal reached
afterwards, goal not reached at start, no tip fires on the reference solution. A missing rule
type is added to the engine with unit tests and docs, never as code in a level.

**D-015 Translations** (Decided)
YAML catalogs inside each level folder plus `ui/de.yaml` and `ui/en.yaml` for general texts.
ICU MessageFormat (`intl-messageformat`) for placeholders and plurals. A small markup in texts
(`code`, **bold**, lists, paragraphs; no HTML). German and English mandatory and complete (CI
fails otherwise); other languages may be incomplete with English fallback (CI reports). The
default language follows the OS locale; the choice is stored in the settings.

**D-016 Content of files in the virtual file system** (Decided)
Human-written prose (notes, mails, handovers, colleagues' READMEs) is translated; technical
files (configs, logs, `/etc/*`, scripts, data lists) stay English. In `level.yaml`,
`{ text: key }` marks translated content; literal content is English. Check rules and `grep`
tasks only reference technical content or language-neutral tokens (IPs, names, error codes).
The per-language solvability test enforces this.

### Round 4: Architecture and save games

**D-017 Repo layout: monorepo with npm workspaces** (Decided by Claude)
`packages/engine` (simulation), `packages/content` (levels, schema, loader), `apps/game` (UI),
`apps/desktop` (Electron main process, preload, installer config). Names are a proposal.

**D-018 Engine boundary** (Decided by Claude)
The engine has no access to DOM, Node APIs, file system, network or real time. Enforced by
its TypeScript configuration (no DOM/Node libs) plus a lint rule, so violations fail the build.

**D-019 Shell architecture** (Decided by Claude)
Lexer, parser, abstract syntax tree (AST), interpreter, from the MVP on, so that later shell
scripts (`if`, `for`, `while`, functions, `$(...)`) fit without a rewrite.

**D-020 Determinism** (Decided by Claude)
Injected game clock and seeded random numbers. Same input always gives the same output on
Windows, Linux and CI.

**D-021 UI framework: React with TypeScript** (Decided by Claude)
Most reliable combination for AI-written code; testable with Testing Library and Playwright.

**D-022 Build and packaging** (Decided by Claude)
Vite (via electron-vite) for building; electron-builder with an NSIS installer wizard
(install folder choice, desktop shortcut, uninstaller).

**D-023 Process model** (Decided by Claude)
The engine runs in the renderer (the UI process). The Electron main process only handles the
window, save files and settings, exposed through a narrow preload API. The same engine runs
unchanged in a later web version.

**D-024 Electron security baseline** (Decided by Claude)
Context isolation, sandboxed renderer, no Node integration, strict Content Security Policy,
no remote content, minimal preload API (save, load, settings).

**D-025 Offline and private** (Decided by Claude)
The game works fully offline and sends no telemetry.

**D-026 World scope: a small company network** (Decided)
The engine's data model supports several hosts from day one (each with its own file system,
users, groups, services, processes) and a network between them (`ping`, `ssh`, `scp`, `curl` to
internal services, internal name resolution). The MVP uses one host. Long-term goal (far
future, roadmap idea only): a small simulated internet.

**D-027 Save games: multiple slots** (Decided)
Several save slots (default 3), each with metadata (name, progress, current rank, play time,
last played). Settings (language, audio, display) are global, not per slot. Autosave after
every solved ticket (and every completed step) and on exit. Export and import per slot as a
file. Stored under `%APPDATA%\<app-name>\` (Electron `userData`). Write to a temp file and
rename (atomic), keep the last good version as backup, versioned format with migrations.

**D-028 Quitting in the middle of a ticket** (Decided)
Progress is kept; the current ticket restarts on next load. Multi-step tickets save a
checkpoint after every completed step.

**D-029 Developer mode** (Decided)
Hidden mode, enabled by a start parameter or key combination: jump to any level or step,
auto-play the reference solution, live display of check rules (met/unmet), switch language
during a ticket. Must be disabled in release builds, guarded by a dedicated test. Also used by
Claude for screenshot tests.

---

## 4. Verified facts from research (2026-11-16)

- Claude Code docs: target under 200 lines per `CLAUDE.md`; `@path` imports load fully at
  session start (they do not save context); `.claude/rules/*.md` without `paths` frontmatter load
  at every start, with `paths` only when matching files are read; project skills live in
  `.claude/skills/<name>/SKILL.md`, `description` is recommended, `disable-model-invocation: true`
  stops automatic invocation; committed project skills load in cloud sessions; there is no
  built-in `/next` or `/wrap-up`; hooks are configured in `.claude/settings.json`; SessionStart
  stdout is added to context; a Stop hook runs after every reply (with a loop guard); on
  Windows, hooks need Git Bash or PowerShell.
- Electron bundles Chromium, which includes an ffmpeg library under LGPL as a separate DLL
  (to be verified in the license round; affects the allowlist).

---

## 5. Open questions (later rounds)

- **Round 5, game design:** story and tone; progression structure (chapters, unlocks, boss
  tickets, mix/review tickets, side tickets); hints, XP, ranks and the conflict between a
  "no hint" bonus and the relaxed design; achievements; player name and Linux user name
  (replaces `azubi`); company name, host names.
- **Round 6, curriculum:** commands and concepts per chapter, relevance for IT specialists in
  system integration (Fachinformatiker Systemintegration); in-game Linux distribution and
  version (also the reference system for D-009).
- **Round 7, design and UX:** layout (fake desktop with apps vs. fixed layout), colour scheme,
  fonts (licence), sounds and music (sources, licences), accessibility, key bindings, onboarding,
  language switcher, settings menu.
- **Round 8, quality and workflow:** test strategy details, CI jobs, lint and format config,
  visual regression, npm license checker tool, line endings, branching vs. cloud-session
  branches, commit message convention, branch protection, repo visibility (private until MVP?).
- **Round 9, wrap-up:** MVP scope and milestones; name and branding (name conflict check);
  copyright holder name in LICENSE; license allowlist contents; DCO/CLA answer; final doc
  structure; extra skills; hooks.
- Confirm D-010 Steam assumption.
- Linux package format (AppImage vs. deb).

## 6. Parking lot (ideas, not planned)

- Small simulated internet (D-026).
- Web version on the owner's server (D-011).
- Steam release (D-010).
- Optional "real mode" chapter in WSL.
- Community translations.
- Auto-updater.
- Code signing via SignPath Foundation.
