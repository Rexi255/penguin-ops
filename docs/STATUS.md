# Status

_Last updated: 2026-11-18_

## Recently completed

- M1.8c-1 `clear` (ncurses 6.5): on the terminal a new `clear-screen` event (with or
  without the scrollback, `-x`), into pipes and files the escape sequences of
  `xterm-256color`; `-V`, ncurses' usage text, `TERM` errors and notices. Sessions set
  `TERM=xterm-256color`; commands on the terminal get a `CommandTerminal`; `parseOptions`
  has a `getopt` syntax without long options (ADR 0056).
- M1.8b-2 `ls -l` and `-g`, `-o`, `-G`, `-n`: mode string with `s`/`t`, links, owner and
  group names (IDs without a name), sizes, `total` in KiB of 4 KiB blocks, dates in UTC with
  the six-month rule, `?` lines and exit status 1 for entries that cannot be stat'ed. New
  `fileStatus`, `modeString`, `utcCalendarTime`; `openDirectory` returns the kind of each
  entry; the simulated hosts run on UTC (ADR 0055).
- M1.8b-1 `ls` without the long format: `-a`, `-1`, several operands (files first, then
  directories with `NAME:`), columns for the terminal's width with tabs like GNU `ls`, shell
  quoting of names on a terminal (`'my file'`, `"it's"`), one name per line into pipes and
  files, `cannot access`/`cannot open directory` with exit status 2. Commands learn whether
  their output goes to the terminal and its width (`ScriptRun.terminal`); new
  `openDirectory`, `shellQuote`, `shellQuoteAlways`, `displayWidth` (ADR 0054).
- M1.8a First commands: `cd` (`-L`, `-P`, `-e`, `cd -`, names worked out by text like bash,
  with its fallback to chdir), `pwd` (`-L`, `-P`), `echo` (`-n`, `-e`, `-E`) and `whoami`;
  `defineBuiltin` gives bash builtins bash's option parsing and usage errors; new notices
  `variable-not-simulated` (`CDPATH`) and `invalid-utf8-not-simulated` (`echo -e '\xff'`);
  coreutils operands are quoted with `‘…’` (ADR 0053).
- M1.7b Command registry: `defineCommand` builds a command from its real option table, its
  simulated option ids and its usage error status; an unsimulated option before the first
  error stops the input with the game notice `option-not-simulated`, parse errors give the
  coreutils' usage error, and `createCommandLookup` registers the commands. Commands return a
  `CommandExit` or a `CommandStop` with a `CommandNotice` (ADR 0052).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.8c-2: `history` (session history, `HISTCONTROL=ignoreboth`).
2. ROADMAP M1.9: commands batch 2 (`cat`, `head`, `tail`, `mkdir`, `touch`).
3. ROADMAP M1.10: commands batch 3 (`cp`, `mv`, `rm`, `grep`).

## Blockers and open questions

- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- Some `ls` and `clear` details could not be checked against a real Debian 13 (tests marked
  `@differential`, ADR 0054, ADR 0055, ADR 0056); M6 verifies them.
