# Roadmap

Milestones lead to version 0.1 (MVP: chapters 0–2 with the complete game frame, see
[ADR 0022](decisions/0022-mvp-scope.md)). Milestones have acceptance criteria instead of dates.
Each checkbox is one small work package (one or a few commits on `main`, ADR 0027). If a
package turns out too big, split it here first.

Rules: tick a box in the same commit that completes it. New ideas go to
[Ideas](#ideas-not-planned), not into a milestone, unless the owner agrees.

## M0 Foundation

- [x] M0.1 Repo settings (owner, guided by Claude): enable GitHub email privacy ("Keep my email
      addresses private", "Block command line pushes that expose my email"); make the
      repository public.
- [x] M0.2 Monorepo skeleton: root `package.json` with npm workspaces; `packages/engine`,
      `packages/content`, `packages/gameplay`, `apps/ui`, `apps/desktop`; strict TypeScript
      configs (engine and gameplay without DOM and Node types); Node LTS pinned.
- [x] M0.3 Formatting and linting: Prettier; ESLint with strict type-checked rules,
      `switch-exhaustiveness-check`, package boundary rules (TypeScript alone does not enforce
      the dependency direction for package-name imports, ADR 0026), no focused or skipped
      tests.
- [x] M0.4 Test setup: Vitest with coverage (engine threshold 90 %) and a first test (the seeded
      random generator); lint rule tests moved to Vitest (ADR 0030). Playwright moved to M0.7.
- [x] M0.5 License check: a tool that enforces `license-policy.json` for all npm dependencies
      (SPDX expressions, dev/runtime scope), as an npm script.
- [x] M0.6 `npm run check` (format, lint, types, tests, licenses); update the Commands section in
      `CLAUDE.md` and `CONTRIBUTING.md`.
- [x] M0.7 Electron window: electron-vite, React placeholder screen "PenguinOps", security
      baseline (ADR 0014), typed preload stub; `npm run dev` works on Windows; Playwright
      configuration with a first test against the window (ADR 0030).
- [x] M0.8 Packaging: electron-builder with NSIS installer wizard (install folder, shortcuts,
      uninstaller) and AppImage; `npm run package`.
- [x] M0.9 CI on every push to `main` and on outside pull requests: Linux job (all checks),
      Windows job (unit and content tests, installer build), documentation duty check, pull
      request template for outside contributors, Dependabot configuration.
- [x] ~~M0.10 Branch protection on `main` (owner, guided by Claude): block force pushes and
      deletion (ADR 0027).~~ Dropped: `main` stays unprotected (ADR 0037).
- [x] M0.11 `/adr` skill: new decision record from `docs/decisions/template.md` with the next
      number and supersede handling.

**Done when:** `npm run check` is green locally on Windows and in CI; `npm run dev` opens the
placeholder window; CI builds the installer.

## M1 Engine core

- [x] M1.1 Core types: world, host, file system node, user, group, session; multi-host-ready
      data model with one host (ADR 0009, ADR 0041).
- [x] M1.2 Virtual file system: paths (absolute, relative, `~`, `.`, `..`), owner, group, mode,
      mtime, lookup errors (ENOENT, ENOTDIR, EACCES), permission checks; a session starts in
      `/` when the user's home directory does not exist (ADR 0041, ADR 0042).
- [x] M1.3 Determinism: injected game clock, world builder from a spec (ADR 0008, ADR 0043).
      The seeded random generator was added in M0.4.
- [x] M1.4 Lexer: words, single and double quotes, escapes, operators, variables, `~`
      (ADR 0044).
- [x] M1.5 Parser: AST for simple commands, pipelines, lists (`;`, `&&`, `||`), redirections
      (`>`, `>>`, `2>`, `<`); bash-like syntax errors (ADR 0045).
- [x] M1.6a Interpreter, part 1, word expansion: shell variables in the session, tilde,
      parameters (`$?`), field splitting, pathname expansion, quote removal; sort order of the
      default English locale (ADR 0046).
- [x] M1.6b Interpreter, part 2, execution: lists (`;`, `&&`, `||`), pipelines, exit codes and
      `$?` through a minimal command interface; assignments; decide who advances the game clock
      (ADR 0047).
- [x] M1.6c-1 Interpreter, part 3a: write side of the file system (`writeFile` like `open(2)`
      for `>` and `>>`, session umask of Debian 13) (ADR 0048).
- [x] M1.6c-2 Interpreter, part 3b: redirections (`<`, `>`, `>>`, `2>`) on top of `writeFile`
      (ADR 0049).
- [ ] M1.7 Command framework: registry, shared option parser (including `--`), coreutils-style
      error formats, game notices as structured events (ADR 0007).
- [ ] M1.8 Commands batch 1: `pwd`, `cd`, `ls` (`-l`, `-a`, `-1`), `whoami`, `echo`, `clear`,
      `history`.
- [ ] M1.9 Commands batch 2: `cat` (`-n`), `head`, `tail`, `mkdir` (`-p`), `touch`.
- [ ] M1.10 Commands batch 3: `cp` (`-r`), `mv`, `rm` (`-r`, `-f`), `grep` (`-i`, `-v`, `-n`,
      `-c`, `-r`, `-l`).
- [ ] M1.11 Tab completion and history navigation APIs.
- [ ] M1.12 Rule engine: `cwd_is`, `exists`, `file_exists`, `dir_exists`, `file_contains`,
      `same_content`, `output_contains`, `output_matches`; `all`, `any`, `not` (ADR 0011).

**Done when:** all commands of the prototype work with English names and messages; engine
coverage ≥ 90 %; the engine cannot import DOM or Node APIs (enforced).

## M2 Level system

- [ ] M2.1 Level schema v1 (zod) and generated JSON Schema for VS Code.
- [ ] M2.2 Loader: `content/levels/*`, `content/chapters.yaml`, validation errors with file and
      line.
- [ ] M2.3 Translations: level catalogs and `content/ui/<lang>.yaml`, ICU formatting, text markup
      (code, bold, lists, paragraphs) without HTML; English fallback for extra languages.
- [ ] M2.4 Content tests: schema, German/English completeness, reference solutions per language
      and with two user names, not solved at start, no tips on reference solutions.
- [ ] M2.5 Gameplay core: level session (start, run command, evaluate goal, tips), steps and
      checkpoints, extra goals.
- [ ] M2.6 Port the five prototype levels with English names and the prose/technical split as
      test content.
- [ ] M2.7 Developer mode API: load any level or step, auto-play a reference solution, inspect
      rule states.
- [ ] M2.8 `/new-level` skill.

**Done when:** adding a level means one folder with three files, and `npm run check` proves it
complete and solvable in both languages.

## M3 Game frame

The design language comes first (M3.0a–f), so that the screens are built on it instead of
inventing it along the way.

- [ ] M3.0a Set up the impeccable design skill: project install of the skill only, pinned
      version, no design hook, telemetry off, live mode not used, `.gitignore` entries; check
      that it works in cloud sessions and on Windows.
- [ ] M3.0b Visual tone and design tokens: `PRODUCT.md` and `DESIGN.md` with `/impeccable init`
      and `document`; semantic tokens for colours (default dark scheme, designed so that the
      colour schemes of M3.9 only swap values), spacing, radii, shadows and motion in
      `apps/ui`; a test that text and background token pairs meet WCAG AA contrast.
- [ ] M3.0c Styleguide page: a page outside the packaged app that renders all tokens with the
      real styles, opened by an npm script; Playwright test with axe check.
- [ ] M3.0d Typography: check JetBrains Mono and Inter (ADR 0020) against alternatives and
      their licenses, bundle the chosen fonts for offline use, type scale tokens; shown in the
      styleguide.
- [ ] M3.0e Icon style: rules (grid, stroke, corners), choice between an icon set with an
      allowed license and own SVG icons, first icons for the side panel tabs; shown in the
      styleguide.
- [x] M3.0f-1 Logo take-over (done early, ADR 0040): the owner's brand package in
      `assets/brand/` (own penguin, not Tux, ADR 0021), clean SVGs with variants for dark and
      light backgrounds, logo in the README, test of the brand files.
- [ ] M3.0f-2 Logo and tokens: align the logo colours with the tokens of M3.0b (regenerate all
      brand files if a colour changes); show the logo in the styleguide.
- [ ] M3.1 App screens: start screen with the logo, save slot screen, game screen, pause menu.
- [ ] M3.2 New game flow: name, derived Linux user name (validation, editing), Story or Sandbox
      mode (ADR 0017, ADR 0019).
- [ ] M3.3 Terminal component: input, coloured output, history, tab completion, Ctrl+C/L/A/E,
      scrollback.
- [ ] M3.4 Workplace layout: top bar, side panel tabs, footer key hints (ADR 0020), built
      only from the design tokens and icons of M3.0b–e.
- [ ] M3.5 Ticket panel: chapter inbox, ticket text, hints (F1), explanation after solving,
      extra goals.
- [ ] M3.6 Game commands `help` and `hint`; engine notices rendered in the player's language.
- [ ] M3.7 Save system: three slots, metadata, autosave, atomic write and backup, versioned
      format with migration test, export and import (ADR 0013).
- [ ] M3.8 Settings: language (OS default), volumes, fullscreen (F11), font size, colour
      scheme, effects, reduce motion; language switch restarts the ticket.
- [ ] M3.9 Colour schemes and effects: retro CRT, Solarized and high contrast as value sets
      for the semantic colour tokens of M3.0b (contrast test for every scheme); optional glow
      and scanlines.
- [ ] M3.10 UI sounds via Web Audio with volume control.
- [ ] M3.11 Mail panel with toasts; handbook panel (searchable, grows with learned commands).
- [ ] M3.12 Ranks, XP and achievements framework; promotions as story moments.
- [ ] M3.13 Sandbox free play unlock rules.
- [ ] M3.14 Accessibility basics and automated axe checks; keyboard-only play test.
- [ ] M3.15 Screenshot tests of all main screens and the styleguide page in both languages and
      all colour schemes.
- [ ] M3.16 Developer mode UI (hidden) and a test that release builds disable it.
- [ ] M3.17 `/playtest` skill.

**Done when:** the five test levels are playable end to end in both languages; saves survive a
restart; all main screens are covered by screenshot tests.

## M4 Content: chapters 0–2

- [ ] M4.1 Story workshop with the owner: company, characters, host names, ranks, the
      predecessor mystery, running gags → `docs/STORY.md`.
- [ ] M4.2 Engine additions for chapters 0–2: full-screen program mechanism and `less`; `wc`;
      `rmdir`; `ls -l` details; glob brackets `[ ]`.
- [ ] M4.3 Chapter 0 "First day": tutorial tickets including the UI tour, review ticket,
      incident.
- [ ] M4.4 Chapter 1 "What others left behind": tickets, review, side tickets, incident.
- [ ] M4.5 Chapter 2 "Tidying up": tickets, review, side tickets, incident "Disk full!".
- [ ] M4.6 Extra goals and achievements for chapters 0–2.
- [ ] M4.7 Handbook entries for every command of chapters 0–2.
- [ ] M4.8 Playground world (Sandbox mode, and Story mode after chapter 0).

**Done when:** chapters 0–2 (about 25–30 tickets) are playable in both languages in Story and
Sandbox mode, and the owner has played them once.

## M5 Release v0.1

- [x] M5.1-1 App icon (done early, ADR 0040): ico and png in all sizes for the installer, the
      app, the AppImage and the Linux window; no icns (macOS is not supported, ADR 0002).
- [ ] M5.1-2 Logo polish: final polish of the logo and, if it changes, of the app icons.
- [ ] M5.2 Player README: install, start, SmartScreen note, screenshots.
- [ ] M5.3 Release pipeline: git tag → CI builds NSIS installer and AppImage → GitHub Release
      with notes from `CHANGELOG.md`; generated dependency license texts included.
- [ ] M5.4 Mutation test run on the engine; strengthen weak tests.
- [ ] M5.5 `/release` skill.
- [ ] M5.6 Full playthrough by the owner on Windows in both languages; fix findings.
- [ ] M5.7 Tag `v0.1.0`.

**Done when:** the installer from the GitHub Release installs and runs on Windows, the
AppImage runs on Linux, and chapters 0–2 are playable in both languages.

## After v0.1 (order to be refined)

- M6 Differential tests against the Debian 13 container (ADR 0004).
- M7 Chapters 3–4: searching and filtering, pipes and redirection.
- M8 `nano` and chapter 5.
- M9 Chapters 6–7: users, groups and permissions; processes and resources.
- M10 Chapter 8: services and logs.
- M11 Multi-host engine, network and SSH: chapters 9–10.
- M12 Chapters 11–14: software, backup, scripts, finale.
- Background music (owner chooses tracks), screen reader support.

## Ideas (not planned)

- A small simulated internet beyond the company network (ADR 0009).
- Web version on the owner's own server (ADR 0002).
- Steam release (ADR 0002).
- Optional "real mode" chapter in WSL.
- Community translations.
- Auto-updater (needs network access, ADR 0014).
- Code signing via SignPath Foundation.
- Key remapping.
- `.deb` package.
- Set `desktopName` and `linux.syncDesktopName` for electron-builder, so that Linux desktops
  link the running window to the AppImage's desktop entry (electron-builder warns about it,
  ADR 0040).
- ESLint rules for React hooks (`eslint-plugin-react-hooks`) once components use hooks
  (ADR 0033).
- Load the renderer through a custom `app://` protocol instead of `file://` (Electron security
  checklist, ADR 0033).
- Electron fuses for the packaged app, for example disabling `ELECTRON_RUN_AS_NODE` and Node.js
  command line options (ADR 0034).
- Upgrade to TypeScript 7 once `typescript-eslint` supports it (ADR 0026).
- Lint rules that enforce ADR 0008 in engine and gameplay: ban `Date.now()`, `new Date()`
  without arguments, `performance.now()` and `Math.random()`.
- CI starts the packaged AppImage itself (not only the unpacked app), so that the M5 criterion
  "the AppImage runs on Linux" is verified without a Linux machine of the owner.
- `vim` side chapter; Rocky Linux side chapter ("the new customer runs Rocky Linux").
- Shell features that are not simulated yet (ADR 0044, ADR 0045, ADR 0046): history expansion
  (`!!`, `!$`), command substitution, brace expansion, here-documents, file descriptor
  duplication (`2>&1`, common in tutorials), `&>`, pipeline negation (`!`), the `time` keyword,
  the special parameters `$$` and `$-`.
- Command lookup through `PATH` and executable files (`./run.sh`, `/bin/ls`), so that
  `PATH= ls` fails like in bash (ADR 0047).
- Later chapters: firewall (`ufw`/`nftables`), nginx, Docker basics, disks (`lsblk`, `mount`,
  `fstab`), `sed`/`awk`, `git`.
