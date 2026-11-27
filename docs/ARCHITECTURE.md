# Architecture

> **Status: skeleton.** The workspaces exist with strict TypeScript configs (ROADMAP M0.2);
> the Electron app has its start, save slot, new game, settings and game screens with the pause
> menu,
> the terminal, the workplace layout, the ticket panel with hints, explanation and extra goals,
> the chapter inbox and the bundled content (M3.1–M3.5), and
> the engine has the core types of the
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
    styleguide/  development server and browser tests of the styleguide page (ADR 0083)
  content/       data only
    schemas/     generated JSON Schemas for editors (level.schema.json, world.schema.json)
    chapters.yaml
    levels/<level-id>/level.yaml, de.yaml, en.yaml
    ui/de.yaml, ui/en.yaml
    worlds/      shared base worlds (e.g. the company network, the playground)
  assets/brand/  logo SVGs and web icons, with usage rules (ADR 0040, ADR 0088, ADR 0089)
  docs/          documentation (see CLAUDE.md, "Where to find what")
  types/         shared type declarations (zod-url.d.ts: a type-only URL for the pure packages)
  .claude/       Claude Code skills, rules and hooks
  .impeccable/   shared configuration of the impeccable design skill (telemetry off, ADR 0080)
  PRODUCT.md     product truth for design work: users, purpose, positioning (ADR 0039, 0081)
  DESIGN.md      the visual world and design rules, read by impeccable (ADR 0039, 0081)
  .github/       CI workflows, Dependabot, pull request template (from M0)
  tests/content/ the content test: reads content/ and plays every reference solution (ADR 0078)
  scripts/       repository tooling in TypeScript, run directly by Node.js
                 (license-check/: the dependency license checker; docs-duty/: the
                 documentation duty check; adr/: new decision records; brand/: the plan,
                 PNG reader and ICO writer of the raster brand files)
  package.json         npm workspaces, root scripts, pinned Node.js version (engines)
  tsconfig.base.json   shared strict compiler options
  tsconfig.json        solution file: references all workspaces, the content tests and the tooling for `tsc --build`
  tsconfig.tooling.json  TypeScript project for `eslint.config.js`, `vitest.config.ts` and `scripts/`
  vitest.config.ts     test projects and coverage thresholds
  eslint.config.js     lint rules, including the package boundaries
  .prettierrc.json     formatting (Markdown is excluded, see .prettierignore)
