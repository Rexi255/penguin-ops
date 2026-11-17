# 0044. Shell lexer with quoted word parts

- Status: Accepted
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M1.4 starts the shell of ADR 0007 with the lexer, which splits an input line into
tokens. Expansion happens later, in the interpreter (M1.6), and depends on quoting: in bash
`echo ~/'a b' "$X" \*` expands the tilde and `$X` but does not glob the escaped `*`, and `"$X"`
is not split into words. The interpreter therefore needs to know which parts of a word were
quoted, not only the word's text. Bash also has many syntax features the game will not simulate
in the first chapters, and ADR 0004 and the engine rules forbid features that pretend to work.

## Decision

- **Module.** `lex(input)` in `packages/engine/src/lexer.ts` returns all tokens or the first
  error as a value. It works on one complete input text, which may contain line breaks.
- **Tokens.** `word`, `control` (`&&`, `||`, `&`, `;`, `|`, `|&`, `;;`, `;&`, `;;&`, `(`, `)`),
  `redirection` (`<`, `>`, `>>`, `>|`, `<>`, `<&`, `>&`, `&>`, `&>>`, `<<`, `<<-`, `<<<`) and
  `newline`. Every token carries its start and end offset and its source text. The lexer knows
  every bash operator and takes the longest match, so words end exactly where bash ends them;
  the parser decides which operators the game supports and reports the rest.
- **File descriptors.** Unquoted digits directly before a `<` or `>` operator (`2>`) become the
  `fd` of the redirection token, kept as written; the interpreter checks the range.
- **Word parts.** A word is a list of parts: `text` with a `quoted` flag (true for single
  quotes, double quotes and backslash escapes), `parameter` with a name and a `quoted` flag
  (`$name`, `${name}`, `$1`, `${10}`, `$?`, `$$`, `$!`, `$#`, `$@`, `$*`, `$-`), and `tilde`
  (`~`, `~name`, `~+`, `~-`) only at the start of a word. Adjacent text parts with the same flag
  are merged. `''` and `""` give an empty quoted text part, so they stay empty arguments.
  Quotes, escaping backslashes and line continuations are removed from the parts.
- **Bash rules.** Comments start with an unquoted `#` at the start of a word. Inside double
  quotes, a backslash escapes only `$`, `` ` ``, `"`, `\` and the line break and stays before
  every other character. A tilde prefix ends at the first slash and is plain text when it
  contains quotes, backslashes or `$`. Glob characters and braces stay unquoted text; finding
  them is the interpreter's job. Tildes after `=` in assignments are found by the parser.
- **Incomplete input.** An unterminated single or double quote, an unterminated `${` and a
  backslash at the end of the input give an `incomplete` error that names what is missing. The
  terminal can ask for the next line like interactive bash, or report bash's "unexpected EOF
  while looking for matching …".
- **Unsupported features.** Command substitution (`$(…)`, backticks), arithmetic expansion
  (`$((…))`, `$[…]`), parameter expansion with operators (`${x:-y}`, `${#x}`, also `${}`),
  process substitution (`<(…)`, `>(…)`), `$'…'`, `$"…"` and history expansion give an
  `unsupported` error with the feature and its offset. The whole input is rejected; the UI shows
  a game notice for the feature (ADR 0007).
- **History expansion.** As in interactive bash, `!` starts a history expansion unless a blank,
  a line break, `=`, `(`, the end of the input or, inside double quotes, the closing quote
  follows. Single quotes and a backslash prevent it. Scripts (chapter 13) do not use history
  expansion; the lexer gets an option to turn the check off when scripts arrive.

## Alternatives considered

- **Words as plain strings with the quotes removed:** the interpreter could not tell `*` from
  `\*` or `~` from `'~'`, so globbing and tilde expansion would be wrong.
- **Words as raw source text that the interpreter parses again:** quoting rules would live in
  two places.
- **Only the operators the game supports:** `echo a&b` would become one word instead of
  `echo a`, `&`, `b`, and the parser could not report bash's syntax errors for the others.
- **Treating unsupported features as literal text:** `echo $(date)` would print `$(date)`, which
  pretends the feature works and teaches wrong behaviour.
- **Ignoring `!` until history expansion exists:** `sudo !!` would run a command named `!!`.
- **Throwing exceptions for errors:** the other engine functions return errors as values
  (ADR 0042); the lexer uses an exception only internally.

## Consequences

- The parser (M1.5) works on tokens with offsets and source text, which it needs for bash's
  "syntax error near unexpected token" messages. It recognises assignments from the first text
  part.
- The interpreter (M1.6) expands tilde and parameter parts and globs only unquoted text; it
  needs the shell variables for `~+` and `~-`.
- Tab completion (M1.11) can use the token offsets to find the word under the cursor.
- Each unsupported feature needs a game notice message key in the UI catalogs when the terminal
  shows lexer errors (M1.6 or the terminal screen).
- Brace expansion (`{a,b}`), extended globs and here-documents are not handled yet; brace
  expansion belongs to the interpreter, here-documents to the lexer and parser.
