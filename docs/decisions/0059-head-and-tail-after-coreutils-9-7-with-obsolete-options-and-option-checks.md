# 0059. head and tail after coreutils 9.7 with obsolete options and option checks

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.9b adds `head` and `tail` with `-n`, `-c` and headers for several files. Players use
them to look at logs and long configuration files, often in the short forms `head -5` and
`tail -20` from tutorials, and `tail -f` is the most common way to watch a log.

Three things did not fit the command framework (ADR 0051, ADR 0052):

- Both commands read an obsolete option form before `getopt_long` (`head -5c`, `tail +5`,
  `tail -5f`), which the shared option parser cannot express.
- Both check option arguments while they read their options: `head -n abc -x` exits with
  "invalid number of lines" before getopt sees `-x`. `defineCommand` reported every parse
  error before the command could look at its options.
- Counts accept gnulib's multiplier suffixes (`5k`, `2MiB`, `1kB`) and saturate at
  `UINTMAX_MAX` (2^64 - 1).

Counts of bytes can also cut a UTF-8 character in two, which the game's text files and terminal
cannot show (ADR 0053). `tail -f` needs time to pass while a command runs, which the game does
not simulate (ADR 0047).

The implementation follows the source code of coreutils 9.7 (`src/head.c`, `src/tail.c`) and
gnulib's `xstrtol.c` as shipped in Debian 13.

## Decision

- **Command framework.** `CommandDefinition` gets two optional hooks:
  - `obsoleteSyntax` reads the arguments first. It returns `undefined` (not the obsolete form),
    the options the form stands for and the arguments left for the option parser, or an
    `OptionFailure` (message and whether the "Try ... --help" line follows) with the usage
    error status.
  - `checkOption` sees each option in the order written, after the check for unsimulated
    options of that option, and may reject it with an `OptionFailure`. A parse error after it
    comes later.
- **Numbers.** `src/xstrtol.ts` translates `xstrtoumax` and `xnumtoumax` with
  `XTOINT_MAX_QUIET` to bigints: leading white space and `+`, a minus sign is invalid, a valid
  suffix without digits means 1 (`k` is 1024), `KiB` and `kB` with the flag suffix `0`, and
  saturation at `UINTMAX_MAX`. Invalid counts give `NAME: invalid number of lines: ‘TEXT’`
  (or `bytes`) with exit status 1.
- **`head`** has the complete option table of coreutils 9.7. `-n`, `-c` (with a leading `-`
  for "all but the last"), `-q`/`--quiet`/`--silent`, `-v`, `-z` and the obsolete
  `-N[bcklmqvz]` form are simulated; a digit as a later option gives
  `invalid trailing option -- N` with the Try line. `--help`, `--version` and the undocumented
  `---presume-input-pipe` give the notice `option-not-simulated`.
- **`tail`** has the complete option table of coreutils 9.7. `-n`, `-c` (with `+` for "from
  the start", which stays once given), `-q`, `-v`, `-z` and the obsolete form of
  `parse_obsolete_option` for Debian's default POSIX version 200809 (`-N`, `+N`, with `b`, `c`,
  `l` and `f`, only with at most one file operand) are simulated. Too many digits in the
  obsolete form give `invalid number: ‘-N’: Numerical result out of range`. A digit as a later
  option gives `option used in invalid context -- N`. `-f`, `-F`, `--follow`, `--retry`,
  `--pid`, `-s`, `--max-unchanged-stats`, the undocumented options, `--help` and `--version`
  give the notice `option-not-simulated`; `tail -5f` gives it for `-f`. With `-n 0` or an
  unlimited start, `tail` exits at once without opening its files.
- **Lines** end with a newline, or NUL with `-z`. A last line without a line end counts as a
  line, as in `elide_tail_lines_seekable` and `file_lines`.
- **Headers** `==> NAME <==` are written for several operands, `-v` always, `-q` never, with
  an empty line before every header but the first; standard input is `standard input`. A file
  that cannot be opened gets no header.
- **Errors.** `cannot open 'NAME' for reading: MESSAGE` (quoted like `quoteaf`) goes on with
  the next operand and exit status 1. A directory opens, gets its header, and its read fails
  with `error reading 'NAME': Is a directory`, unless head reads nothing (zero units, or an
  unlimited count to leave out). `tail` exits at once after that error where tail.c reaches
  `dump_remainder` (`-c` with a count up to `OFF_T_MAX`, which ext4 can seek to in a
  directory, and `-n +0`/`-n +1`).
- **Standard input** without operands and for `-`. The terminal stops the input with
  `terminal-input-not-simulated` after the header. A second `-` continues where the first
  stopped: for a file from `<`, `head` ends exactly after what it wrote (head.c seeks back);
  for a pipe it loses the rest of the 8192-byte buffers it read for `-n`, reads only the bytes
  it writes for `-c`, and reads everything for "all but the last". `tail` always reads to the
  end, so a second `-` finds nothing.
- **UTF-8.** Output that is not valid UTF-8 (a byte count inside a character) stops the input
  with the notice `invalid-utf8-not-simulated`; the output before it stays.

## Alternatives considered

- **Parse the obsolete form and the counts inside `run`:** simpler, but then
  `head -n abc -x` would report the invalid option instead of the count, and `tail -5f` could
  not give its notice before other errors. The hooks keep the order of the real commands.
- **A `readOption` fold that builds the settings in `defineCommand`:** removes the second
  parse of the count in `run`, but needs a settings type parameter for every command, while
  only commands with checked arguments need it.
- **Numbers as JavaScript numbers:** `UINTMAX_MAX` and the overflow rules of the suffixes need
  64 bits; bigints keep the arithmetic exact.
- **Simulate `tail -f` by printing the file once:** it would pretend to follow the file.
  Following needs time and other processes, which later milestones may add.
- **Treat every directory error as non-fatal:** easier to explain, but `tail -c 5 dir file`
  really stops after the directory, because ext4 allows the seek and the later read is fatal.
- **Replace an invalid UTF-8 byte with U+FFFD:** shows something, but differs from what the
  bytes are and from what a pipe to another command would see.

## Consequences

- Later commands with obsolete forms or checked arguments (`grep -m`, `sort -k`) use the same
  hooks.
- `headSettings` and `tailSettings` read each count a second time; an invalid one there would
  be a bug in the check and throws.
- Known gaps: the pipe buffers assume that the writer has written everything before `head`
  reads, and the game's pipes never deliver less than 8192 bytes per read when more is there.
  `tail` on standard input that a pipe or file left at an offset other than 0 is not reachable,
  because the shell has no command groups yet.
- Tests that depend on details the owner cannot check on Windows (pipe buffers, `tail` on
  directories) carry `@differential` for milestone M6.