```

Allowed dependencies: `engine` ← `content` ← `gameplay` ← `ui` ← `desktop`. The engine
depends on nothing project-internal (ADR 0006). `apps/styleguide` imports no workspace; it serves
the styleguide page of `apps/ui` by path (ADR 0083).

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
  - `src/session.ts`: `Session` with host name, credentials, working directory (as bash names
    it, ADR 0053), shell variables, the last exit status, the umask and the history list;
    `createSession` (starts in the home directory, or in `/` if the user cannot enter it, sets
    the login variables such as `HOME` and `PATH`, ADR 0046, `TERM=xterm-256color`, ADR 0056,
    the history variables of Debian's `.bashrc`, ADR 0057, and the umask of Debian 13's
    `pam_umask`, ADR 0048), `setVariable` (sets a shell variable; a new `HISTSIZE` applies to
    the history at once) and `userAtHost` (the `\u@\h` part of the prompt).
  - `src/history.ts` (ADR 0057, ADR 0066): the history list as readline 8.2 keeps it (entries
    with the player's unsaved edits, the numbering base, the limit from `HISTSIZE`).
    `recordHistory` saves an input with the rules of `HISTCONTROL`; the game calls it before it
    runs the input. `src/bash-number.ts` reads numbers like bash's `legal_number`.
  - `src/history-navigation.ts` (ADR 0066): Up and Down like readline's `previous-history`
    and `next-history`. `previousHistory` and `nextHistory` take the session, a
    `HistoryNavigation` (shown entry and saved new line) and the input line, keep the edit of
    the entry that was left in the history, and return the line to show and the bell;
    `acceptHistoryLine` gives the entry of a line that is run its original back.
  - `src/completion.ts` (ADR 0065): Tab completion like bash 5.2 with readline 8.2.
    `complete` takes the input line, the cursor, the session and the command names and returns
    the new line and cursor, the bell and the matches for the second Tab: variables, user
    names, command names, patterns and file names, quoted like bash. `formatCompletionList`
    lays out the matches in columns like readline, `completionQuestion` asks before 100 or more.
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
    approximation of glibc's collation, ADR 0046); glob results and `ls` use it.
  - `src/fs-write.ts`: `writeFile` creates, truncates or appends to a file like `open(2)` for
    `>` and `>>` (ADR 0048): kernel error order (`ENOENT`, `ENOTDIR`, `EACCES`, `EISDIR`), new
    files with the session's user, its primary group (or the group of a setgid directory) and
    the mode `0o666 & ~umask`, mtimes from the game clock. It copies only the directories on
    the changed path, puts the new root into a new world with `replaceHostRoot` and returns the
    file's canonical path. `writeToOpenFile` adds text to a file that a redirection opened
    before, without permission checks, and drops it if the file is gone (ADR 0049).
    The helpers for the immutable tree (finding the directory that holds a path's last
    component, copying the directories on a changed path) are in `src/fs-tree.ts`.
    `FileWrite.createMode` gives a new file other permission bits (`cp`, ADR 0062).
    `makeDirectory` is mkdir(2) (`EEXIST`, write permission on the parent, setgid inherited)
    and `setTimes` is utimensat(2) with its two permission rules: the current time for the
    owner or writers, other times for the owner only (`EPERM`). Access times are not kept
    (ADR 0060). `changeMode` is chmod(2) for root and the owner (ADR 0062).
  - `src/fs-remove.ts`: `removeEntry` is unlink(2) or rmdir(2) in the kernel's order of checks:
    write and search permission on the directory, the sticky bit (`EPERM`), the kind of the
    entry and `ENOTEMPTY` (ADR 0061). `src/fs-rename.ts`: `renameEntry` is renameat2(2) with or
    without `RENAME_NOREPLACE`; the node keeps its mtime (ADR 0063).
  - `src/fs-read.ts`: `openForReading` opens a file or directory like `open(2)` with
    `O_RDONLY` (lookup errors, read permission); a file gives its canonical path and content, a
    directory only errors on reading (ADR 0049). `readOpenFile` reads an opened file again
    without permission checks (ADR 0050). `openDirectory` reads a directory's entries (name and
    kind, like `d_name` and `d_type`) like opendir(3) and readdir(3), `.` and `..` included
    (ADR 0054, ADR 0055).
  - `src/file-status.ts`: `fileStatus` gives a node's stat(2) fields like ext4 with 4 KiB
    blocks: links, size in UTF-8 bytes (4096 for a directory), blocks of 512 bytes;
    `modeString` writes the mode string of `ls -l` (ADR 0055).
  - `src/calendar.ts`: `utcCalendarTime` turns a game time into a UTC date and time of day;
    the simulated hosts run on UTC (ADR 0055).
  - `src/display-width.ts`: `displayWidth` counts terminal cells like glibc's `wcwidth`, for
    `ls` in columns (ADR 0054).
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
    `CommandContext` with `stdout` and `stderr` writers and return a `CommandExit` (exit status
    and a changed world or session), a `CommandStop` with a `CommandNotice` (ADR 0052; it may
    keep the world changes made before the stop, ADR 0061) or a
    `CommandDiscard`, which ends the rest of the input like bash's `DISCARD` (only the subshell
    inside a pipeline, ADR 0057). The
    result has `ShellEvent`s: output, and game notices for unsupported features (`unsupported`)
    and from commands (`notice`), which stop the rest of the input. Unknown commands give
    bash's `command not found` and exit status 127. `ScriptRun.terminal` carries the
    terminal's width from the UI; a command gets it as `CommandContext.terminal` only if its
    standard output is neither piped nor redirected to a file, like `isatty(1)` (ADR 0054).
    That `CommandTerminal` can also clear the screen, which gives a `clear-screen` event at
    its place in the output (ADR 0056).
  - Redirections (ADR 0049): after the assignments and before the command lookup, `<`, `>`,
    `>>`, `2>` and `2>>` open their targets from left to right (`openForReading`,
    `writeFile`). The command gets its `stdin` as a `StandardInput` (`terminal`, `text` or
    `directory`); a file from `<` is read with `readOpenFile` when the command starts, so
    `< f > f` sees the emptied file (ADR 0050). Output for a file is collected and added with
    `writeToOpenFile` after the command. Commands learn which files their standard streams use:
    `text` input from `<` carries its `file`, and `CommandContext.stdoutFile` names the file of
    `>` or `>>` (ADR 0058). A failed redirection writes bash's message and gives exit status 1 without running
    the command; file descriptors from 3 on and reversed forms (`0>`, `1<`) are game notices.
- **Commands:** registry of command implementations with declared options, a shared option
  parser and coreutils-style errors, matching Debian 13 (ADR 0004).
  - `src/options.ts`: `parseOptions` splits a command's arguments into options and operands
    like glibc's `getopt_long` (ADR 0051): short option clusters, required and optional
    arguments, unambiguous abbreviations of long options, `--`, and operands between options
    (`permute`) or not (`require-order`). The `getopt` syntax reads like plain `getopt`,
    without long options (ADR 0056). Commands declare their complete real option table as
    `OptionSpec`s. Errors are values and keep the options read before them;
    `optionErrorMessage` and `tryHelpMessage` write glibc's and the coreutils' messages.
  - `src/command-registry.ts` (ADR 0052): `defineCommand` builds a command from its real option
    table, the ids of its simulated options and its usage error status. It parses the arguments
    before the command runs: an unsimulated option before the first error stops the input with
    the notice `option-not-simulated`, a parse error writes the usage error, and the command
    gets only valid, simulated options and its operands. Two optional hooks keep the order of
    the real command (ADR 0059): `obsoleteSyntax` reads a form that the command handles before
    `getopt_long` (`head -5`, `tail +5`), and `checkOption` rejects an option argument as soon
    as the command reads it (`head -n abc`); `usageErrorNote` adds lines before the Try line
    (`rm`'s hint for names that start with `-`, ADR 0061). `createCommandLookup` turns the registered
    commands (also plain `ShellCommand`s such as `echo`) into the interpreter's
    `CommandLookup`.
  - `src/grep-pattern.ts` (ADR 0064): GNU basic and extended regular expressions translated
    into JavaScript regular expressions, with glibc regcomp's errors and gnulib dfa's warnings.
  - `src/xstrtol.ts` (ADR 0059): gnulib's `xstrtoumax` and `xnumtoumax` for counts in
    arguments, with multiplier suffixes (`5k`, `2MiB`, `1kB`) and saturation at
    `UINTMAX_MAX`, as bigints.
  - `src/builtins.ts` (ADR 0053): `defineBuiltin` builds a bash builtin; `parseBuiltinOptions`
    reads options like bash's `internal_getopt`, also options with an argument (ADR 0057);
    invalid options and missing arguments give bash's message, the usage line and exit status
    2, and `--help` or unsimulated letters give the notice `option-not-simulated`.
  - `src/quote.ts`: `localeQuote` quotes operands in coreutils messages with `‘…’` like gnulib's
    `quote` in an English UTF-8 locale. `shellQuoteAlways` quotes file names in messages of
    `ls` and other file commands like `quoteaf` (`'x'`, `"it's"`, `$'\n'`), and `shellQuote`
    quotes only names that need it, as `ls` does on a terminal (ADR 0054). `src/utf8.ts`
    converts between text and UTF-8 bytes.
  - `src/commands/` holds the commands, one module each, and `COMMANDS`, the list for
    `createCommandLookup`. `cd`, `pwd`, `echo` and `history` are builtins (`history` lists, clears
    and deletes entries of the session's history list, ADR 0057). The game commands `help` and
    `hint` are builtins too: on the terminal they call `CommandTerminal.showGameOutput`, which
    gives a `game-output` event whose text the UI writes, into a pipe or a file they stop with the
    notice `game-output-not-simulated` (ADR 0103). `whoami`, `ls`, `cat`, `head`,
    `tail`, `mkdir`, `touch`, `rm`, `cp`, `mv` and `grep` use `defineCommand`. `clear` is ncurses'
    program with plain `getopt`: on the terminal it clears the screen, into a pipe or a file it
    writes the escape sequences of `xterm-256color`, the `TERM` that `createSession` sets (ADR
    0056). `ls` follows coreutils' `ls.c`: columns on a terminal, one name per line otherwise (ADR
    0054); `long-listing.ts` writes its long format with `-l`, `-g`, `-o`, `-G` and `-n` (ADR 0055).
    `cat` reads files and standard input and refuses to read its own output file like `cat.c`;
    `cat-format.ts` is the state machine of its formatting options, kept across all inputs of one
    run (ADR 0058). `head` and `tail` share `head-tail.ts` (headers, counts, opening inputs, output
    that must be valid UTF-8) and follow `head.c` and `tail.c`, also in how far a `-` reads standard
    input (ADR 0059). `mkdir -p` creates the directories on the way like gnulib's `mkancesdirs`, and
    `touch` combines open(2) and utimensat(2) like `touch.c` (ADR 0060). `rm` walks its operands
    like remove.c with gnulib's fts and stops with a notice where it would ask a question on the
    terminal (ADR 0061). `cp` follows `copy_internal` of copy.c, with the names of copies in a
    target directory from `file-names.ts` and copies of a directory into itself found by canonical
    paths (ADR 0062). `mv` tries rename(2) first and follows the move mode of `copy_internal` (ADR
    0063). `grep` follows grep.c with patterns from `grep-pattern.ts` (ADR 0064).
    `directory-names.ts` works out working directory names like bash (by text, keeping a leading
    `//`) and checks them like chdir(2) and getcwd(3); the session's `cwd` is the name bash
    remembers, not a resolved path.
