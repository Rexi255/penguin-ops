# Status

_Last updated: 2026-11-17_

## Recently completed

- M1.5 Parser: `parse` builds a tree of lists, `&&`/`||` chains, pipelines and simple
  commands with assignments, words and `<`/`>`/`>>` redirections; finds tildes in assignments;
  reports bash's "syntax error near unexpected token", incomplete input after `|`, `&&`, `||`,
  and bash syntax the game does not simulate yet (`&`, `2>&1`, `if`, …) as values (ADR 0045).
- M1.4 Lexer: `lex` splits input into words, operators, redirections and line breaks like
  bash; words keep their quoted and unquoted parts, parameters and tilde prefixes; incomplete
  input and features the game does not simulate yet (`$(…)`, `!!`, `${x:-y}`, …) come back as
  errors (ADR 0044).
- M1.3 Determinism: game clock that stands still until its owner advances it, with a
  read-only `Clock` view for the engine; `buildWorld` creates a checked world from a short
  spec (users and groups by name, files by path, missing parents and default owner, mode and
  mtime filled in) (ADR 0043).
- M1.2 Virtual file system, read side: path lookup component by component like the kernel
  (`.`, `..`, trailing slash, ENOENT/ENOTDIR/EACCES as values), permission checks with one
  class and root rules, tilde expansion for the shell, session start in `/` when the home
  cannot be entered (ADR 0042).
- M1.1 Core types of the engine: immutable world with hosts, users, groups and a file system
  tree of `file` and `directory` nodes; branded `Uid`/`Gid`; `createWorld` checks the
  structural rules; sessions keep the groups of their login like Linux (ADR 0041).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.6: interpreter (expansion, pipelines, redirections, exit codes, `$?`); decide
   there who advances the game clock and by how much (ADR 0043), and how brace expansion
   (`{a,b}`) is handled. Slice it if it is too big for one session.
2. ROADMAP M1.7: command framework (registry, option parser, error formats, game notices).
3. ROADMAP M1.8: commands batch 1 (`pwd`, `cd`, `ls`, `whoami`, `echo`, `clear`, …).

## Blockers and open questions

- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
