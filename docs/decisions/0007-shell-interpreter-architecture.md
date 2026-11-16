# 0007. Shell as lexer, parser, syntax tree and interpreter

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The prototype tokenizes and executes input in one step. That is enough for one-liners with
pipes and redirection, but later chapters teach shell scripts (`if`, `for`, `while`, functions,
`$(...)`). Rewriting the shell later would touch every command and test.

## Decision

- The shell is built from the MVP on as: **lexer** (input → tokens) → **parser** (tokens →
  abstract syntax tree, AST) → **interpreter** (executes the tree: expansion of variables,
  `~` and globs, pipelines, lists with `;` `&&` `||`, redirections, exit codes).
- Commands live in a registry. Each command declares its options; a shared option parser and
  shared error formats reproduce bash and GNU coreutils behaviour on Debian 13 (ADR 0004).
- **Full-screen programs** (`less`, `man`, `top`, `nano`, later `vim`) share one engine
  mechanism: a program that takes over the terminal area and receives key input until it
  exits.
- The engine never produces translatable text. Simulated command output is English text, as
  in real Linux. Everything that is a game message (for example "this option is not simulated
  yet") is emitted as a structured event with a message key, which the UI renders in the
  player's language.
- Tab completion and command history are engine APIs; the UI only displays them.

## Alternatives considered

- **Keep the prototype's single-pass approach:** fast to port, but a dead end for scripts.
- **Embed an existing bash interpreter:** none fits a simulated, deterministic, multi-host
  world in TypeScript.

## Consequences

- More upfront work in milestone M1, but scripts (chapter 13) fit without a rewrite.
- Syntax errors can be reported exactly like bash.
