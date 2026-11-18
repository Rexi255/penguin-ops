# 0060. mkdir and touch after coreutils 9.7 with mkdir and utimensat in the file system

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.9c adds `mkdir` (with `-p`) and `touch`, the first commands that create directories
and change file times. Until now only the shell's redirections changed the file system, through
`writeFile` (ADR 0048).

`mkdir -p` is not a loop of mkdir(2) calls on longer and longer prefixes: gnulib's
`make_dir_parents` and `mkancesdirs` create each directory on the way with a umask that keeps
the owner's write and search bits, enter it with chdir(2), and choose the error of chdir(2) or
of the failed mkdir(2) for the message. `touch` opens the file like open(2) with `O_CREAT` and
then calls utimensat(2), whose permission rules differ for "now" (owner or write permission)
and for explicit times (owner only); which of the two errors `touch` reports depends on both.

The game keeps one time per node, the modification time (ADR 0041). The implementation follows
the source code of coreutils 9.7 (`src/mkdir.c`, `src/touch.c`) and gnulib's `mkdir-p.c`,
`mkancesdir.c` and `savewd.c` as shipped in Debian 13.

## Decision

- **File system.** `src/fs-write.ts` gets two kernel calls next to `writeFile`, sharing its path
  resolution (`resolveParent`):
  - `makeDirectory` is mkdir(2) with the mode 0777: lookup errors of the way, `EEXIST` for an
    existing entry and for `/`, `.` and `..`, `EACCES` without write permission on the parent.
    A trailing slash is allowed. The new directory gets `0o777 & ~umask`, the user, the primary
    group or the parent's group and setgid bit if the parent has the setgid bit; the parent's
    mtime becomes the current time.
  - `setTimes` is utimensat(2) with a `TimesUpdate`: `now` (NULL times) needs the owner or
    write permission (else `EACCES`), `explicit` times need the owner (else `EPERM`); root may
    always. The update gives the new mtime: a time, the current time, or `omit` (only the
    access time changes). Access times are not simulated; they only decide the permissions.
- **`mkdir`** has the complete option table of coreutils 9.7. `-p` and `-v` are simulated;
  `-m`, `-Z`, `--context`, `--help` and `--version` give the notice `option-not-simulated`
  (`-m` needs the mode parser of `chmod`, a later chapter). Without operands it writes
  `missing operand` with the Try line. Errors are
  `mkdir: cannot create directory ‘DIR’: MESSAGE` (quoted like `quote`), and `mkdir` goes on
  with the next operand. `-v` writes `mkdir: created directory 'DIR'` (quoted like `quoteaf`)
  to standard output.
- **`mkdir -p`** follows `mkancesdirs`: the ancestors are found by the same left-to-right scan
  of the name; `.` is skipped and `..` only entered. Each other ancestor is created with the
  umask without the owner's write and search bits (and announced by `-v` with the operand up to
  it), then entered like chdir(2). If entering fails, the error is chdir's, except that a
  missing directory reports why mkdir(2) failed. The operand itself is created with the
  session's umask; if it exists and stat(2) finds a directory, that is no error. Entering is
  checked by path from the working directory, which gives the same results as chdir(2) in a
  file system without symbolic links.
- **`touch`** has the complete option table of coreutils 9.7. `-a`, `-c`/`--no-create`, `-f`
  (ignored), `-h`/`--no-dereference`, `-m` and `-r`/`--reference` are simulated; `-d`,
  `--date`, `-t`, `--time`, `--help` and `--version` give the notice. For each operand:
  - Unless `-c` or `-h`, it opens the file like `writeFile` with an empty append, which creates
    a missing file with `0o666 & ~umask` and changes nothing else.
  - It sets the times: `now` without `-a`, `-m` and `-r`; with only `-a` or only `-m` explicit
    times (`omit` or `now`); with `-r` the mtime of the reference file (`omit` with only `-a`).
  - If that fails, it writes `cannot touch 'FILE': MESSAGE` with the error of the open, unless
    the open failed with `EISDIR` or did not happen; then `setting times of 'FILE': MESSAGE`
    with the error of utimensat, except for a missing file with `-c`.
  - A reference file that stat(2) cannot find ends `touch` at once with
    `failed to get attributes of 'FILE': MESSAGE`, before the check for operands.
  - `-` sets the times of standard output's file after `>` or `>>`; on the terminal or a pipe
    it succeeds and changes nothing the game keeps.
- The obsolete `touch MMDDhhmm FILE` form is not read, as Debian's default POSIX version
  (200809) does not allow it.

## Alternatives considered

- **`mkdir -p` as mkdir(2) of each prefix, ignoring `EEXIST`:** shorter, but the umask of the
  directories on the way and the choice between the errors of mkdir(2) and chdir(2) would not
  match: `mkdir -p locked/a/b` must say "Permission denied", not "No such file or directory".
- **Keep access times in the file system:** `touch -a` and `ls -lu` would work, but every node
  and every read would need a second time, and no level needs it yet. The permissions of `-a`
  are still right.
- **Simulate `-d` and `-t`:** gnulib's `parse_datetime` accepts a large free-form language;
  half of it would pretend to work. `-t` alone is smaller but has no level yet.
- **Simulate `mkdir -m`:** needs gnulib's `mode_compile` and `mode_adjust`, which `chmod` will
  bring; until then a notice is honest.
- **Treat `touch -` as an error on the terminal:** Linux allows futimens(2) on a terminal the
  user owns, so `touch -` succeeds there.

## Consequences

- `cp`, `mv` and `rm` (M1.10) can build on `resolveParent` and the helpers of `fs-write.ts`.
- New directories inherit setgid like on Linux, which `ls -l` shows as `s`.
- Known gaps: `mkdir -p` checks the way again from the working directory instead of keeping a
  directory open, which matters only when permissions change while it runs; `touch` cannot
  show changed access times.
- The UI needs no new notices.
- Tests that depend on details the owner cannot check on Windows (`-a`/`-m` for a non-owner with
  write permission, `touch -` with a file it does not own) carry `@differential` for M6.
