# Status

_Last updated: 2026-11-17_

## Recently completed

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
- M1.4 Lexer: `lex` splits input into words, operators, redirections and line breaks like
  bash; words keep their quoted and unquoted parts (ADR 0044).
- M1.3 Determinism: game clock that stands still until its owner advances it; `buildWorld`
  creates a checked world from a short spec (ADR 0043).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.6c: redirections with the write side of the file system; replaces the
   `redirection` stop of ADR 0047.
2. ROADMAP M1.7: command framework (registry, option parser, error formats, game notices) on
   top of `ShellCommand` and `CommandLookup`.
3. ROADMAP M1.8: commands batch 1 (`pwd`, `cd`, `ls`, `whoami`, `echo`, `clear`, `history`).

## Blockers and open questions

- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
