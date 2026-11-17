# 0051. Shared option parser like GNU getopt_long

- Status: Accepted
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M1.7 builds the command framework that the commands of M1.8 and later use (ADR 0007).
It was split into M1.7a, the option parser with its error messages, and M1.7b, the command
registry and game notices from commands. Almost every GNU coreutils program on Debian 13 reads
its options with glibc's `getopt_long`, so `ls`, `head` and `grep` treat options the same way:
clusters (`-la`), arguments attached or in the next argument (`-n5`, `-n 5`, `--lines=5`,
`--lines 5`), abbreviated long options (`--alm` for `--almost-all`), `--` as the end of the
options, and operands between options (`ls docs -l`). Players will meet all of these, and the
error messages ("invalid option", "unrecognized option", "is ambiguous") must read like the real
ones (ADR 0004).

## Decision

- **One pure parser** in `packages/engine/src/options.ts`: `parseOptions(args, specs, order)`
  returns the options in the order written (each with its `id`, its full name such as `-n` or
  `--lines`, and its argument) and the operands, or the first error as a value. Commands read
  the list themselves, so "the last of `-1` and `-l` wins" stays a decision of each command.
- **Option specs** declare a short name (one character), a long name or both, an `id` and the
  argument kind `none`, `required` or `optional`, like glibc's `struct option`. Several specs
  may share an `id` for aliases. Invalid specs (no name, a name used twice) throw, because they
  are programming errors.
- **Behaviour of glibc 2.41:**
  - `--` ends the options and is not an operand. `-` alone is an operand.
  - The default order `permute` parses options after operands. `require-order` stops at the
    first operand, for commands that run another command (`env`, `nice`, `timeout`) and for
    bash builtins. `POSIXLY_CORRECT` is not simulated.
  - A required argument is the rest of the cluster, the text after `=`, or the next argument even
    if it starts with `-`. An optional argument must be attached (`-T5`, `--color=always`).
  - A long option may be abbreviated. An exact name always wins. Several prefix matches are
    ambiguous unless they all have the same `id` and argument kind as the first match; the
    listed possibilities are the first match and every later match that differs from it, in
    declaration order, like glibc's `ambig_set`.
  - The first error ends the parsing, because the coreutils exit at the first `getopt` error.
- **Messages** are glibc's, produced by `optionErrorMessage(program, error)`:
  `invalid option -- 'x'`, `unrecognized option '--foo=bar'` (the argument as written),
  `option '--al' is ambiguous; possibilities: '--all' '--almost-all'`,
  `option requires an argument -- 'n'`, `option '--lines' requires an argument` and
  `option '--all' doesn't allow an argument` (long options by their full name). The coreutils'
  `Try 'ls --help' for more information.` comes from `tryHelpMessage(program)`. The exit status
  of a usage error belongs to each command (`ls` and `grep` 2, most others 1).
- **Commands declare their complete real option table**, also the options the game does not
  simulate, in the order of the real `long_options` array. Only then do abbreviations and
  ambiguity messages match Debian (`ls --co` is ambiguous between `--color` and `--context`
  even if `--context` is not simulated). How a command marks and reports unsimulated options
  is part of M1.7b.

## Alternatives considered

- **Each command parses its own arguments:** dozens of slightly different parsers and messages,
  and every command would have to get permutation and abbreviations right on its own.
- **An npm argument parser (`commander`, `yargs`, Node's `util.parseArgs`):** none reproduces
  glibc's rules and messages exactly, `util.parseArgs` is a Node API that the engine must not
  use, and their messages would have to be translated back into glibc's wording.
- **Declare only the simulated options:** simpler tables, but `--co` would be accepted as
  `--color` and unsimulated options would give "unrecognized option" instead of a game notice.
- **Collect all errors instead of the first:** the real commands print only the first one.

## Consequences

- M1.7b builds the registry and the reporting of unsimulated options on top of `parseOptions`.
- Bash builtins (`cd`, `echo`, `history`, `pwd` in M1.8) do not use `getopt_long`: they have no
  long options and their own messages (`bash: cd: -x: invalid option` and a usage line). They
  can use the parser with `require-order`, and their message format is added with them.
  `echo` does not report unknown options at all.
- Obsolete syntax that the coreutils handle before `getopt_long` (`head -5`, `tail +3`) stays
  the job of each command.
- glibc works on bytes, the engine on Unicode code points: for an unknown non-ASCII short
  option such as `-ä` the game names the whole character, where Debian names its first byte.
  The test carries `@differential`, like the tests of the ambiguity details, for milestone M6.
