# 0054. ls in columns with shell quoting and the terminal width

- Status: Accepted
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M1.8b asks for `ls` with `-l`, `-a` and `-1`. That is too large for one work package,
so the owner agreed to split it: M1.8b-1 is `ls` without the long format (`-a`, `-1`, several
operands, columns, errors), M1.8b-2 adds `-l`.

Even without `-l`, `ls` depends on things the engine did not have: GNU `ls` writes names in
columns only when its standard output is a terminal (`isatty(1)`), lays them out for the
terminal's width (the `TIOCGWINSZ` ioctl), and quotes names on a terminal with gnulib's
`shell-escape` quoting style. Into a pipe or a file it writes one name per line, unquoted. Its
messages quote file names with `quoteaf` (`ls: cannot access 'x': No such file or directory`),
not with the typographic quotes of `quote` (ADR 0053). Real Debian users also get
`alias ls='ls --color=auto'` from `/etc/skel/.bashrc`, which the game has no mechanism for yet.

To get the details right, the implementation follows the source code of coreutils 9.7
(`src/ls.c`) and gnulib (`lib/quotearg.c`).

## Decision

- **The interpreter knows the terminal.** `ScriptRun` gets a required `terminal` with its width
  in `columns` (a whole number from 1 on, else a RangeError). `CommandContext.terminal` is that
  terminal if the command's standard output goes to it, and `undefined` if it goes into a pipe
  or a file, like `isatty(1)`. Redirecting standard input or standard error does not change it.
- **`openDirectory`** in `src/fs-read.ts` opens and reads a directory like opendir(3) and
  readdir(3): lookup errors, `ENOTDIR` for a file, `EACCES` without read permission; the names
  start with `.` and `..`.
- **`ls`** (`src/commands/ls.ts`) uses `defineCommand` with the complete option table of
  coreutils 9.7 and simulates `-a`/`--all` and `-1`; usage errors give exit status 2. It
  follows `ls.c`:
  - Operands are looked up first, in order; failures give `cannot access NAME: REASON`. The
    others are sorted with `compareNames`; files are listed first, then each directory, after a
    blank line and `NAME:` when there is more than one operand. A directory it cannot read
    gives `cannot open directory NAME: REASON` and no header. Every failure gives exit status
    2. Without operands it lists `.`; a removed working directory lists as empty.
  - Hidden names (starting with `.`) are skipped in directory listings unless `-a`; operands
    are always shown.
  - On a terminal without `-1`, names are laid out in columns like `calculate_columns` and
    `print_many_per_line`: filled from top to bottom, the most columns whose lines stay shorter
    than the terminal, two cells between columns, gaps filled with tabs (tab stops every 8
    cells) and spaces like `indent`. Otherwise one name per line.
  - On a terminal, names are quoted with `shellQuote` (gnulib's `shell_escape_quoting_style`);
    names of listed directories also when they contain `:`. In columns, if any name of a
    listing needs quotes, the other names get a leading space (`align_variable_outer_quotes`).
    Into a pipe or a file, names are written as they are.
  - `TABSIZE` (in columns) and `QUOTING_STYLE` stop the input with the notice
    `variable-not-simulated`. The game has no exported variables yet, so a plain shell variable
    counts too.
  - There are no colours: the game's `ls` behaves like `\ls` without Debian's alias.
- **Quoting functions** in `src/quote.ts`: `shellQuoteAlways` is gnulib's
  `shell_escape_always_quoting_style` (`quoteaf`) for file names in messages of `ls` and later
  `cp`, `mv`, `rm`: single quotes, `'\''` for a single quote, double quotes for a name whose
  only special character is an apostrophe (`"it's"`), `$'\n'` escapes for characters that are
  not printable. `shellQuote` is `shell_escape_quoting_style`: the name unchanged if a shell
  reads it back as it is, else `shellQuoteAlways`.
- **`displayWidth`** in `src/display-width.ts` counts terminal cells like glibc's `wcwidth`:
  combining marks and format characters 0, East Asian wide characters and emoji 2, others 1.
  Its table of wide characters covers the main blocks of Unicode's East Asian Width property
  and may differ from glibc for rare characters.

## Alternatives considered

- **Always one name per line:** simpler, but every player who knows Linux sees at once that
  `ls` looks wrong, and `ls | wc -l` and `ls` on the screen would no longer differ as they do.
- **Columns with spaces only:** the screen looks the same, but `ls -C > file` would later
  give different file content than Linux; GNU `ls` uses tabs when colours are off.
- **Simulate Debian's colour alias now:** it needs aliases, `dircolors` and colour output events
  in the UI. That is its own work package (ROADMAP ideas).
- **Pass the terminal width through the session:** the width belongs to the terminal, not to
  the shell's state, and must not be saved with the session.
- **Ignore `TABSIZE` and `QUOTING_STYLE`:** `ls` would silently write something different from
  Linux for a player who sets them.

## Consequences

- Every caller of `runScript` passes the terminal; the UI must send its real width and render
  tab characters with tab stops every 8 cells.
- M1.8b-2 adds `-l` on top of this listing (long format, `total`, owner and group names, the
  six-month date rule); `ls -l` stops with `option-not-simulated` until then.
- Known gaps: in a removed working directory, `ls .` and `ls ..` fail in the game, while Linux
  still finds both (as for `cd ..`, ADR 0053). Locale variables (`LANG`, `LC_ALL`) are ignored
  by all commands. Wide characters outside the table count as one cell.
- Tests that depend on details we could not check against a real Debian 13 carry
  `@differential` (escapes of control characters, wide characters, the leading space of file
  operands when another operand needs quotes), for the verification in M6.
