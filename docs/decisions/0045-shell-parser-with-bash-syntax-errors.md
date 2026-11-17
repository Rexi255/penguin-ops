# 0045. Shell parser with bash syntax errors

- Status: Accepted
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M1.5 adds the parser of the shell (ADR 0007). It turns the tokens of the lexer
(ADR 0044) into a tree that the interpreter (M1.6) can run. The first chapters need simple
commands, pipelines, the lists `;`, `&&` and `||`, and the redirections `>`, `>>`, `2>` and `<`.
The lexer already knows every bash operator, so the parser has to decide what the game supports.
Players will mistype commands, and a learning game should answer them like real bash (ADR 0004).
Bash syntax that the game does not simulate must not pretend to work (ADR 0007). Bash also finds
tildes after `=` and `:` in assignments, which the lexer left to the parser.

## Decision

- **Module.** `parse(input)` in `packages/engine/src/parser.ts` lexes the input and returns a
  `Script` or the first error as a value. Lexer errors are passed on unchanged.
- **Tree.** A `Script` is a list of and-or lists (separated by `;` or line breaks). An and-or
  list is a first pipeline plus `&&`/`||` parts, evaluated from left to right. A pipeline is one
  or more commands joined by `|`. A command is a `SimpleCommand` (`kind: "simple"`) with
  assignments, words and redirections. Compound commands will extend the `Command` union later.
  Every node keeps its start and end offset.
- **Grammar details as in bash.** Empty lines, comment lines and a trailing `;` are allowed.
  Line breaks may follow `|`, `&&` and `||`. Redirections may stand anywhere in a command, are
  kept in their order, and a command may consist of redirections or assignments only.
- **Assignments.** Before the command name, a word that starts with unquoted `name=` or
  `name+=` is an assignment (`append` flag). After the command name it is an argument.
- **Tildes.** In assignment values, a `~` after the `=` or after an unquoted `:` starts a tilde
  prefix up to the next `/` or `:`. It becomes a tilde part only if the prefix is unquoted text
  without `!`. Like bash outside POSIX mode, arguments and redirection targets that look like
  assignments (`a=~/x`) get the same tilde parts.
- **Redirections.** `<`, `>` and `>>` are supported, with the file descriptor kept as written
  (ADR 0044). The target must be a word.
- **Syntax errors.** Errors are values `{ kind: "syntax", near, start }` with the token as bash
  names it in "syntax error near unexpected token": the operator, the word, only the file
  descriptor for a token like `2>`, or `newline` for a line break or a missing redirection
  target at the end of the input. This covers operators where a command must start, `;;`, `;&`
  and `;;&`, parentheses inside a command, `!` after a pipe, and the reserved words `then`,
  `else`, `elif`, `fi`, `do`, `done`, `esac`, `in`, `}` and `]]` at the start of a command.
- **Reserved words** count only when they are unquoted and start a command, that is, before
  any assignment or redirection. `!` and `time` count only at the start of a pipeline.
- **Incomplete input.** `|`, `&&` or `||` followed only by line breaks or the end of the input
  give `{ kind: "incomplete", missing: "command" }`. The terminal can ask for the next line like
  interactive bash.
- **Unsupported syntax.** Each of these gives `{ kind: "unsupported", feature }`, so the UI can
  show a game notice: background jobs (`&`), subshells, arithmetic commands (`((…))`), `|&`,
  here-documents, here-strings, file descriptor duplication (`2>&1`, `>&2`, `<&`), `&>` and
  `&>>`, `<>`, `>|`, pipeline negation (`!`), the `time` keyword, `if`, `while`, `until`, `for`,
  `select`, `case`, function definitions (`function f`, `f ()`), command groups (`{ … }`),
  `[[ … ]]`, `coproc`, and arrays (`x=(…)`, `a[i]=x`). Unsupported redirection operators are
  reported where they appear, before their target is checked.
- **Verification.** The cases were checked against bash 5.3. Tests whose behaviour should be
  confirmed on Debian 13 (bash 5.2) carry `@differential`.

## Alternatives considered

- **A binary tree for `&&`, `||` and `;`:** it is the textbook form, but the interpreter only
  walks the lists from left to right, and flat lists are easier to read in tests and errors.
- **Supporting `2>&1` now:** it is common in tutorials, but it is not in the ROADMAP and needs
  file descriptor sharing in the interpreter. It stays unsupported and is listed under ROADMAP
  ideas.
- **Supporting `!` and `time`:** both are small, but no chapter needs them yet; supporting them
  later only means removing the error.
- **Taking reserved words as normal command names:** `fi` would give "command not found" instead
  of bash's syntax error, and `if true; then ls; fi` would run a command named `if`.
- **Letting the interpreter find tildes in assignments:** it would have to recognise
  assignments a second time; the parser already does that.

## Consequences

- The interpreter (M1.6) runs the tree: assignments (with `append`), expansion of word parts,
  pipelines, redirections with the default file descriptors (0 for `<`, 1 for `>` and `>>`),
  the `&&`/`||` logic and `$?`.
- The terminal needs a way to show syntax errors in bash's format
  (``bash: syntax error near unexpected token `…'``), to ask for the next line on incomplete
  input, and a game notice message key for each unsupported feature.
- A lexer error comes before any parser error, because the lexer reads the whole input first.
  For `ls ;; echo $(date)` the game reports command substitution, while bash reports the syntax
  error. This only matters for input with two different problems.
- Compound commands (chapter 13) extend the `Command` union and replace the matching
  "unsupported" errors.
