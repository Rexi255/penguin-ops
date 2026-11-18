# 0061. rm after coreutils 9.7 with unlink and rmdir, and questions that stop the input

- Status: Accepted
- Date: 2026-11-18
- Supersedes: [0052](0052-command-registry-with-game-notices-for-unsimulated-options.md) (only what
  a stopping command may change)

## Context

ROADMAP M1.10 adds `cp`, `mv`, `rm` and `grep`. It is split like M1.8 and M1.9: M1.10a is
`rm`, M1.10b `cp`, M1.10c `mv`, M1.10d `grep`. `rm` is the first command that removes entries
from the file system, and its behaviour is full of details that players meet early: `rm dir`
says "Is a directory", `rm -r .` is refused, `rm -rf /` is refused, `rm -foo` suggests
`rm ./-foo`, and removing one's own read-only file asks a question when standard input is the
terminal.

`rm` walks each operand with gnulib's fts (`src/remove.c`): directories come before and after
their entries, a failed entry marks all directories above it so that rm leaves them alone
without a message, and an unreadable directory is still removed if it is empty. The game does
not simulate typing into a running command (ADR 0047), so it cannot take the answer to a
question. A command that stops the input changed nothing so far (ADR 0052), but `rm` removes
earlier operands before it asks.

The implementation follows the source code of coreutils 9.7 (`src/rm.c`, `src/remove.c`,
`src/system.h`) and gnulib's fts as shipped in Debian 13.

## Decision

- **File system.** The tree helpers of `fs-write.ts` (`hostOf`, `resolveParent`, `withEntry`,
  `replaceDirectory`, `replaceNode`) move to the internal module `src/fs-tree.ts`. The new
  `src/fs-remove.ts` has `removeEntry`, unlink(2) or rmdir(2) in the kernel's order: lookup
  errors of the way, `EINVAL`/`ENOTEMPTY`/`EBUSY` for paths ending in `.`/`..` or `/` (`EISDIR`
  for unlink), `ENOENT`, `ENOTDIR`/`EISDIR` for a trailing slash on unlink, `EACCES` without
  write permission on the directory, `EPERM` for the sticky bit (only root, the owner of the
  entry or of the directory), then `EISDIR`/`ENOTDIR` for the wrong kind and `ENOTEMPTY`. The
  directory's mtime becomes the current time.
- **Stops keep changes.** `CommandStop` gets an optional `world`: the changes a command made
  before it stopped stay, like its output. ADR 0052's "the command changes nothing" now applies
  only to stops without a `world`.
- **Usage error notes.** `CommandDefinition` gets an optional `usageErrorNote`, lines written
  between glibc's message and the Try line. `rm` uses it for rm.c's
  `diagnose_leading_hyphen`: `Try 'rm ./-x' to remove the file '-x'.` for the first argument
  that starts with `-` and exists.
- **`rm`** has the complete option table of coreutils 9.7. `-f`, `-r`/`-R`, `-d`, `-v` and
  `--preserve-root` (also `=all`) are simulated; `-i`, `-I`, `--interactive`,
  `--one-file-system`, `--no-preserve-root`, `---presume-input-tty`, `--help` and `--version`
  give the notice `option-not-simulated`. `--preserve-root=X` with another argument gives
  `unrecognized --preserve-root argument: 'X'`. Without operands it writes `missing operand`,
  except with `-f`.
- **The walk** follows remove.c and fts: operands lose all but one trailing slash; an operand
  that stat(2) cannot find is tried with unlink(2), whose error is reported; files are
  unlinked; a directory without `-r` (and without `-d` for an empty one) gives `Is a
  directory` (`Directory not empty` with `-d`). For directory operands, a last component `.`
  or `..` gives `refusing to remove '.' or '..' directory: skipping 'X'`, and with `-r` a name
  of `/` gives `it is dangerous to operate recursively on '/'` (with `(same as '/')` for other
  names) and `use --no-preserve-root to override this failsafe`. A directory's entries come in
  the order the directory keeps them; an unreadable directory is removed with rmdir(2) if
  empty and else reports why it could not be read; a directory with an entry that stayed is
  left without a message. `-v` writes `removed 'X'` and `removed directory 'X'`. Messages quote
  names like `quoteaf`; `-f` ignores `ENOENT` and `ENOTDIR`.
- **Questions.** Without `-f`, and only when standard input is the terminal, rm asks before it
  removes something the user may not write to (never for root): `remove write-protected
  regular file 'X'?` (`regular empty file`), `descend into write-protected directory 'X'?`,
  `remove write-protected directory 'X'?` and, with `-d` for an unreadable directory,
  `attempt removal of inaccessible directory 'X'?`. The game writes the question to standard
  error and stops the input with the notice `terminal-input-not-simulated`, keeping what rm
  removed before.

## Alternatives considered

- **Answer every question with "yes" or "no":** pretends that the player answered. Real rm
  waits for the player, and the lesson is that `-f` or a pipe changes that.
- **Stop before rm removes anything:** simpler, but `rm a.txt locked.txt` really removes
  `a.txt` before it asks about `locked.txt`.
- **Sort the entries of a directory by name:** reproducible for players, but Linux returns
  them in the order of the directory's hash; the game keeps the order in which entries were
  added, which is also unspecified for the player. Tests that depend on it are `@differential`.
- **Simulate `-i` and `-I`:** they only ask questions, which the game cannot answer.
- **Simulate `--no-preserve-root`:** it would let a player erase the whole simulated host in
  one command; it can follow when levels need it, with a safety net in the game.

## Consequences

- `cp`, `mv` and the planned `rmdir` can use `removeEntry` and `fs-tree.ts`.
- A removed working directory is now possible (`rm -r .` is refused, but `rm -r ../dir` from
  inside works); the shell's behaviour there is a ROADMAP idea.
- Tests that depend on details the owner cannot check on Windows (the order of entries, the
  root warning for other names of `/`) carry `@differential` for milestone M6.