- **Full-screen programs:** one mechanism for `less`, `man`, `top`, `nano` and later `vim`.
- **Rule evaluation** (ADR 0011, ADR 0067, `src/rules.ts`): rule types plus `all`, `any`,
  `not` as a discriminated union. `evaluateRule` checks a rule against the world, the player's
  session and the output of the last input (`terminalOutput` of its events): paths are
  absolute or start at the player's home `~`, and are looked up without permission checks.
  `checkRule` validates a rule for the content tests.
- **Events:** the engine emits structured events (output, game notices with message keys,
  screen clear, full-screen program start and end). It never produces translatable text.
- **Determinism** (ADR 0008, ADR 0043): injected game clock and seeded random generator;
  deterministic data generators.
  - `src/random.ts`: Mulberry32 generator created from a 32-bit seed.
  - `src/clock.ts`: `createGameClock(start)` gives a `GameClock` that stands still until its
    owner calls `advance`. `runScript` advances it by one second per input (ADR 0047); all
    other engine functions and the commands take the read-only `Clock` view (`now()`).
  - Data generators are added when a level needs them.
- **Completion and history:** APIs for tab completion (`src/completion.ts`, ADR 0065) and
  history navigation (`src/history-navigation.ts`, ADR 0066). The history list itself is part
  of the session (`src/history.ts`, ADR 0057). The UI owns the keys: it calls `complete` on Tab
  and lists the matches on a second Tab that follows a Tab without a change; it keeps a
  `HistoryNavigation` between Up and Down, and calls `acceptHistoryLine` on Enter; the level
  session then records the input with `recordHistory` (ADR 0077).
- **Prompt** (`src/prompt.ts`, ADR 0095): `primaryPrompt` gives the parts of Debian 13's colour
  prompt `\u@\h:\w\$ ` (`\w` from `PWD`, shortened with `~` like bash's
  `polite_directory_format`; `#` for root), `promptText` joins them, `CONTINUATION_PROMPT` is
  `PS2` (`> `), and `interruptInput` is Ctrl+C at the prompt (exit status 130). The UI draws the
  prompt in its own colours.

## Content (`packages/content` and `content/`)

- Level schema v1 (`src/level-schema.ts`, ADR 0010, ADR 0068): `levelSchema` checks a parsed
  `level.yaml` with zod and turns it into a `Level` with engine rules, numeric modes, a list of
  start files and filled-in defaults. `src/rule-schema.ts` holds the YAML form of the rules
  (one key per rule) and repeats the engine's rule checks, because content may only import
  engine types; a gameplay test keeps both in line. `src/level-json-schema.ts` generates the
  draft-07 JSON Schema `content/schemas/level.schema.json` (`npm run schemas:update`; a test
  fails when it is stale), which `.vscode/settings.json` maps to the level files.
- Loader (`src/level-loader.ts`, ADR 0069): `loadYaml(schema, file, text)` and
  `loadLevel(file, text)` take the text of a file that the caller has read (content stays
  pure) and return the value or a list of `ContentProblem`s with file, line, column and the
  path inside the data (`src/content-problem.ts`, `formatProblem` writes
  `file:line:column: path: message`). `src/yaml-source.ts` reads YAML 1.2 with the `yaml`
  library and finds the position of a path in the file; `src/schema-problems.ts` turns zod's
  issues into problems (unknown and missing fields, flattened unions).
- Chapters and all content (`src/chapters-schema.ts`, `src/content-loader.ts`, ADR 0070):
  `chaptersSchema` checks `content/chapters.yaml` (chapter IDs and their level IDs in order).
  `loadContent({ chapters, levels })` reads the chapters file and every `level.yaml` from
  `{ file, text }` pairs, then checks the files against each other: the folder name is the
  level ID, every listed level exists, every level is in exactly one chapter, and every
  chapter has a title `chapters.<id>` in the English UI catalog and no title lacks a chapter
  (`chapterTitleKey`, ADR 0099). It returns the
  chapters and the levels by ID in chapter order, or all problems of all files. The caller
  finds and reads the files; `sortContentFiles` (`src/content-files.ts`, ADR 0090) sorts files
  by their path (`content/...`) into the inputs of `loadContent` and reports files that are not
  content, for the content tests and the app alike.
- Base worlds (`src/world-schema.ts`, `src/file-entries-schema.ts`, ADR 0076):
  `baseWorldSchema` checks `content/worlds/<world-id>.yaml` (hosts with groups, users and
  literal files; the first host is the default host) and returns a `BaseWorld`; the checks
  across the fields of a host (unique names and IDs, root, primary groups, members, owners of
  files, UID and GID 1000 kept free for the player) run in a pipe after the fields are valid.
  `fileEntriesSchema` is the map of files shared by worlds and `start.files`.
  `loadContent` also takes `worlds` as `{ file, text }`, checks their names and that every
  level's world (default `office`), start host and the owners and groups of its start files
  exist, and returns the worlds by ID. `src/level-json-schema.ts` also generates
  `content/schemas/world.schema.json`. Building a level's world is gameplay's job, because
  content may only import engine types.
