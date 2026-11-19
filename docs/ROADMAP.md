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
- [x] M1.7a Command framework, part 1: shared option parser like GNU `getopt_long` (clusters,
      option arguments, abbreviations, `--`, permutation) with glibc's and coreutils' error
      messages (ADR 0051).
- [x] M1.7b Command framework, part 2: registry of commands with their option tables, reporting
      of unsimulated options and other game notices from commands as structured events
      (ADR 0007, ADR 0052).
- [x] M1.8a Commands batch 1, part 1: `pwd`, `cd`, `whoami`, `echo`, with the usage error
      format of bash builtins (ADR 0053).
- [x] M1.8b-1 Commands batch 1, part 2a: `ls` with `-a` and `-1`: several operands, columns for
      the terminal's width, shell quoting of names, errors (ADR 0054).
- [x] M1.8b-2 Commands batch 1, part 2b: `ls -l` (long format, `total`, owner and group names,
      dates), with `-g`, `-o`, `-G`, `-n` (ADR 0055).
- [x] M1.8c-1 Commands batch 1, part 3a: `clear` with the screen clear event, escape sequences
      into pipes and files, `TERM` in the session (ADR 0056).
- [x] M1.8c-2 Commands batch 1, part 3b: `history` (session history, `-c`, `-d`,
      `HISTCONTROL`, `HISTSIZE`) and option arguments for builtins (ADR 0057).
- [x] M1.9a Commands batch 2, part 1: `cat` with all its formatting options, standard input,
      errors and "input file is output file"; commands learn the files of their standard
      streams (ADR 0058).
- [x] M1.9b Commands batch 2, part 2: `head` and `tail` (`-n`, `-c`, headers for several
      files), with their obsolete forms and gnulib's counts (ADR 0059).
- [x] M1.9c Commands batch 2, part 3: `mkdir` (`-p`, `-v`) and `touch` (`-a`, `-c`, `-h`, `-m`,
      `-r`), with mkdir(2) and utimensat(2) in the file system (ADR 0060).
- [x] M1.10a Commands batch 3, part 1: `rm` (`-r`, `-f`, `-d`, `-v`), unlink(2) and rmdir(2) in
      the file system, questions on the terminal as a notice (ADR 0061).
- [x] M1.10b Commands batch 3, part 2: `cp` (`-r`, `-f`, `-v`, `-t`, `-T`), new files with the
      source's permission bits, copies of a directory into itself (ADR 0062).
- [x] M1.10c Commands batch 3, part 3: `mv` (`-f`, `-v`, `-t`, `-T`), rename(2) in the file
      system (ADR 0063).
- [x] M1.10d Commands batch 3, part 4: `grep` (`-i`, `-v`, `-n`, `-c`, `-r`, `-l` and the basic
      options around them), GNU patterns translated into JavaScript (ADR 0064).
- [x] M1.11a Tab completion API: file names, commands, variables and user names, quoted like
      bash, with readline's list for the second Tab (ADR 0065).
- [x] M1.11b History navigation API: Up and Down like readline, with the kept edits of history
      entries that `history` marks with `*` (ADR 0066).
- [x] M1.12 Rule engine: `cwd_is`, `exists`, `file_exists`, `dir_exists`, `file_contains`,
      `same_content`, `output_contains`, `output_matches`; `all`, `any`, `not` (ADR 0011,
      ADR 0067).

**Done when:** all commands of the prototype work with English names and messages; engine
coverage ≥ 90 %; the engine cannot import DOM or Node APIs (enforced).

## M2 Level system

- [x] M2.1 Level schema v1 (zod) and generated JSON Schema for VS Code (ADR 0068).
- [x] M2.2 Loader: `content/levels/*`, `content/chapters.yaml`, validation errors with file and
      line.
  - [x] M2.2a Load one YAML file from its text: YAML 1.2, problems with file, line, column and
        path, readable zod issues (ADR 0069).
  - [x] M2.2b `content/chapters.yaml` schema and loading all levels from a list of files, with
        cross-checks (folder name is the level ID, every level in exactly one chapter) (ADR 0070).
- [x] M2.3 Translations: level catalogs and `content/ui/<lang>.yaml`, ICU formatting, text markup
      (code, bold, lists, paragraphs) without HTML; English fallback for extra languages.
  - [x] M2.3a Catalog files: schemas of level and UI catalogs, loading them with the content,
        checks of file names and mandatory languages (ADR 0071).
  - [x] M2.3b ICU MessageFormat with `intl-messageformat`: syntax checked when loading,
        formatting with values and plurals (ADR 0072).
  - [x] M2.3c Text markup (`code`, **bold**, lists, paragraphs) parsed into a tree without HTML
        (ADR 0073).
  - [x] M2.3d English fallback for further languages; missing texts reported, not errors
        (ADR 0074).
