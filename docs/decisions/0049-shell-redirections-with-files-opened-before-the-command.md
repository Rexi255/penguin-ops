# 0049. Shell redirections with files opened before the command

- Status: Accepted; partly superseded by
  [0050](0050-input-redirections-read-the-file-when-the-command-starts.md) (when the input
  redirection reads its file)
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M1.6c-2 is the last part of the shell interpreter (ADR 0047): the redirections `<`, `>`,
`>>` and their forms with a file descriptor (`2>`, `2>>`) that the parser already returns
(ADR 0045). Until now every redirection stopped the input with a game notice. The write side of
the file system exists (`writeFile`, ADR 0048). Behaviour must match bash on Debian 13
(ADR 0004): when the files are opened, which messages a failing redirection writes, what
happens to the command, and how redirections and pipes interact. The engine has no processes
and no file descriptors; a command gets the world as a value and returns a new one
(ADR 0041, ADR 0047), so it cannot write into a file while it runs. Players will meet
`command > file`, `command >> log`, `command 2> errors` and `command < file` in the tutorials of
the first chapters; `3>` and reversed forms such as `0>` are rare.

## Decision

- **Order in a simple command.** Words are expanded first, then the assignments, then the
  redirections from left to right, then the command is looked up and run. The redirection
  targets are expanded with the variables of the assignments before the command name, like bash
  does with its temporary environment. Redirections also run for an unknown command, so
  `nosuch > out.txt` creates `out.txt` and `nosuch 2> err.txt` writes `command not found` into
  `err.txt`. Without a command name the redirections run in the shell after the assignments,
  which stay.
- **Targets.** A target is expanded like a word (tilde, variables, field splitting, pathname
  expansion, quote removal) and must give exactly one field. Otherwise the redirection fails
  with `bash: WORD: ambiguous redirect`, where `WORD` is the target as written.
- **Output redirections.** `>` and `>>` (file descriptor 1 by default, or 1 or 2 written before
  the operator) open the target at once with `writeFile` and the empty text: `>` creates or
  empties the file, `>>` creates it or keeps its content. The command then sees the opened file
  in its world, so `sort > notes.txt < notes.txt` reads an empty file. The interpreter keeps
  the canonical absolute path that `writeFile` now returns; a command that changes the working
  directory does not move its output.
- **Output is added after the command.** Output to a file is collected in the order the command
  wrote it and added with `writeToOpenFile` after the command returns its world. That function
  checks no permissions (the file is already open) and drops the text if no file is at the path
  any more, like a write to a deleted file.
- **Input redirections.** `<` (file descriptor 0) opens the target with the new
  `openForReading` (`packages/engine/src/fs-read.ts`): the path resolves like `lookup` and needs
  read permission. A file gives its content at the time it was opened. A directory opens as in
  Linux, but every read from it fails with "Is a directory". `CommandContext.stdin` becomes a
  `StandardInput` union of `terminal`, `text` and `directory`, replacing `string | undefined`.
- **Failures.** The first redirection that fails stops the others. Bash's message
  `bash: PATH: MESSAGE` (the expanded path, and "No such file or directory", "Not a directory",
  "Permission denied" or "Is a directory") goes to standard error as redirected so far, so in
  `cmd 2> err.txt > missing/x` it lands in `err.txt`. The command does not run, the exit status
  is 1, prefix assignments are lost, and the files opened before stay.
- **Several redirections of a stream.** The last one wins, but every target is opened, so
  `echo hi > a.txt > b.txt` leaves `a.txt` empty.
- **Pipelines.** A redirection of standard output wins over the pipe (the next command reads
  the empty text), and a redirection of standard input wins over the pipe from the previous
  command.
- **Unsupported forms stop the input** with a game notice and exit status 1, like other
  unsupported features (ADR 0047): file descriptors other than 0, 1 and 2 (`3> file`,
  `9< file`, feature `file-descriptor`, on the owner's request) and reversed forms that open
  standard input for writing or standard output or error for reading (`0> file`, `1< file`,
  `2< file`, feature `reversed-redirection`). The files opened before the stop stay. The
  feature `redirection` of ADR 0047 is gone. Leading zeros in a file descriptor are ignored like
  in bash (`01>` is `1>`).

## Alternatives considered

- **Silently support file descriptors from 3 on like bash:** they only matter together with
  descriptor duplication (`3>&1`), which the game does not simulate yet; on their own they would
  look like they do nothing. The owner chose a game notice.
- **Write the whole output with one `writeFile` after the command:** simpler, but a missing
  directory or a missing permission would only be noticed after the command ran, `nosuch >
  out.txt` would not create the file, and `> a > b` could not leave `a` empty.
- **Let commands write into the world while they run:** would need a mutable world or a file
  descriptor table inside the engine, against ADR 0041; nothing in the curriculum needs it.
- **Re-resolve the target path after the command:** a command that changes the working
  directory would write its output into a different file.
- **Keep `stdin` as `string | undefined` and stop `< directory` with a game notice:** a
  directory as input is valid bash, and the error belongs to the command that reads it ("cat:
  -: Is a directory"). A union type lets each command answer like its real counterpart.

## Consequences

- The game has no inodes. If a command renames or replaces an opened file, the output goes to
  whatever file is at the old path afterwards (or is dropped if there is none). Two
  redirections to the same file (`> f 2>> f`) get their output in write order, while Linux would
  let the two descriptors overwrite each other at their own offsets. Both are rare and do not
  affect the curriculum.
- The UI needs game notice message keys for `file-descriptor` and `reversed-redirection`
  instead of `redirection`.
- Commands of M1.8 and later read `stdin` by its `kind`: `terminal` (nothing to read, the game
  does not simulate typing), `text`, or `directory` (each command's "Is a directory" error).
- `openForReading` is the read counterpart of `writeFile`; commands that open files (`cat`,
  `head`, `wc`) can use it.
- Tests that depend on bash details the owner cannot check on Windows (assignments around
  redirections, the message going to a redirected standard error, leading zeros in the file
  descriptor) carry `@differential` for milestone M6.