- Catalogs (`src/catalog-schema.ts`, ADR 0071): `levelCatalogSchema` checks the English and
  German catalog of a level (`title`, `ticket`, three `hints`, `explanation`, `extra_goals`,
  free text keys) and returns a `LevelCatalog`; `partialLevelCatalogSchema` does the same with
  every field optional for further languages; `uiCatalogSchema` flattens the nested UI texts to
  dotted keys. `loadContent` also takes `levelCatalogs` and `uiCatalogs` as `{ file, text }`,
  checks their names (language codes), that each level catalog belongs to a level, that none is
  given twice and that English and German exist, and returns `Catalogs` (`en`, `de`, `extra`)
  per level and for the UI.
- ICU MessageFormat (`src/message.ts`, ADR 0072): `checkMessage` parses a text with
  `@formatjs/icu-messageformat-parser` after taking out its code spans (literal) and doubling its
  apostrophes (always literal), and checks placeholder names and types and the plural options
  of the language; `formatMessage({ language, source }, values)` formats with
  `intl-messageformat` into parts: catalog text (may hold markup), values (never markup) and
  code. `src/catalog-texts.ts` checks every formatted text of a loaded catalog (not the literal
  commands of an explanation and the prose file contents) and reports problems at the spot in
  the text (`YamlSource.locateInText`); `loadContent` runs it for every catalog and rejects
  languages that `Intl` does not know.
- Markup (`src/markup.ts`, ADR 0073): `parseMarkup(parts)` turns the parts of a formatted
  message into `RichText`, a list of paragraphs and lists with text, code, bold and line breaks;
  only catalog text is searched for markers, never values. `formatText` formats and parses;
  `checkText` adds the markup checks (bold closed on its line and in its option, no empty bold,
  no empty list items) to the ICU checks. The UI renders the tree with its own elements, never
  as HTML.
- Completeness (`src/catalog-completeness.ts`, ADR 0075): `loadContent` compares every valid
  level's catalogs with the text keys and extra goals of its `level.yaml` (English and German
  complete, no unused keys in any language, a key never both file content and message, the
  same explanation commands as English) and the UI catalogs with English (German complete, no
  unknown keys, the same placeholders used in the same way).
- Language fallback (`src/language-fallback.ts`, ADR 0074): `levelTexts(catalogs, language)`
  and `uiTexts(catalogs, language)` give every text of a level or of the UI as a `CatalogText`
  (`{ language, source }`); a further language falls back to English text by text (hints and
  the option table as a whole), and each text keeps its own language for formatting.
  `missingTexts(content)` lists the texts of further languages that fall back, per catalog; they
  are reported, not errors.
- Format details: `docs/LEVEL-AUTHORING.md`.

## Gameplay (`packages/gameplay`)

- Level world (`src/level-world.ts`, ADR 0076): `levelWorldSpec` turns a base world and a level
  into the engine's `WorldSpec` for one player: the player's account (UID and GID 1000, home
  `/home/<name>` with mode 0700) on every host, the start files after the world's files on the
  start host, `~/` as the home and prose files from the catalogs. `isValidPlayerName` checks the
  player's name with the user name rules.
- User name (`src/user-name.ts`, ADR 0019, ADR 0093): `deriveUserName` turns the name the
  player types into a Linux user name, `checkUserName` returns the first problem of a user name
  as a code (or none), and `reservedUserNames` collects Debian's system accounts and every user
  and group of the base worlds, which a player cannot take.
- New game (`src/new-game.ts`, ADR 0017, ADR 0094): the game modes `story` and `sandbox`,
  `normalizePlayerName` and `checkPlayerName` (`empty`, `too-long`) for the player's name, and
  `NewGame`, what a save slot holds once the player has started a game. `GAME_START_TIME` is the
  game time a new game starts at (Monday, 2026-01-05, 08:00 UTC), and `startingLevelId` the
  first level of the first chapter, which a new game plays (ADR 0095).
- Level session (`src/level-session.ts`, ADR 0077): `startLevel` builds the world, logs the
  player in on the start host in `start.cwd` and can resume at a checkpoint by replaying the
  first reference solution. `runInput` returns `incomplete` for an input that needs another
  line, else records it in the history, runs it (or reports bash's syntax error or unsupported
  syntax) and `evaluate`s the rules: the goal or the next steps in order, extra goals, then
  tips while unsolved. It returns the new immutable `LevelSession`, the `TerminalEvent`s and
  the `GameEvent`s (`hint-requested` for every game command `hint`, then `step-completed`,
  `solved`, `extra-goal`, `tip`).
  `lastCompletedStep` is the checkpoint that save games keep. For the terminal (ADR 0095),
  `levelPrompt` gives the prompt of the player's shell, `completeInput` completes an input line
  with the simulated commands (`COMMAND_NAMES`), and `interruptLevelInput` is Ctrl+C.
- Reference solutions (`src/reference-solutions.ts`, ADR 0078): `checkReferenceSolutions`
  plays every level of the content in every language and with two player names and reports
  levels that cannot start, events before the first input, solutions with incomplete or
  unsimulated command lines or tips, unsolved tickets and checkpoints that cannot resume. The
  content test (`tests/content/`, its own TypeScript project with Node types) reads
  `content/` with `readContentFiles` (from disk, sorted by `sortContentFiles`), loads it and runs this check. It builds each level with
  `levelSetup` of the developer mode API.
- Developer mode API (`src/developer-mode.ts`, ADR 0079): `levelSetup` builds a level of the
  loaded content for a language and a player, `startAtStep` starts it at any step (by resuming
  at the checkpoint before it), `autoPlay` submits every line of a reference solution and
  returns each result, and `inspectRules` gives the state of the goal or each step, each tip
  and each extra goal with the state of every rule inside `all`, `any` and `not`. Unknown
  levels, steps and solutions throw a `DeveloperModeError`. The developer mode UI (M3.16)
  builds on it.
- Chapter inbox (`src/inbox.ts`, ADR 0017, ADR 0099): pure functions over the content's chapters
  and the levels started and solved (`CampaignProgress`). `openChapters` gives the open chapters
  (every chapter in Sandbox mode; in Story mode the first and each one whose earlier chapters
  are solved), `inbox` the open chapters with each ticket's state (`new`, `started`, `solved`),
  `nextTicket` the ticket offered after a solved one, and `isTicketOpen`, `chapterOf` and
  `ticketState` the single answers.