- [x] M2.4 Content tests: schema, German/English completeness, reference solutions per language
      and with two user names, not solved at start, no tips on reference solutions.
  - [x] M2.4a Completeness checks in the loader: catalog keys against `level.yaml`, German
        against English, the same commands and placeholders in every language (ADR 0075).
  - [x] M2.4b Content test of `content/`: load it, report missing texts of further languages,
        play every reference solution per language and with two user names (ADR 0078); with
        the standard world `office` and the first prototype level `first-steps`.
- [x] M2.5 Gameplay core: level session (start, run command, evaluate goal, tips), steps and
      checkpoints, extra goals.
  - [x] M2.5a Base worlds: format of `content/worlds/<world-id>.yaml`, loading with the content,
        checks of a level's world, start host and start file owners (ADR 0076).
  - [x] M2.5b Level session core: build the level's world with the player's account, run an
        input (syntax errors, incomplete input, unsupported syntax), evaluate the goal.
  - [x] M2.5c Steps and checkpoints: steps in order, step messages, resuming at a checkpoint.
  - [x] M2.5d Tips and extra goals: each tip once while the ticket is open, extra goals once
        (ADR 0077 for M2.5b to M2.5d).
- [x] M2.6 Port the five prototype levels with English names and the prose/technical split as
      test content: `first-steps` (M2.4b), `printer-floor2`, `project-folders`, `switch-backup`
      and `disk-full` in the chapters `first-day`, `left-behind` and `tidying-up`.
- [x] M2.7 Developer mode API: load any level or step, auto-play a reference solution, inspect
      rule states (ADR 0079).
- [x] M2.8 `/new-level` skill.

**Done when:** adding a level means one folder with three files, and `npm run check` proves it
complete and solvable in both languages.

## M3 Game frame

The design language comes first (M3.0a–f), so that the screens are built on it instead of
inventing it along the way.

- [x] M3.0a Set up the impeccable design skill: project install of the skill only, pinned
      version, no design hook, telemetry off, live mode not used, `.gitignore` entries; check
      that it works in cloud sessions and on Windows.
- [x] M3.0b-1 Visual tone: `PRODUCT.md` and a seed `DESIGN.md` with `/impeccable init` and the
      direction workshop; the owner chose "Label Tape & Patch Cable" (ADR 0081).
- [x] M3.0b-2 Design tokens: semantic tokens for colours (default dark scheme, designed so
      that the colour schemes of M3.9 only swap values), spacing, radii, shadows and motion in
      `apps/ui`, following `DESIGN.md`; a test that text and background token pairs meet WCAG
      AA contrast; `DESIGN.md` regenerated from the tokens with `/impeccable document`.
- [x] M3.0c Styleguide page: a page outside the packaged app that renders all tokens with the
      real styles, opened by an npm script; Playwright test with axe check.
- [x] M3.0d-1 Typeface choice: JetBrains Mono and Inter (ADR 0020) and a tape face checked
      against alternatives and their licenses; the owner chose Barlow Condensed, Inter and
      JetBrains Mono (ADR 0084).
- [x] M3.0d-2 Typography: bundle the chosen fonts for offline use (weights, format, source,
      licenses), type scale tokens, the font tokens switched to the bundled faces; shown in the
      styleguide; checked by the owner on Windows (ADR 0085).
- [x] M3.0e-1 Icon style: rules (grid, stroke, corners) and the choice between three icon sets
      with allowed licenses (Lucide, Phosphor, Carbon) and own SVG icons, compared in a specimen
      page and a side panel mock-up; the owner chose own icons (ADR 0086).
- [x] M3.0e-2 Icons: the own icons as SVG files with tests of the rules (view box, stroke, caps,
      joins, `currentColor`), the first icons for the side panel tabs; shown in the styleguide
      (ADR 0087).
- [x] M3.0f-1 Logo take-over (done early, ADR 0040): the owner's brand package in
      `assets/brand/` (own penguin, not Tux, ADR 0021), clean SVGs with variants for dark and
      light backgrounds, logo in the README, test of the brand files.
- [x] M3.0f-2a Logo colours: the logo compared in three colour variants on the surface tokens
      and on light backgrounds; the owner chose the interface tokens `surface-terminal` and
      `text`, orange stays `player` (ADR 0088).
- [x] M3.0f-2b Logo files: regenerate the colour SVGs, the web icons and the app icons in the
      colours of ADR 0088 (brand README and brand test updated); show the logo in the
      styleguide; the raster files are drawn from the SVGs by `npm run brand:rasters` (ADR 0089).
