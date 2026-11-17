# Status

_Last updated: 2026-11-17_

## Recently completed

- M1.6c-2 Redirections: `<`, `>`, `>>`, `2>` and `2>>` open their files from left to right
  before the command (also for unknown commands), output is added after the command, failures
  give bash's message and exit status 1, redirections win over pipes; `stdin` is now a
  `StandardInput` union with `directory` for `< dir`; fds from 3 on and `0>`/`1<` are game
  notices (ADR 0049).
- M1.6c-1 Write side of the file system: `writeFile` creates, truncates or appends to a file
  like `open(2)` for `>` and `>>`, with the kernel's error order (`ENOENT`, `ENOTDIR`,
  `EACCES`, `EISDIR`), setgid groups and mtimes from the game clock; sessions have a umask
  like Debian 13's `pam_umask` (002 with a private group, else 022) (ADR 0048).
- M1.6b Execution: `runScript` runs and-or lists, pipelines (one command after the other,
  session changes lost like in a subshell) and assignments, keeps `$?`, reports `command not
  found` with 127 and stops the input with a game notice for unsupported features; commands
  are `ShellCommand` functions with `stdout`/`stderr` writers; the game clock moves one second
  per input (ADR 0047, partly supersedes ADR 0043).
- M1.6a Word expansion: `expandWords` turns parsed words into arguments like bash (tilde,
  variables and `$?`, field splitting with `IFS`, pathname expansion with permissions, quote
  removal); sessions have shell variables and an exit status; `compareNames` sorts like the
  en_US.UTF-8 locale (ADR 0046).
- M1.5 Parser: `parse` builds a tree of lists, `&&`/`||` chains, pipelines and simple
  commands with assignments, words and `<`/`>`/`>>` redirections; bash syntax errors and
  unsupported syntax come back as values (ADR 0045).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.7: command framework (registry, option parser, error formats, game notices) on
   top of `ShellCommand` and `CommandLookup`.
2. ROADMAP M1.8: commands batch 1 (`pwd`, `cd`, `ls`, `whoami`, `echo`, `clear`, `history`).
3. ROADMAP M1.9: commands batch 2 (`cat`, `head`, `tail`, `mkdir`, `touch`).

## Blockers and open questions

- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
