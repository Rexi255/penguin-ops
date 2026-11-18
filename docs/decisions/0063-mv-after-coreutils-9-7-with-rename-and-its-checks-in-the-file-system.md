# 0063. mv after coreutils 9.7 with rename and its checks in the file system

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.10c adds `mv`. Players rename files, move them into directories and tidy up
directory trees; they meet "cannot move 'a' to a subdirectory of itself", "cannot overwrite
'd': Directory not empty" and the question before a write-protected file is replaced.

`mv` shares `copy_internal` with `cp` (ADR 0062) in move mode: it first tries renameat2(2) with
`RENAME_NOREPLACE`, and only when that fails it looks at source and destination, asks
questions and tries rename(2) again, replacing the destination. Copying and removing is only a
fallback for moves across file systems (`EXDEV`). The game has one file system per host, no
links and no inodes (ADR 0041).

The implementation follows the source code of coreutils 9.7 (`src/mv.c`, `src/copy.c`) and the
Linux kernel's `do_renameat2` and `vfs_rename` as shipped in Debian 13.

## Decision

- **File system.** The new `src/fs-rename.ts` has `renameEntry`, renameat2(2) with or without
  `RENAME_NOREPLACE`, in the kernel's order: lookup errors of both directories; `EBUSY` for a
  source that is `/`, `.` or `..` (and for such a destination, `EEXIST` with `noReplace`);
  `ENOENT`; `EEXIST` for an existing destination with `noReplace`; `ENOTDIR` for a file with a
  trailing slash on either name; `EINVAL` for a directory into itself or below; `ENOTEMPTY` for
  a destination above the source; nothing for an entry renamed to itself; then write
  permission and the sticky bit on both directories (`EACCES`, `EPERM`), `ENOTDIR`/`EISDIR`
  for the wrong kind, write permission on a directory that changes its parent, and
  `ENOTEMPTY` for a directory with entries that would be replaced. The node keeps its mtime;
  both directories get the current time.
- **`mv`** has the complete option table of coreutils 9.7. `-f`, `-t`, `-T`, `-v`,
  `--strip-trailing-slashes` and `--no-copy` (which only forbids the copy fallback the game
  never needs) are simulated; `-i`, `-n`, `-u`, `-b`, `-S`, `--exchange`, `-Z`, `--debug`,
  `--help` and `--version` give the notice `option-not-simulated`.
- **Operands** follow mv.c: the messages for missing and extra operands, `-t` and `-T` are those
  of `cp`. With two operands, mv first tries rename(2) without replacing; only if that fails is
  the last operand checked as a target directory. In a target directory the destination is the
  source's last component without trailing slashes (mv keeps `..`, unlike cp).
- **One move** follows `copy_internal` in move mode: after a failed rename, `cannot stat 'S'`
  for a missing source; for an existing destination `'S' and 'D' are the same file`, the
  question, `cannot overwrite non-directory 'D' with directory 'S'` and the reverse, and
  `will not overwrite just-created 'D' with 'S'` (with two or more sources); a source
  directory that could not be moved and is named again gives `warning: source directory 'S'
  specified more than once`. Then rename(2) replaces the destination. Its errors give `cannot
  move 'S' to a subdirectory of itself, 'D'` (`EINVAL`), `cannot overwrite 'D': MESSAGE`
  (`EEXIST`, `EISDIR`, `ENOTEMPTY`) or `cannot move 'S' to 'D': MESSAGE`. `-v` writes
  `renamed 'S' -> 'D'`.
- **The question.** Without `-f` and with the terminal as standard input, mv asks before it
  replaces a destination the user may not write to (never for root):
  `replace 'D', overriding mode 0444 (r--r--r--)?`. As for `rm` (ADR 0061), the game writes it
  and stops the input with `terminal-input-not-simulated`, keeping what mv moved before.

## Alternatives considered

- **Move by copying and removing:** works the same for the player, but changes the moved
  node's mtime and ownership rules and needs more permissions than rename(2).
- **Check the target directory before the first rename:** simpler to read, but mv.c tries the
  rename first, which decides between "target" errors and rename errors for two operands.
- **Simulate `-n` and `-u`:** both depend on details that changed between coreutils releases
  (the deprecated `-n`, `--update=none-fail`); they can follow when a level needs them.

## Consequences

- `mv` never removes anything with `rm`'s code, because rename(2) never fails with `EXDEV` in
  the game; cross-file-system moves can follow if hosts get several file systems.
- The checks of `renameEntry` are ready for future commands that rename (`rename`, `install`).
- Tests that depend on details the owner cannot check on Windows carry `@differential` for M6.