- [x] M3.1 App screens: start screen with the logo, save slot screen, game screen, pause menu.
  - [x] M3.1a Start screen: the logo, the main menu with Quit and the version; the content
        bundled into the renderer and the UI texts in the system's language (ADR 0090).
  - [x] M3.1b Save slot screen with three empty slots until M3.7, Play in the main menu and the
        navigation between screens (ADR 0091).
  - [x] M3.1c Game screen frame and pause menu (Esc); empty slots start the game until M3.2
        (ADR 0092).
- [x] M3.2 New game flow: name, derived Linux user name (validation, editing), Story or Sandbox
      mode (ADR 0017, ADR 0019).
  - [x] M3.2a User name logic: derivation from the player's name, checks with problem codes and
        reserved names (ADR 0093).
  - [x] M3.2b New game screen: name, editable user name with the problem texts, Story or
        Sandbox, Start and Back; the slot keeps the game in memory until M3.7 (ADR 0094).
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

- Pictures or symbols on the mode cards of the new game screen, such as a trainee badge on
  Career and a sandbox on Sandbox (ADR 0094).
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
  (ADR 0033); the start screen and the texts context use them since M3.1a.
- The main window's background colour (`apps/desktop/src/main/window.ts`, shown before the
  page loads) is still the old `#0d1117` instead of the token `surface-ground`.
- Load the renderer through a custom `app://` protocol instead of `file://` (Electron security
  checklist, ADR 0033).
- Electron fuses for the packaged app, for example disabling `ELECTRON_RUN_AS_NODE` and Node.js
  command line options (ADR 0034).
- A generated JSON Schema for `content/chapters.yaml`, like the one for level files (ADR 0070),
  and for the translation catalogs (ADR 0071).
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
- History searches and keys (ADR 0066): Ctrl+R and the other incremental searches,
  `history-search-backward`, `beginning-of-history`/`end-of-history`, `M-.`.
- History details not simulated yet (ADR 0057): the history file (`HISTFILE`, `~/.bash_history`,
  `history -a/-n/-r/-w`, history kept across sessions), `HISTIGNORE` (setting it has no effect
  so far), time stamps with `HISTTIMEFORMAT`, `history -s`, `history -p`, and bash's `cmdhist`
  joining of multi-line commands with `;`.
- `cp -p`, `-a`, `-i`, `-n`, `-u`, `--parents`, `--backup` and links (`-l`, `-s`) (ADR 0062);
  `mv -i`, `-n`, `-u`, `--backup` and `--exchange` (ADR 0063).
- `grep -o`, `--color`, context (`-A`, `-B`, `-C`, `-NUM`), `-m`, `-f`, `-P`, `--include` and
  `--exclude` (ADR 0064).
- `rm -i`, `-I` and the answers to rm's questions, once the game simulates typing into a
  running command; `rm --no-preserve-root` with a safety net (ADR 0061).
- Options of M1.9c that give a notice (ADR 0060): `mkdir -m` (with the mode parser of
  `chmod`), `touch -d` (gnulib's `parse_datetime`), `touch -t` and `--time`, and access times
  (`touch -a` that can be seen, `ls -lu`).
- Completion details not simulated yet (ADR 0065): programmable completion like the
  `bash-completion` package (options, only directories after `cd`), variables in the directory
  part (`$HOME/Do`), hostname completion after `@`, and readline's other completion keys.
- `CDPATH` for `cd`; until then a non-empty `CDPATH` stops `cd` with a game notice (ADR 0053).
- A removed working directory (possible since `rm`, ADR 0061): `cd ..` finds the parent through the kernel,
  and bash forgets the directory's name after a failed `pwd -P` (ADR 0053); `ls .` and `ls ..`
  still work there (ADR 0054).
- Aliases and Debian's `alias ls='ls --color=auto'` from `/etc/skel/.bashrc`, with colour
  output in the terminal (ADR 0054).
- Exported variables (`export`, `env`), so that commands see only the environment and not every
  shell variable (`TABSIZE`, `QUOTING_STYLE` for `ls`, ADR 0054).
- Locale variables (`LANG`, `LC_ALL`, `LC_COLLATE`, `LANGUAGE`): all commands ignore them; a
  game notice when they change sorting, quoting or message language.
- `POSIXLY_CORRECT`: options stop at the first operand for all commands, and `ls -l` counts
  `total` in 512-byte blocks; the game ignores it so far (ADR 0055).
- Hard links (`ln`) and symbolic links (`ln -s`), with their link counts and `->` targets in
  `ls -l` (ADR 0055).
- Later chapters: firewall (`ufw`/`nftables`), nginx, Docker basics, disks (`lsblk`, `mount`,
  `fstab`), `sed`/`awk`, `git`.
