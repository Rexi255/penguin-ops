# 0046. Shell word expansion

- Status: Accepted
- Date: 2026-11-17
- Supersedes: [0042](0042-path-lookup-and-permission-checks-like-the-linux-kernel.md) (only the
  tilde expansion function)

## Context

ROADMAP M1.6 adds the interpreter of the shell (ADR 0007). It is too big for one work package,
so it is split into M1.6a (word expansion), M1.6b (lists, pipelines, exit codes) and M1.6c
(redirections). M1.6a turns the words of the parser (ADR 0045) into the arguments of a command.
The lexer (ADR 0044) keeps for every part of a word whether it was quoted, because bash expands
tildes, splits fields and matches patterns only where the input was not quoted. Expansion needs
shell variables and the last exit status (`$?`), which the session did not have yet. Pattern
results must be sorted like on the reference system (Debian 13, default English locale,
ADR 0008), which sorts by locale collation, not by bytes. ADR 0042 placed a string-based
`expandTilde` in `path.ts` and left `~+` and `~-` to the interpreter. ADR 0044 left brace
expansion (`{a,b}`) to the interpreter.

## Decision

- **Modules.** `packages/engine/src/expand.ts` exports `expandWords(world, session, words)`,
  which returns the fields or the first error as a value, and `expandAssignment(world, session,
  assignment)`, which returns the value of an assignment (tildes and parameters expanded, no
  splitting, no patterns; `+=` is left to the caller). `glob.ts` does the pathname expansion,
  `collation.ts` the sort order. Both functions throw an Error only for a session whose host is
  not part of the world.
- **Order of the steps as in bash.** Tilde and parameter expansion, then field splitting of
  unquoted expansion results, then pathname expansion of unquoted pattern characters, then quote
  removal.
- **Session state.** `Session` gets `variables` (a map of shell variables; a missing name is
  unset) and `exitStatus` (0 at the start). `createSession` sets `HOME` (as in the user list),
  `USER`, `LOGNAME`, `SHELL`, `PATH` (Debian 13's `/etc/profile` values for root and for other
  users), `PWD`, `HOSTNAME` and `IFS`. `OLDPWD` stays unset until the first `cd`. Export
  attributes come with `export` and `env`.
- **Tilde.** `~` expands to `HOME`, or to the home of the session's user if `HOME` is unset;
  `~name` to the home of that user; `~+` to `PWD`; `~-` to `OLDPWD`. An unknown user or an
  unset variable keeps the prefix as text. The result is treated as quoted. This replaces
  `expandTilde` from ADR 0042, which is removed from `path.ts`.
- **Parameters.** `$name` and `${name}` give the variable or nothing. `$?` gives `exitStatus`,
  `$0` gives `-bash` (a login shell). An interactive shell has no positional parameters: `$1`,
  `$@` and `$*` are empty, `$#` is `0`, and `"$@"` gives no field. `$!` is empty because there
  are no background jobs. `$$` (needs process IDs) and `$-` (needs `set` options) return an
  "unsupported" error (`process-id`, `shell-options`) with the offset of the word, so they never
  pretend to work.
- **Field splitting.** POSIX rules with `IFS` (bash's default if unset, no splitting if empty):
  IFS whitespace at the edges is skipped and a run of it separates fields; any other IFS
  character separates fields together with the whitespace around it and can create empty
  fields, but not at the end. A word whose unquoted expansions are all empty disappears; `""`
  and `"$x"` stay as empty fields.
- **Pathname expansion** like bash 5.2 with its default options: `*`, `?` and bracket
  expressions (`!` or `^` negation, ranges by code point, `[:class:]`, `[=c=]`, `[.c.]`); a `[`
  without a closing `]` is ordinary text. Names starting with `.` need a literal leading `.`,
  and `.` and `..` never match. A directory is read only with read permission and search
  permission on the way to it. Literal components after the last pattern must exist; a trailing
  `/` matches only directories. Without a match the word stays as it is (no `nullglob`,
  `failglob`, `dotglob`, `extglob` or `nocaseglob`).
- **Brace expansion is not simulated.** `{a,b}` and `{1..3}` stay ordinary text, as in bash with
  `set +B`. It remains in the ROADMAP ideas.
- **Sort order.** `compareNames` approximates glibc's en_US.UTF-8 collation in four levels:
  only letters and digits, without case and accents (digits first); then accents; then case
  (lower case first); then the whole name by code point. Glob results use it, and later `ls`
  and `sort` will too. Tests that depend on details glibc may handle differently are marked
  `@differential`.

## Alternatives considered

- **Keep the string-based `expandTilde` in `path.ts`:** it cannot see which parts were quoted
  and needs a separate home argument. Two tilde functions with different rules would drift
  apart.
- **Brace expansion now:** it is a separate step before all others, with its own syntax
  (sequences, nesting, padding). The first chapters do not need it, and a half version would
  pretend to work.
- **Fixed values for `$$` and `$-`:** a made-up process ID would conflict with the process
  model of the chapter "Processes and resources"; `$-` would claim options the game does not
  have.
- **Sort by code point (C locale):** simple, but Debian in the default English locale sorts
  `a`, `B`, `c` and mixes dotfiles in between other names, while the C locale puts all upper-case
  names and all dotfiles first. Players compare with real systems.
- **`Intl.Collator`:** its result depends on the ICU version of Node and Electron and follows
  CLDR rules, not glibc; punctuation is not ignored as in glibc.
- **Only default `IFS`:** simpler, but setting `IFS` would silently do nothing.

## Consequences

- M1.6b and M1.6c call `expandWords` for command words and redirection targets and
  `expandAssignment` for assignments; M1.6b sets `exitStatus`, and `cd` (M1.8) sets `PWD` and
  `OLDPWD`.
- The UI needs game notice message keys for `process-id` and `shell-options` when the terminal
  shows expansion errors.
- `compareNames` is an approximation; differences to glibc for names that differ only in
  punctuation are expected and checked in M6 by the `@differential` tests.
- Bash's interactive history expansion means `[!…]` can only be typed where `!` is followed by a
  blank, `=` or `(`; `[^…]` is the usual way to negate in the game, as in real bash.