- Save game format (`src/save-game.ts`, ADR 0013, ADR 0104): `SaveGame` is what a save slot
  keeps: the new game's name, user name and mode, one game time for the whole game, the real play
  time and last played time, the current ticket and a `TicketRecord` per opened ticket (solved,
  checkpoint as a step ID, hints shown, reached extra goals). `newSaveGame` starts one,
  `serializeSave` writes it as JSON of format version `SAVE_FORMAT_VERSION` with its fields in a
  fixed order, and `parseSave` reads a file back without the content: it migrates an older
  version with `SAVE_MIGRATIONS` (`migrateSave`) and returns the save and the file's version or a
  `SaveProblem` (`not-json`, `not-a-save`, `too-new`, `invalid` with path). Example saves of every
  format version are stored byte for byte in `packages/gameplay/save-fixtures/`. `HINT_COUNT`
  (three hints per level) lives here too.
- Resuming (`src/resume.ts`, ADR 0106): `fitSaveToContent` makes a save match the content the game
  ships now (drops tickets, checkpoints and extra goals that no longer exist, gives a solved
  ticket with steps its last step as the checkpoint, moves a current ticket that was dropped or is
  not open to the first unsolved open ticket), `resumeTicket` starts a ticket at its checkpoint,
  solved if it was and with its reached extra goals, and `newTicketRecord` is the record of a
  ticket opened for the first time.
- Campaign, still planned: the playground (ADR 0017).
- Progress: XP, ranks, achievements (ADR 0018).
- Settings format (`src/settings.ts`, ADR 0013, ADR 0108): `Settings` holds the global settings
  (language, volumes, fullscreen, font size, colour scheme, effects, reduce motion) and
  `DEFAULT_SETTINGS` their defaults. `serializeSettings` writes them as JSON of format version
  `SETTINGS_FORMAT_VERSION` in a fixed order; `parseSettings` never refuses a file: it migrates
  an older version with `SETTINGS_MIGRATIONS` (`migrateSettings`), reads every setting on its
  own and gives the default for each one it cannot read (all defaults for a file that is no JSON,
  no settings file or too new), with a `SettingsProblem` per problem for the log. Example files of
  every format version are stored byte for byte in `packages/gameplay/settings-fixtures/`.
  `gameLanguage` turns the language setting and the system's locale into German or English
  (ADR 0012).

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
`src/main.tsx`, which loads the bundled content, asks the desktop API for the app info, reads the
settings (`loadSettings`), computes the reserved user names of the loaded worlds, reads the save
slots (`loadSlots`) and renders `src/app.tsx`, which shows the current screen (ADR 0091, ADR 0094): it
holds the screen as React state of the union type `Screen`, whose members carry their slot where
they need one, and picks the screen component with an exhaustive `switch`; screens get callbacks
such as `onPlay` and `onBack` and do not know each other. The app root also holds what each of
the three slots holds (`SlotState`) and saves the games (ADR 0106): a new game at once, every
autosave the game screen asks for, the game when the player leaves it and, through the desktop's
close handler, before the window closes; each save adds the real play time since the game screen
appeared and the real time as "last played" from the injected clock `now`, and the saves are
written one after the other. A failed save is logged and shown in the game screen's footer.
The app root keeps the global settings too (ADR 0109): it takes the game's language from them and
the system's locale (`gameLanguage`), creates the UI texts of that language and sets the
document's `lang`; it asks the desktop to set the window's fullscreen whenever the setting
changes (the first request shows the window) and stores a change that F11 or the system made,
which the desktop reports. A new language during a game saves the game and starts it again with a
new game screen (`run` in the `Screen` member `game`), every ticket from its checkpoint.

Saves (`src/saves/save-slots.ts`, ADR 0105, ADR 0106): `readSlot` decides from a slot's stored save
and backup whether it is empty, holds a game (fitted to the content) or is locked (`damaged`,
`too-new`, `user-name-taken`), and whether the backup must be restored or a migrated save written
again; `loadSlots` reads every slot through the desktop API and does those repairs. `readImport`
reads a file the player imports the same way, and `exportFileName` names an export.

Settings (`src/settings/settings-file.ts`, ADR 0108): `loadSettings` reads the settings file
through the desktop API at start and parses it with the gameplay package; a missing file gives the
default settings, and a file that cannot be read or parsed gives defaults with every problem in
the log (`describeProblem`). The file is not written back at start. `src/settings/use-settings.ts`
keeps the settings while the game runs (`useSettings`, ADR 0109): a change applies at once and is
written as the whole file, one write after the other; a change that changes nothing writes
nothing, and a failed write is logged and reported until a write works again.
`src/settings/document-settings.ts` applies the font size (the root element's font size in
percent, which scales every rem), "reduce motion" (the root's `data-reduce-motion`, which
`tokens.css` reads), the colour scheme (the root's `data-color-scheme`, whose rule in
`tokens.css` redefines every colour token) and the effects (the root's `data-glow` and
`data-scanlines`, which turn on the effect tokens `--effect-glow` and `--effect-scanlines` that
`.terminal` reads, unless "reduce motion" sets them to `none`) to the page
(`applyDocumentSettings`, ADR 0110, ADR 0111, ADR 0112). `src/token-contrast.ts` gives the
contrast pairs and minimums of every scheme (`contrastPairs`, `contrastMinimums`, `schemeTokens`),
which the design token test and the styleguide's scheme switch use, and checks the glowing text on
the ground its glow lights at most (`checkGlowContrast`, `GLOW_PEAK_COVERAGE`), a bound that the
styleguide's browser test measures.

Sounds (`src/sounds/`, ADR 0113): `ui-sounds.ts` describes the UI sounds (`click`,
`notification`, `goal`, `solved`) as recipes of tones, data that the tests check. `sound-player.ts`
plays them on a Web Audio context that opens with the first sound heard (`createSoundPlayer`,
made in `src/main.tsx` and given to the app as `sounds`), at the gain
`(master/100 × effects/100)²` (`effectsGain`), skipping a click that follows the last one within
`MIN_CLICK_GAP`; errors are only logged. `sounds-context.tsx` gives the screens the function that
plays a sound at the latest volumes (`SoundsProvider`, `useSounds`), and `controlSound` names the
click of a pressed button, a changed radio button or checkbox and a moved slider; the app root
listens for those events on the document, after React, and reads the volumes from
`SettingsKeeper.current`. `ticket-sound.ts` picks the sound of a change in the open ticket's
progress (`ticketSound`), which the game screen plays.

