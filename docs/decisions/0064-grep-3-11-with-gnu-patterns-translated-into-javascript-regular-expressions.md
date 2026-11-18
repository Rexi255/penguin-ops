# 0064. grep 3.11 with GNU patterns translated into JavaScript regular expressions

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.10d adds `grep` with `-i`, `-v`, `-n`, `-c`, `-r` and `-l`. It is the most important
search tool of the curriculum: players look for errors in logs, for settings in configuration
files and for files below a directory.

GNU grep reads its patterns as POSIX basic (`-G`) or extended (`-E`) regular expressions with
GNU extensions (`\+`, `\|`, `\<`, `\w`, back-references), or as fixed strings (`-F`). It checks
each pattern with glibc's regcomp, whose messages players see ("Unmatched [, [^, [:, [., or
[="), and then compiles all patterns with gnulib's dfa, which since grep 3.8 warns about stray
backslashes and repetitions at the start. Writing a POSIX matcher would be large; the engine
already has JavaScript's regular expressions, which are part of the language and pure.

Debian 13 ships grep 3.11. Its source was not reachable from the session; the implementation
follows the source code of an earlier grep 3.x (`src/grep.c`), grep's NEWS up to 3.11, and the
documented behaviour of glibc's regcomp and gnulib's dfa.

## Decision

- **Patterns.** The new `src/grep-pattern.ts` translates one GNU pattern (basic or extended)
  into the source of a JavaScript regular expression with the `u` flag (and `i` for `-i`).
  Whether a line contains a match does not depend on POSIX's leftmost-longest rule, so
  backtracking finds the same lines; grep's `-o` and colours, which depend on it, are not
  simulated. The rules: `.` and bracket expressions (ranges by code point, `[:class:]`, `[=c=]`,
  `[.c.]`, `]` first, a literal backslash); basic `\( \) \| \+ \? \{m,n\}`, `*` ordinary at the
  start, `^` and `$` anchors only at the ends of an expression; extended `( ) | + ? {m,n}`, an
  invalid interval makes `{` ordinary; back-references to closed groups; `\< \> \b \B \w \W \s
  \S` and `` \` `` `\'`. Word characters are letters, digits and `_`; the classes follow glibc's
  UTF-8 locales as Unicode properties (an approximation).
- **Errors and warnings.** regcomp's errors (`Unmatched ( or \(`, `Unmatched ) or \)`,
  `Unmatched \{`, `Invalid content of \{\}`, `Invalid range end`, `Invalid character class
  name`, `Invalid collation character`, `Trailing backslash`, `Invalid back reference`,
  `Regular expression too big`) are reported for every pattern, then grep exits with status 2.
  After that, dfa's warnings come in pattern order: `stray \ before C` (also `white space`
  and `unprintable character`) for a backslash before a character without a meaning, and, in
  extended patterns, `* at start of expression` (also `+`, `?`, `{...}`), after which the
  operator is ignored. dfa's error `character class syntax is [[:space:]], not [:space:]` ends
  grep too.
- **`grep`** has the complete option table of grep 3.11 (with `-y` and the context digits).
  `-G`, `-E`, `-F`, `-e`, `-i`/`-y`, `--no-ignore-case`, `-v`, `-w`, `-x`, `-n`, `-c`, `-l`, `-L`,
  `-q`, `-s`, `-H`, `-h`, `-r` and `-R` (the game has no symbolic links) are simulated; all
  others give the notice `option-not-simulated`. Two different matchers give `conflicting
  matchers specified`. Usage errors write glibc's message, `Usage: grep [OPTION]... PATTERNS
  [FILE]...` and the Try line, with exit status 2.
- **Input.** Patterns come from `-e` or the first operand, split at line breaks. Without file
  operands grep reads standard input (the terminal stops with
  `terminal-input-not-simulated`), or `.` with `-r`, then without the leading `./` in names.
  `-r` walks directories in the order of their entries. A file that cannot be read gives
  `grep: NAME: MESSAGE` (also `Is a directory` without `-r`), hidden by `-s`; a file that is
  standard output's file gives `input file is also the output` unless grep prints no lines; a
  file with a NUL byte prints `grep: NAME: binary file matches` instead of its lines.
- **Output and status** follow `grepdesc`: file names before lines with several operands (or
  for `-r` on a directory), `-H`/`-h` decide otherwise; `-n` adds the line number; `-c`, `-l`,
  `-L` and `-q` override each other as in grep.c; `-q` exits with 0 at the first selected line.
  The exit status is 2 after any error, else 0 if a line was selected and 1 if not; `-v` with
  only empty patterns exits with 1 without reading anything.

## Alternatives considered

- **Write a POSIX matcher (leftmost-longest):** needed only for `-o` and colours; much larger,
  and the line selection would not change.
- **Hand patterns to JavaScript almost unchanged:** fast to write, but `\(`, `\|`, `\<`, POSIX
  classes and the context rules of `*` and `^` differ, and the messages would be JavaScript's.
- **Simulate context options (`-A`, `-B`, `-C`), `-o`, `-m` and `--color` now:** useful, but not
  part of this work package; they are ideas for a later one.
- **Sort the entries of `-r`:** grep uses fts without sorting, so the order is the directory's;
  tests that depend on it are `@differential`.

## Consequences

- With M1.10d, the commands of the prototype list (M1.10) are complete.
- `grep-pattern.ts` can serve later commands with GNU patterns (`sed`, `find -regex`), with
  their own syntax bits.
- Known gaps: the character classes are Unicode approximations of glibc's tables; whether
  `-E -F` still conflict in grep 3.11 could not be checked and is `@differential`; binary
  detection only looks for NUL bytes, as the game's files are always valid UTF-8.
