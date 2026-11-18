# 0058. cat after coreutils 9.7 and the files of the standard streams

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.9 adds the second batch of commands. It is split like M1.8: M1.9a is `cat`, M1.9b
`head` and `tail`, M1.9c `mkdir` and `touch`. `cat` is the first command that reads file
contents and standard input. Its formatting options look simple but are a state machine in
`src/cat.c` whose state carries over from one file to the next, and `cat` refuses to read the
file it writes to ("input file is output file"), which depends on file identity and the
offsets of the open file descriptors. Players meet that message when they try `cat a >> a`.

The interpreter (ADR 0049, ADR 0050) gives a command its standard input as text and keeps the
output for files until the command ends; the command did not know which file its standard
streams were connected to. The game also has no inodes, and `<` with the terminal as standard
input cannot be read because the game does not simulate typing into a running command
(ADR 0047).

The implementation follows the source code of coreutils 9.7 (`src/cat.c`) as shipped in
Debian 13.

## Decision

- **`cat`** uses `defineCommand` with the complete option table of coreutils 9.7: `-b`, `-n`,
  `-s`, `-v`, `-E`, `-T`, `-A` with their long names, `-e`, `-t` and `-u` (ignored) are
  simulated; `--help` and `--version` give the notice `option-not-simulated`. Usage errors exit
  with status 1.
- Operands are read in order; no operand and `-` mean standard input. Standard input is read
  once; a second `-` finds its end and adds nothing. A file that cannot be read writes
  `cat: NAME: MESSAGE` (`No such file or directory`, `Not a directory`, `Permission denied`,
  `Is a directory`) with the name quoted like gnulib's `quotef` (shell quoting where needed,
  also for `:`), and `cat` goes on with the next operand; the exit status is then 1. A
  directory from `<` gives `cat: -: Is a directory`.
- **Formatting** lives in `src/commands/cat-format.ts`. `CatFormatter` is a translation of the
  function `cat` in `cat.c`, with its state (`newlines`, `pending_cr` and the line counter)
  kept for the whole command: numbers go on across files and standard input, a file without a
  final line break continues its last line in the next file, `-s` squeezes empty lines across
  files, and a carriage return at the end of one file becomes `^M` with `-E` only if the next
  file starts with a line break. Line numbers are right-aligned in six columns followed by a
  tab and grow wider after 999999. `-v` writes control characters as `^X`, DEL as `^?` and
  every byte from 128 on of the character's UTF-8 encoding as `M-` notation (`ä` is `M-CM-$`).
  Without formatting options the content is copied unchanged.
- **Standard input on the terminal** stops the input with the new notice
  `terminal-input-not-simulated` when `cat` reaches it, without operands at once, after the
  output of earlier operands, which stays.
- **The files of the standard streams.** `StandardInput` of kind `text` gets an optional
  `file` (host and canonical path) when it comes from `<`, and `CommandContext` gets
  `stdoutFile`: the `OutputFile` that standard output goes to after `>` or `>>`, with `append`
  for `>>`, or `undefined` for the terminal and a pipe. As the game has no hard or symbolic
  links, the same canonical path on the same host is the same file.
- **"input file is output file"** follows `cat.c`: before reading an input that is standard
  output's file, `cat` compares the input's offset (0, or the end of standard input after it
  was read) with the output's offset, which is the file's size for `>>` (the size when the
  command started plus what `cat` wrote since) and the bytes `cat` wrote so far for `>`. If the
  input's offset is smaller, `cat` writes `cat: NAME: input file is output file`, skips the
  operand and later exits with 1. So `cat a >> a` fails and leaves `a` unchanged, `cat a > a`
  empties `a` without a message (the shell truncates it before `cat` runs), and
  `cat b a > a` fails for `a` after writing `b`.

## Alternatives considered

- **Leave out the "input file is output file" check:** simpler, but `cat a >> a` would then
  quietly double the file, and players would learn a behaviour that real Linux does not have.
- **A new `StandardInput` kind `file` instead of an optional field:** every command that reads
  standard input would have to handle two kinds with the same text; the file only matters for
  the identity check.
- **Pass the whole stream setup (also standard error's file) to commands:** no command needs it
  yet; `cat` only compares with standard output, like `cat.c`.
- **Treat `cat` on the terminal as reading nothing (as after Ctrl+D at once):** it would
  pretend to work and hide that the game does not simulate typing into a command.
- **Format line by line with regular expressions:** shorter, but the cross-file behaviour of
  `cat.c` (continued lines, squeezed blanks and the waiting carriage return) would be easy to
  get wrong; a direct translation of the state machine is easier to compare with the source.

## Consequences

- `head`, `tail`, `wc` and `grep` can read files and standard input the same way and reuse the
  `stdoutFile` information if they need it.
- Known gaps: output that standard error adds to standard output's file (`cat a >> a 2>> a`)
  does not count for the size of `>>`; input never contains invalid UTF-8, so `cat -v` cannot
  show the byte 255.
- The UI needs messages in both languages for the notice `terminal-input-not-simulated`.
- Tests that depend on details the owner cannot check on Windows (the waiting carriage return
  across files, the offset of `>` after earlier output) carry `@differential` for milestone M6.