Content and texts (ADR 0090): `src/content/bundled-content.ts` imports every `.yaml` file of
`content/` as text with `import.meta.glob` at build time and loads it with `sortContentFiles`
and `loadContent` (zod set to `jitless` for the Content Security Policy); a problem throws a
`ContentLoadError`. The app root takes the language from the settings with `gameLanguage`, the
system's from `navigator.language`, which `main.tsx` passes as `locale` (ADR 0012, ADR 0108). `src/texts/ui-texts.ts` lists every UI
text key with its placeholders (`UI_TEXT_PLACEHOLDERS`, checked against both catalogs by a
test) and `createTexts` gives each text as rich or plain text and each chapter's title (`chapterTitle`,
ADR 0099); `src/texts/texts-context.tsx`
hands the texts to every component (`TextsProvider`, `useTexts`),
`src/texts/inline-text.tsx` draws a one-paragraph text with its markup, and
`src/texts/rich-text.tsx` draws a text of several paragraphs and lists (ADR 0073).

Screens: `src/screens/start-screen.tsx` shows the logo (`assets/brand/svg/`) as the level 1 heading,
the main menu (Play, Settings and Quit) with the keyboard focus on Play (on Settings on the way
back from them), and the version as code in the
footer. `src/screens/save-slot-screen.tsx` shows the title, the three save slots, a status line
for messages about a slot and Back; every slot is a button: an empty one opens the new game screen
for it, one with a game shows the player's name, the mode, the solved tickets, the play time and
when it was last played and resumes the game, a locked one says why and is `aria-disabled`; the
first slot, or the one the player comes back from, has the focus; Esc also goes back (ADR 0092,
ADR 0094, ADR 0106). Next to every slot, `src/screens/slot-menu.tsx` is a menu button after the
WAI-ARIA pattern with the slot's actions: Export for a game, Import for every slot, Delete for a
slot with a save (ADR 0107); Delete, and an import over a save, ask first in
`src/screens/confirm-dialog.tsx`, a modal alert dialog with the focus on Cancel. The app root
exports a slot's game through the desktop's save dialog with the suggested file name
`exportFileName`, and reads an imported file with `readImport`, which refuses files that are no
playable save with a reason the status line names. `src/screens/new-game-screen.tsx` is a form
with the player's name, the Linux user name (derived with `deriveUserName` until the player edits
it, checked with `checkUserName` against the reserved names) and the mode as two radio buttons drawn
as cards; each problem code has a catalog text in a live region that describes its field, and Start
creates the game only without problems (ADR 0093, ADR 0094). `src/screens/game-screen.tsx` is the
frame of the workplace layout as a CSS grid: top bar, side panel, terminal area and the key-hint
footer, whose "F1 Hint" and "Esc Menu" hints are buttons and whose "Tab Complete" hint is text,
because the terminal answers Tab itself. The side panel is `src/screens/side-panel.tsx`: the tabs
Tickets, Mail and Handbook after the WAI-ARIA tabs pattern, each with its panel and the cable colour
of its kind of work (ADR 0096); its tickets panel shows what the game screen gives it, and the game
screen keeps the chosen tab, because F1 brings the tickets panel to the front (ADR 0098). The game
screen keeps the game (ADR 0099): the ticket being played, the progress of every ticket the player
opened and the latest terminal state of each (`onStateChange`), so a ticket the player comes back
to goes on where they left it. It plays a save (ADR 0106): every ticket's progress is rebuilt from
its record (`progressFromRecord`), a ticket is resumed at its checkpoint (`resumeTicket`), and one
game time runs on across the tickets (ADR 0104). It reports the game as a save keeps it
(`onProgress`), asking for an autosave after every change of the progress or the open ticket. The
terminal and the ticket panel are keyed by the level, and the terminal's input line has the focus.
The terminal reports the game events of every input (`onGameEvents`), and the game screen adds
them up to the ticket's progress, which the ticket panel and the top bar's guide words (chapter,
ticket, step or state) show (ADR 0097). F1 or its key hint adds the next hint to that progress
(ADR 0098), and so does the game command `hint`, whose `hint-requested` event also brings the
Tickets tab to the front (ADR 0103). The Tickets tab shows the ticket below "Back to the inbox", with the next ticket after
solving, or the chapter inbox (ADR 0099). Esc opens
`src/screens/pause-menu.tsx`, a modal dialog (Continue, Settings, Main menu) over the game, whose
frame is `inert` while it is open; the pause state lives in the game screen (ADR 0092), which shows
the settings dialog that the app supplies (`settingsDialog`) in place of the menu.
`src/screens/settings-form.tsx` holds the settings themselves (the language, fullscreen, the
font size and reduce motion, ADR 0109, ADR 0110); `src/screens/settings-screen.tsx` shows them as a screen of the main menu and
`src/screens/settings-dialog.tsx` as a dialog in the game, which asks before a new language
restarts the tickets. The styles of all
screens are in `src/styles.css`. The visual world is "Label Tape & Patch Cable" (ADR 0081,
`DESIGN.md`); the workplace screen's direction contract is the impeccable surface brief
`.impeccable/surfaces/src-app-tsx.md`, and `.impeccable/design.json` is impeccable's sidecar to
`DESIGN.md`.

Tickets (ADR 0097, ADR 0098, ADR 0100): `src/tickets/ticket-progress.ts` is a pure model of the
ticket's progress (completed steps, solved, the step messages, tips and reached extra goals in the
order the game said them, the IDs of the reached extra goals, and how many hints the player asked
for) with `applyGameEvents`, `showNextHint` and `stepPosition`. `src/tickets/ticket-texts.ts`
formats a level's title, ticket text, hints, explanation and extra goal descriptions in the
player's language (`ticketTexts`), a step message or tip by its key (`messageText`) and an extra
goal's description by its ID (`extraGoalText`). `src/tickets/ticket-panel.tsx` draws the ticket:
title, a state row with the steps as tape segments or the solved state (`role="status"`), the
ticket text, the extra goals with their bonus XP and state, the hints shown so far and the
messages, each of the last two in its own polite live region, and after solving the explanation
with its variants and a command to try. The game screen formats the `TicketTexts` of every level once per language.
`src/tickets/inbox-panel.tsx` draws the inbox of `packages/gameplay`: each open chapter with its
title and how many tickets are solved, and each ticket as a row (`TicketRow`) that opens it, with
its state in words and the current one framed and marked with `aria-current`.
`src/tickets/next-ticket.tsx` draws the ticket offered after solving, the chapter it opened, or
that every open ticket is solved (ADR 0099).

