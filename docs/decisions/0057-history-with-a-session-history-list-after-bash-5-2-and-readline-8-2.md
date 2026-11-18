# 0057. history with a session history list after bash 5.2 and readline 8.2

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.8c-2 adds `history`, the last command of batch 1. Chapter 0 teaches it, and ROADMAP
M1.11 (history navigation with the arrow keys) needs a history list in the session. ADR 0007
already says that the command history is an engine API. Until now the session had no history.

`history` is a bash builtin. The list behind it belongs to readline, which bash 5.2 bundles in
version 8.2 (Debian's `bash` package uses the bundled copy). To get the details right, the
implementation follows the source code of bash 5.2.37 (`builtins/history.def`, `bashhist.c`,
`variables.c`, `builtins/bashgetopt.c`, `builtins/common.c`, `general.c`, `eval.c`,
`execute_cmd.c`) and `lib/readline/history.c`. Some findings shape the design:

- Bash saves each input line in the list before it runs it, so `history` lists itself and
  `history -d -1` deletes its own line. `HISTCONTROL` decides what is saved; Debian's
  `/etc/skel/.bashrc` sets `HISTCONTROL=ignoreboth` and `HISTSIZE=1000` for every new user,
  while root's `.bashrc` from `base-files` sets neither, so root gets bash's default
  `HISTSIZE=500`.
- `HISTSIZE` is a special variable: assigning it limits the list at once ("stifles" it). A
  value that is not a number keeps the previous limit, so the limit is state, not a pure
  function of the variable.
- `history` shows each entry with a number, which starts at `history_base`. The base grows when
  a full list drops its oldest entry. Readline 8.2's `stifle_history` sets the base to the
  number of removed entries instead of adding it, so a smaller `HISTSIZE` renumbers the kept
  entries.
- `history -d` takes an option argument, which `defineBuiltin` could not read (ADR 0053 left
  this open).
- `history 1 2` reports "too many arguments" through `no_args`, which jumps to the top level
  with `DISCARD`: the rest of the input does not run. Other builtins of later milestones
  (`shift`, `exit`) use the same path.

## Decision

- **The session has a history list.** `Session.history` is a `History` (`src/history.ts`):
  the entries, the base and the limit. `createSession` starts with an empty list, because the
  history file is not simulated, and sets `HISTSIZE` (1000 for users, 500 for root) and, for
  users other than root, `HISTCONTROL=ignoreboth`. `HISTFILE` and `HISTFILESIZE` stay unset.
- **The game saves each input with `recordHistory(session, input)`** before it parses and runs
  it, also an input that does not parse or that stops with a notice. It follows
  `check_add_history`: no empty input, `ignorespace` (a leading space, not a tab),
  `ignoredups` (equal to the newest entry), `erasedups` (removes older equal entries) and
  `ignoreboth`, read from `HISTCONTROL` at that moment. An input of several lines is one entry
  with its line breaks.
- **`HISTSIZE` takes effect when it is assigned.** `setVariable` in `src/session.ts` sets or
  unsets a shell variable and applies a new `HISTSIZE` with `applyHistorySize`, like
  `sv_histsize`: unset, empty or negative removes the limit, a number (cut to a C `int`)
  limits the list with readline's `stifle_history` (including its base quirk), anything else
  keeps the limit. The interpreter uses `setVariable` for all assignments, so temporary
  assignments before a command apply and are undone the same way.
- **`legalNumber`** in `src/bash-number.ts` reads numbers like bash's `legal_number`, for
  `HISTSIZE`, `history N` and `history -d`, and for later builtins.
- **`defineBuiltin` reads option arguments.** A builtin lists its letters with an argument in
  `withArgument`; `parseBuiltinOptions` takes the rest of the word (`-d5`) or the next word
  whatever it looks like (`-d -1`), as `internal_getopt` does. A missing argument gives
  `bash: NAME: -d: option requires an argument`, the usage line and exit status 2. The builtin
  gets the argument of the last occurrence of each option in `optionArguments`.
- **A command can discard the rest of the input.** The new `CommandDiscard` result
  (`{ discard: true, session? }`) is bash's `jump_to_top_level (DISCARD)`. Run by the shell,
  it ends the input without an event; the exit status becomes 1 unless it was non-zero before
  (`reader_loop`). Inside a pipeline it ends only the builtin's subshell with exit status 1
  (`subshell_exit`), and the pipeline goes on. Changes the builtin made before the error stay.
- **`history`** follows `history_builtin`:
  - Without options it lists the entries as `%5d  %s`; `N` lists the last N entries (a
    negative N after `--` counts the same, 0 lists nothing). An `N` that is not a number gives
    `numeric argument required` (exit status 1); a second operand gives `too many arguments`
    and discards the input.
  - `-c` clears the list and sets the base back to 1. Without operands it stops there, so
    `history -c -d 1` only clears; with operands it goes on with the cleared list.
  - `-d` deletes the entry at a position as listed, at a negative offset from the end, or a
    range `START-END` of both kinds. Wrong positions give `history position out of range`
    with exactly the text bash names (the whole argument, or only the failing end of a range);
    a range whose start comes after its end fails with exit status 1 and no message.
  - `-a`, `-n`, `-r`, `-w` (history file), `-p` (history expansion), `-s` and `--help` stop
    the input with the notice `option-not-simulated`. A non-empty `HISTTIMEFORMAT` stops a
    listing with the notice `variable-not-simulated`, because time stamps are not simulated.
- Tests mark the details that could not be checked on a real Debian 13 with `@differential`:
  root's history variables, the base after a smaller `HISTSIZE`, a `HISTSIZE` beyond 32 bits,
  and the exit status after a discard that follows a failed command.

## Alternatives considered

- **Let `runScript` save the input:** it gets a parsed script, not the text, and bash also
  saves inputs that do not parse. A separate function keeps the interpreter independent of
  the history and lets the terminal (M3.3) decide when an input is complete.
- **Work out the limit from `HISTSIZE` each time it is needed:** simpler, but wrong for values
  that are not numbers (bash keeps the old limit) and too late for `HISTSIZE=2; history`,
  where bash has already shortened the list.
- **Treat "too many arguments" as an ordinary failure with exit status 1:** the next command
  of the input would run, unlike in bash (`history 1 2; echo hi` prints nothing more there).
- **Set `HISTFILE` and `HISTFILESIZE` like bash:** they would name a file that the game never
  writes or reads. Without them the player sees no promise the game does not keep.
- **Fix readline's base quirk:** the numbers would look more sensible but differ from what the
  player sees on a real Debian 13.

## Consequences

- ROADMAP M1.11 can build history navigation on `Session.history`; the terminal (M3.3) calls
  `recordHistory` before it runs an input.
- Later builtins can use `withArgument`, `legalNumber` and `CommandDiscard` (`shift`, `exit`,
  `read -d`).
- Not simulated yet (ROADMAP ideas): the history file and `history -a/-n/-r/-w`, `HISTIGNORE`
  (setting it has no effect so far), time stamps with `HISTTIMEFORMAT`, `history -s`, history
  expansion and `history -p`, and bash's `cmdhist` joining of multi-line commands with `;`.
