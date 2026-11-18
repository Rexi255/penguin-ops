# 0062. cp after coreutils 9.7 with copy_internal, modes of new files and copies into itself

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.10b adds `cp` with `-r`. Players copy configuration files before they edit them and
copy directories as backups, and they meet cp's messages early: "-r not specified; omitting
directory", "'a' and 'a' are the same file", "target 'x': Not a directory" and "cannot copy a
directory, 'a', into itself, 'a/b'".

`cp` is a thin layer over `copy_internal` in `src/copy.c`, which `mv` shares. It decides
whether the last operand is a target directory, checks source and destination, creates
directories with restricted permissions and fixes them after their entries are copied, and
finds copies of a directory into itself through a table of device and inode numbers. The game
has no inodes and no links (ADR 0041), so a canonical path names one entry.

The implementation follows the source code of coreutils 9.7 (`src/cp.c`, `src/copy.c`) and
gnulib's `targetdir.c`, `filenamecat-lgpl.c` and `basename-lgpl.c` as shipped in Debian 13.

## Decision

- **File system.** `FileWrite` gets an optional `createMode`, the permission bits open(2) asks
  for when it creates a file (0o666 by default). `makeDirectory` gets an optional `mode` (0o777
  by default) and keeps its permission and sticky bits minus the umask. The new `changeMode` is
  chmod(2): root or the owner (else `EPERM`); the mtime stays.
- **Options.** `cp` has the complete option table of coreutils 9.7. `-r`/`-R`, `-f`, `-v`, `-t`
  and `-T` are simulated; all others (`-a`, `-p`, `-i`, `-n`, `-u`, `-l`, `-s`, `--parents`,
  `--backup`, `--preserve`, ...) give the notice `option-not-simulated`. `checkOption` now also
  gets the options before the one it checks, so a second `-t` gives
  `multiple target directories specified`.
- **Operands** follow cp.c's `do_copy`: `missing file operand`, `missing destination file
  operand after 'X'`, `-T` with `extra operand 'X'` and `cannot combine --target-directory (-t)
  and --no-target-directory (-T)`, `target directory 'X': MESSAGE` for `-t`, and `target 'X':
  MESSAGE` when more than two operands end with something that is not a directory. In a
  target directory, each source is copied under its last component without trailing slashes,
  with `..` as `.` (`file-names.ts`, after gnulib's `last_component` and `file_name_concat`).
- **One copy** follows `copy_internal`: `cannot stat 'X'` for a missing source;
  `-r not specified; omitting directory 'X'`; `cannot stat` for a destination whose lookup
  fails other than with `ENOENT`; `'A' and 'B' are the same file` for the same canonical path;
  `cannot overwrite non-directory 'D' with directory 'S'` and the reverse; with two or more
  operands into a directory, `warning: source file 'X' specified more than once` and
  `will not overwrite just-created 'D' with 'S'`. `-v` writes `'S' -> 'D'` before a file is
  copied and after a directory is created.
- **Files** follow `copy_reg`: the source must be readable (`cannot open 'X' for reading`); an
  existing destination is truncated and keeps its mode; with `-f`, one that cannot be opened is
  removed first (`removed 'D'` with `-v`, `cannot remove 'D'` if that fails); a new one gets
  the source's permission bits without setuid, setgid and sticky, minus the umask. Errors are
  `cannot create regular file 'D'`, with `Not a directory` for a missing name with a trailing
  slash.
- **Directories** are created with the source's bits without group and other write, minus the
  umask; if the owner lacks read, write or search, cp adds them while it copies the entries and
  removes them afterwards; the group and other write bits that the umask allows come back at
  the end. An existing destination directory is filled without changing its mode. Entries are
  copied in the order the directory keeps them; an unreadable source gives `cannot access 'X'`
  after the destination was created.
- **Copies of directories** are remembered like `remember_copied`, by canonical paths: every
  command-line source directory by its source, and the first directory created for each
  operand by itself. Meeting a remembered directory again gives `cannot copy a directory, 'S',
  into itself, 'D'` (with the operand's names; cp stops that directory), `warning: source
  directory 'S' specified more than once`, or `will not create hard link 'D' to directory 'E'`.

## Alternatives considered

- **Detect "into itself" by comparing the paths before copying:** simpler, but real cp creates
  the destination and copies the entries that come before the new directory, and the messages
  for repeated operands come from the same table.
- **Give new files the default mode 0666 minus the umask:** that is what `>` does, but cp
  copies the source's permission bits, which players see with `ls -l`.
- **Simulate `-p` and `-a`:** they need ownership changes and timestamps for every node, which
  can follow with `chown` and `touch -d`; until then a notice is honest.
- **Sort directory entries by name:** Linux reads them in the order of the directory (cp sorts
  them by inode number); the game keeps the order in which entries were added, and tests that
  depend on it are `@differential`.

## Consequences

- `mv` (M1.10c) can reuse the target directory logic, `file-names.ts` and the copy of
  directories for its messages.
- `changeMode` is ready for `chmod`; the kernel's clearing of setgid on files of a foreign
  group is a known gap until then.
- Known gaps: cp never sees a directory that changes while it copies, and `--remove-destination`
  and the backup options are notices.
