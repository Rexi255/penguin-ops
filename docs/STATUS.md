# Status

_Last updated: 2026-11-18_

## Recently completed

- M1.9b `head` and `tail` (coreutils 9.7): `-n`, `-c` (`head` with `-N` for "all but the
  last", `tail` with `+N` from the start), headers with `-q`/`-v`, `-z`, the obsolete forms
  (`head -5c`, `tail +5`, `tail -5f`), gnulib's counts with suffixes (`src/xstrtol.ts`), how far
  a `-` reads a pipe or file. `defineCommand` gets the hooks `obsoleteSyntax` and `checkOption`;
  `tail -f` gives a notice (ADR 0059).
- M1.9a `cat` (coreutils 9.7): files and standard input (`-`, read once), all formatting
  options (`-b`, `-n`, `-s`, `-v`, `-E`, `-T`, `-A`, `-e`, `-t`, `-u`) as a translation of
  `cat.c`'s state machine that carries over between files, errors with `quotef` names, "input
  file is output file" like `cat.c` (`cat a >> a`), and the new notice
  `terminal-input-not-simulated` for `cat` on the terminal. Commands learn the files of `<` and
  `>`/`>>` (`stdin.file`, `stdoutFile`) (ADR 0058).
- M1.8c-2 `history`: the session keeps a history list (`recordHistory` with
  `HISTCONTROL=ignoreboth`, `HISTSIZE` applied on assignment with readline's numbering);
  `history`, `history N`, `-c`, `-d` with positions, negative offsets and ranges, bash's errors;
  file options and `HISTTIMEFORMAT` give notices. Builtins read option arguments; the new
  `CommandDiscard` ends the input like bash's `DISCARD` (ADR 0057).
- M1.8c-1 `clear` (ncurses 6.5): on the terminal a new `clear-screen` event (with or without the
  scrollback, `-x`), into pipes and files the escape sequences of `xterm-256color`; `-V`,
  ncurses' usage text, `TERM` errors and notices. Sessions set `TERM=xterm-256color`; commands
  on the terminal get a `CommandTerminal`; `parseOptions` has a `getopt` syntax without long
  options (ADR 0056).
- M1.8b-2 `ls -l` and `-g`, `-o`, `-G`, `-n`: mode string with `s`/`t`, links, owner and group
  names (IDs without a name), sizes, `total` in KiB of 4 KiB blocks, dates in UTC with the
  six-month rule, `?` lines and exit status 1 for entries that cannot be stat'ed. New
  `fileStatus`, `modeString`, `utcCalendarTime`; `openDirectory` returns the kind of each entry;
  the simulated hosts run on UTC (ADR 0055).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.9c: `mkdir` (`-p`) and `touch`.
2. ROADMAP M1.10: commands batch 3 (`cp`, `mv`, `rm`, `grep`).
3. ROADMAP M1.11: tab completion and history navigation APIs.

## Blockers and open questions

- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- Some `ls`, `clear`, `history`, `cat`, `head` and `tail` details could not be checked against a
  real Debian 13 (tests marked `@differential`, ADR 0054 to ADR 0059); M6 verifies them.
