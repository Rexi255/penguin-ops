# 0056. clear with a screen clear event and the terminal type xterm-256color

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.8c-1 adds `clear`. On Debian 13 it is the program of ncurses 6.5 (package
`ncurses-bin`), not a coreutil and not a bash builtin. Its source (`progs/clear.c` and
`progs/clear_cmd.c`) shows how it works:

- It reads its options with plain `getopt` and the option string `T:Vx`, not with
  `getopt_long`: `-T TERM` uses another terminal type, `-V` prints the curses version and
  exits, `-x` does not clear the scrollback. Every usage error, and any operand, writes a usage
  text to standard error and exits with status 1; there is no `--help`.
- It looks up the terminal type in `TERM` with `setupterm`. A missing or empty `TERM` gives
  `TERM environment variable not set.` and exit status 1.
- It writes the terminfo capabilities `clear` and `E3` to standard output, whether that is a
  terminal or not. For `xterm-256color` these are `ESC[H ESC[2J` (cursor to the top left, erase
  the screen) and `ESC[3J` (erase the scrollback). The terminal emulator clears when it reads
  them.

The game's terminal (ROADMAP M3.3) is a React component, not a terminal emulator, and the
session had no `TERM` yet. `docs/ARCHITECTURE.md` already plans a structured "screen clear"
event from the engine.

## Decision

- **The game's terminal type is `xterm-256color`.** `createSession` sets `TERM` to it
  (`TERMINAL_TYPE`), as an xterm-compatible terminal emulator or SSH client does on Debian 13.
- **A command whose standard output goes to the terminal gets a `CommandTerminal`** with the
  width and `clearScreen(clearsScrollback)`. The shell reports the call as the new `ShellEvent`
  `{ kind: "clear-screen", clearsScrollback }` at its place among the output events. The UI
  empties the screen (and the scrollback if `clearsScrollback`) and writes the following output
  from the top left. Commands that write into a pipe or a file get no terminal and cannot clear.
- **`clear` on the terminal** gives that event; `-x` keeps the scrollback. **Into a pipe or a
  file** it writes the escape sequences of `xterm-256color` like the real program
  (`clear > f` puts `ESC[H ESC[2J ESC[3J` into `f`).
- **The option parser gets a `getopt` syntax** (`OptionSyntax`) for programs that call plain
  `getopt`: an argument starting with `--` is a cluster of short options, so `clear --help` is
  `clear: invalid option -- '-'`. Option tables with long names are rejected in this mode.
- **`clear` follows `clear.c`:** options are acted on in order, so `-V` writes
  `ncurses 6.5.20250216` and exits even before a later invalid option or an operand. Errors
  write glibc's message (if any) and the usage text with exit status 1. `-T` stops the input
  with the notice `option-not-simulated`, following ADR 0052 (an unsimulated option before the
  first error wins).
- **`TERM`:** missing or empty gives ncurses' error; `xterm-256color` works; any other value
  stops the input with the notice `variable-not-simulated`, because the game has no terminfo
  database to know what that terminal type would do.

## Alternatives considered

- **Always write the escape sequences and let the terminal component interpret them:** the
  most faithful model, and `clear | cat` would clear as on Linux. But it makes the engine's
  output depend on a full terminal emulator in the UI, rules that check output would
  see control characters, and the architecture already promises a structured event. The game
  would still need its own clear handling for the case that matters most: `clear` on the
  terminal.
- **Always give the event, also into a pipe or a file:** simpler, but `clear > f` would leave
  `f` empty, which the game would teach wrongly.
- **Ignore `TERM`:** `clear` would work with any value, while on Linux `TERM=` or an unknown
  type makes it fail. Setting `TERM` also makes `echo $TERM` show what a real login shows.
- **Use `defineCommand` for `clear`:** its usage errors are the coreutils' (`Try 'clear --help'
  ...`) and it uses `getopt_long`; `clear` has neither.
- **Simulate `-T` for `xterm-256color` only:** rarely used, and other values would need a notice
  for the option anyway; the notice for every `-T` is simpler and honest.

## Consequences

- The terminal component (M3.3) handles `clear-screen` events. Ctrl+L, which readline maps to
  `clear-screen`, can use the same handling in the UI.
- Escape sequences that reach the terminal as text (`clear | cat`, `cat` of a file written by
  `clear`, `echo -e '\e[2J'`) are plain output for now; how the terminal component shows
  control characters is decided with M3.3.
- Later programs of ncurses or other tools that use plain `getopt` can use the `getopt` syntax.
- Shell variables have no export attribute yet; `clear` reads `TERM` from the session's
  variables, which is right as long as `TERM` stays exported, as it is after login.
- Tests whose details could not be checked against a real Debian 13 carry `@differential`: the
  curses version string.