Terminal (ADR 0095): `src/terminal/terminal-model.ts` holds the whole state of a terminal as an
immutable value (the level session, the game time, the screen with its finished lines, page start
and partial line, the input line and cursor, an incomplete input, the history navigation, the
Tab state, readline's question and the game events of the last input that ran) and has one pure
function per key: editing, history, Tab
with its list and question, Enter (which runs the input with `runInput` and shows its events),
Ctrl+C and Ctrl+L. `src/terminal/terminal-keys.ts` maps key presses to these actions (typed
characters come from the input field, never from key codes) and counts the columns that fit.
`src/terminal/terminal.tsx` draws the state as a scrolling log with the page after the last
clear at least as high as the terminal, Debian's colour prompt, a block cursor in the text colour
over a transparent text field the player types into, and game notices in the UI face with the
hint icon; it measures the cell width of the monospace face for the terminal's width.
`src/terminal/notice-text.ts` gives each notice its own text from the UI catalogs, keyed
`notices.<key>` by the command notice's key or the unsupported feature (ADR 0102).
`src/terminal/game-line.tsx` writes the texts of the game commands (ADR 0103): `help`'s overview
with `COMMAND_NAMES`, a command's description (`help-topics.<name>`), and the ticket's hint with
its number, which the terminal model gives each `hint` after the hints seen so far.

Design tokens (ADR 0082): `src/tokens.css` defines every token as a CSS custom property on
`:root`, named by purpose (colours, the terminal's character cell, spacing in quarter cells,
radius, line widths, the floating shadow, motion; durations drop to 0 ms with reduced motion).
`main.tsx` imports it before `src/styles.css`, which only reads tokens. `src/token-contrast.ts`
lists the colour pairs that must meet WCAG AA, using the contrast maths of
`src/color-contrast.ts`; `src/design-tokens.test.ts` checks the real stylesheets with
`src/css-rules.ts`, a small reader for the project's own CSS, which it imports with Vite's
`?raw`. The tokens also hold the font families, weights and the type scale, whose line heights
are whole quarter cells.

Fonts (ADR 0084, ADR 0085): `src/fonts/` holds the bundled WOFF2 files of Inter, JetBrains Mono
and Barlow Condensed, one folder per family with its license text `ofl.txt`, and
`src/fonts/fonts.css` with one `@font-face` per file. `main.tsx` imports `fonts.css` before
`tokens.css`; Vite bundles the files as assets of the renderer, so they load under
`font-src 'self'`. `src/fonts/fonts.test.ts` checks faces, files, licenses and the font tokens.
electron-builder copies the license texts to `resources/licenses/fonts/` of the installed app.

Icons (ADR 0086, ADR 0087): `src/icons/<name>.svg` holds one icon per file in a fixed SVG form
(one `<svg>` with the icon attributes, only empty `<path>` and `<circle>` elements).
`src/icons/icon.tsx` bundles the files as text with `import.meta.glob` and `?raw`, reads them
once at module load with the strict reader `src/icons/icon-svg.ts` and draws them as React
elements in the `Icon` component (`aria-hidden`, one cell in size through the `.icon` rule of
`styles.css`, colour from `currentColor`). `ICON_NAMES` lists every icon. `src/icons/path-data.ts`
reads path data and works out stroke bounds with caps and miter joins, so that
`src/icons/icon-rules.test.ts` can check whole-pixel coordinates and the margin of every file.

Styleguide (ADR 0083): `styleguide.html` loads `src/styleguide/main.tsx`, a page for developers
(English, not translated) that reads `tokens.css` with `?raw`, sorts every token into a section
by name prefix (`src/styleguide/token-catalog.ts`) and draws a sample of each with the real
stylesheets, plus the icons, the logo from `assets/brand/svg/` and the contrast pairs with their
ratios. Its layout is
`src/styleguide/styleguide.css`, which follows the token rules. The app never imports from
`src/styleguide/` and its build reads only `index.html`; both are tested.

`src/desktop-api.ts` defines
the preload contract (`DesktopApi`: `getAppInfo`, `quit`, `setCloseHandler`, and `saves`, the
save slot files as texts, ADR 0105, ADR 0106, `settings`, the settings file as a text,
ADR 0108, and `display`, the window's fullscreen, ADR 0109); `src/index.ts` exports only its types, for `apps/desktop`.

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
  electron-builder.config.ts  packages out/ into the installer or AppImage in release/ (ADR 0034),
                            with the font licenses in resources/licenses/fonts/ (ADR 0085)
  build/                    app icons that electron-builder reads while packaging (ADR 0040)
  playwright.config.ts      end-to-end tests against the built and the packaged app
  src/main/index.ts         app start, hardening of all web contents and the session, IPC handlers
                            (app info; quit; save files; export and import; settings file), each answering only the app's own page
                            and validating every argument
  src/main/close-guard.ts   holds the window's close back until the page has saved, at most 5 s
                            (ADR 0106)
  src/main/fullscreen.ts    shows the hidden window with the renderer's first fullscreen request
                            (or 5 s after its first paint), toggles fullscreen on F11 before the
                            page and the menu see it, and reports changes to the renderer
                            (ADR 0109)
  src/main/save-transfer.ts  export and import of a slot through the system's file dialogs:
                            checks the request, writes the text or reads the chosen file
                            (ADR 0107)
  src/main/save-store.ts    the save slot files in <userData>/saves as texts: atomic writes with
                            the replaced save as backup, restore, delete, one operation per slot
                            at a time (ADR 0105)
  src/main/settings-store.ts  the settings file <userData>/settings.json as a text: atomic
                            writes without a backup, one operation at a time (ADR 0108)
  src/main/stored-files.ts  reading a stored text with a size limit, atomic writes and copies
                            through a temporary file, rename retries on Windows (ADR 0105)
  src/main/timers.ts        replaceable timers for the guards' timeouts
  src/main/window.ts        the main window, hidden until the renderer sets fullscreen; it
                            answers the fullscreen requests of its own page
  src/main/web-preferences.ts  secure web preferences of every window
  src/main/security.ts      pure checks: allowed request URLs, trusted IPC senders
  src/preload/index.ts      exposes DesktopApi as window.penguinOps (built as CommonJS)
  src/shared/ipc-channels.ts  IPC channel names used by main and preload
  e2e/                      Playwright tests (*.spec.ts); the app is started with a fixed locale
                            (`--lang`, default en-US) and a new empty user data folder per test
                            (`--user-data-dir`); start-screen.spec.ts runs axe-core
```

- `apps/desktop` may import only types from `@penguin-ops/ui` (the preload contract); ESLint
  enforces it.
- Requests: only the app's files (or the development server during `npm run dev`) and
  `data:`, `blob:`, `devtools:` URLs pass the `webRequest` filter; everything else is
  cancelled. New windows, navigation, `<webview>` and permission requests are denied.
- `apps/desktop` has three TypeScript projects (`tsconfig.lib.json`, `tsconfig.test.json`,
  `tsconfig.tooling.json`); they skip checking third-party declaration files because Electron's
  and electron-vite's declarations are not self-contained.

## Styleguide (`apps/styleguide`)

Development-only workspace, never packaged (ADR 0083):

```
apps/styleguide/
  vite.config.ts        Vite server with root apps/ui on port 5190 (`npm run styleguide`)
  playwright.config.ts  starts that server and runs the tests in Playwright's Chromium
  e2e/styleguide.spec.ts  every token shown with its value and colour, every font face loaded,
                        the type scale on quarter cells, every icon at one cell in its text or
                        cable colour and hidden from screen readers, the logo files on the
                        surfaces and the signet sizes, keyboard focus, motion,
                        no console errors, axe-core with no violations at 1280 and 360 px
```

axe-core is injected from `axe-core/axe.min.js`; `@axe-core/playwright` is not used (license
exception only for axe-core). `STYLEGUIDE_CHROMIUM_PATH` points the tests at an installed
Chromium where Playwright's own cannot be downloaded.

## Testing and CI

Test layers, quality gate and CI jobs: ADR 0015. Tests live next to the code (`*.test.ts`);
end-to-end tests in `apps/desktop/e2e/` (`*.spec.ts`).

- `npm run check` is the local quality gate: `format:check`, `typecheck`, `lint`,
  `test:coverage` and `check:licenses`, in this order; it stops at the first failing step.

- Vitest (ADR 0030): one root `vitest.config.ts` with one project per workspace that has tests
  (`engine`, `content`, `gameplay`, `ui`, `desktop`, `content-tests`, `tooling` for
  `scripts/`). The `ui` project processes CSS so that tests can read stylesheets with `?raw`
  (ADR 0082). Component tests use Testing Library in jsdom, chosen per file with
  `// @vitest-environment jsdom` (ADR 0090). `npm test` runs them;
  `npm run test:coverage` also enforces at least 90 % coverage for `packages/engine/src`.
- Playwright (ADR 0033, ADR 0034): `npm run e2e` builds the app and starts it through Electron
  for each test (project `built`); no browser download is needed. `npm run e2e:packaged` runs
  the same tests against the unpacked app from the last `npm run package` (project
  `packaged`). Neither is part of `npm run check`. `npm run styleguide:test` runs the
  styleguide's browser tests in Playwright's own Chromium (ADR 0083); it is not part of
  `npm run check` either.
- CI (ADR 0036): `.github/workflows/ci.yml` runs on every push to `main` and every pull
  request. The Linux job runs `npm run check`, the end-to-end tests (under `xvfb-run`), builds
  the AppImage and tests the packaged app. The Windows job runs `npm test`, the end-to-end
  tests, builds the installer and tests the packaged app. The documentation duty job runs
  `npm run check:docs-duty` (`scripts/check-docs-duty.ts`, rule in `scripts/docs-duty/`).
  The styleguide job installs Playwright's Chromium and runs `npm run styleguide:test`.
  Dependabot (`.github/dependabot.yml`) proposes grouped weekly updates.
- Packaging (ADR 0034): `npm run package` builds the app and runs electron-builder for the
  current platform: NSIS installer wizard on Windows, AppImage on Linux, both in
  `apps/desktop/release/`. Nothing is published by a build.
- App icon (ADR 0040): `apps/desktop/build/icon.ico` for Windows (executable, shortcuts,
  installer), `apps/desktop/build/icons/NxN.png` for the AppImage. On Linux the main window
  also sets the 256 px PNG as its icon; electron-vite copies it into `out/` through an
  `?asset` import. The source files and usage rules are in `assets/brand/README.md`;
  `scripts/brand-assets.test.ts` guards them. Every raster brand file (app icons, favicon, Apple
  touch icon, social preview) is drawn from the colour SVGs by `npm run brand:rasters`
  (`scripts/generate-brand-rasters.ts`) in Playwright's Chromium, following
  `scripts/brand/raster-plan.ts`; the script runs by hand after a logo change (ADR 0089).

## Claude Code setup

- `CLAUDE.md`: rules for every session; imports `docs/STATUS.md`.
- `.claude/rules/`: path-scoped rules (`engine.md`, `content.md`, `ui.md`) that load only when
  matching files are read.
- `.claude/skills/`: `/next`, `/wrap-up`, `/adr`, `/new-level`; more are planned in the roadmap. `/adr` runs
  `npm run adr:new` (`scripts/new-adr.ts`, logic in `scripts/adr/`), which creates the next
  record from the template and updates the status lines of superseded records (ADR 0038).
- `.claude/skills/impeccable/`: the third-party design skill impeccable, a byte-for-byte copy
  of release `cli-v4.9.1` without its hook and subagents (ADR 0039, ADR 0080). Its launchers
  download a checksum-verified engine into `~/.impeccable/bin/`. Prettier and ESLint skip the
  folder; `scripts/impeccable-setup.test.ts` guards the pin, telemetry and the missing hook.
- `.claude/settings.json` and `.claude/hooks/session-start.mjs`: a SessionStart hook that adds
  the git state to the context. It runs `node` in exec form, so it works on Windows and Linux.
- Details and reasons: ADR 0025.
