# 0050. Input redirections read the file when the command starts

- Status: Accepted
- Date: 2026-11-17
- Supersedes: [0049](0049-shell-redirections-with-files-opened-before-the-command.md) (only when
  the input redirection reads its file)

## Context

ADR 0049 let `<` copy the content of its file when the redirection opened it. A code review
found that this differs from bash: in Linux, `<` and `>` on the same path give two descriptors
for the same file, and the truncation of `>` is seen by every reader. So
`tr a-z A-Z < notes.txt > notes.txt` leaves `notes.txt` empty in bash, whatever the order of the
two redirections, while the game wrote the converted old content back. This is the classic
"why is my file empty" pitfall, which the game should show as it is (ADR 0004). The owner asked
for the review findings to be fixed.

## Decision

- `<` still opens its file with `openForReading` when the redirection runs, so missing files and
  missing permissions are reported in the left-to-right order of ADR 0049.
- `openForReading` now also returns the canonical absolute path of an opened file. The
  interpreter keeps that path and reads the file with the new `readOpenFile` only when the
  command starts, after all redirections. A `>` on the same file has emptied it by then; a `>>`
  keeps the content.
- `readOpenFile(world, hostName, path)` checks no permissions (the file is already open) and
  returns the empty text if no file is at the path any more.
- `nodeAtCanonicalPath` in `packages/engine/src/lookup.ts` walks a canonical path without
  checks; `readOpenFile` and `writeToOpenFile` share it.
- Everything else in ADR 0049 stays.

## Alternatives considered

- **Empty the copied input when a later `>` truncates the same path:** fixes this one case, but
  puts knowledge about other redirections into the input handling and has to be kept in sync
  with every future way a redirection can change a file.
- **Keep the copy at open time:** simpler, but it teaches players something that is wrong on a
  real system.

## Consequences

- `cmd < f > f` empties `f` in the game as in bash; the test that expected the old content is
  replaced.
- The game still has no inodes: a removed file reads as empty instead of keeping its old
  content. Within the redirections of one command nothing can remove a file, so this does not
  show yet.
