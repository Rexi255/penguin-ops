# 0053. Bash builtins and the first commands after bash 5.2 and coreutils

- Status: Accepted
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M1.8a adds the first real commands: `pwd`, `cd`, `whoami` and `echo`. Three of them are
bash builtins. Builtins do not read their options with glibc's `getopt_long` (ADR 0051) but with
bash's own `internal_getopt`: no permutation, no long options except `--help`, and their own
messages (`bash: cd: -x: invalid option`, then `cd: usage: cd [-L|[-P [-e]] [-@]] [dir]`, exit
status 2). ADR 0052 left open whether builtins get a second definition style or parse their
options by hand.

`cd` and `pwd` are subtle in bash: bash remembers the working directory as a text and works out
`cd docs/..` by text, with checks along the way, and only falls back to the kernel when that
fails. `echo -e` produces bytes (`\xff`), while the game's files and terminal hold text. To get
these details right, the implementation follows the source code of bash 5.2 (`builtins/cd.def`,
`builtins/echo.def`, `builtins/bashgetopt.c`, `lib/sh/pathcanon.c`, `lib/sh/pathphys.c`,
`lib/sh/strtrans.c`) and of coreutils 9.7 `whoami`, as shipped in Debian 13.

## Decision

- **`defineBuiltin`** in `packages/engine/src/builtins.ts` is the second definition style next
  to `defineCommand`. A builtin declares its option letters (all of them, as on Linux), the
  simulated letters and its synopsis. `parseBuiltinOptions` reads options like
  `internal_getopt`: clusters (`-LP`), the end of the options at the first operand, at a lone
  `-` and after `--`; `--help` asks for the help; any other word starting with `--` is the
  invalid option `--`. An unsimulated option or `--help` before the first invalid option stops
  the input with the notice `option-not-simulated` (ADR 0052); an invalid option writes bash's
  message and the usage line and gives exit status 2. Options with arguments are added when a
  builtin needs them (`history -d`).
- **The session's `cwd` is bash's `the_current_working_directory`**, the name bash remembers,
  not a resolved path. The game has no symbolic links, so this name differs from the physical
  one only in a leading `//` (POSIX lets bash keep exactly two leading slashes) and when the
  directory was removed. `src/commands/directory-names.ts` implements `make_absolute`,
  `sh_canonpath` with its stat checks (`canonicalPath`), `sh_physpath` (`physicalPath`), chdir(2)
  (`changeDirectory`) and getcwd(3) (`currentDirectory`).
- **`cd`** follows `cd_builtin` and `change_to_directory`: `cd` alone uses `HOME` (`HOME not
  set`), `cd -` uses `OLDPWD` and writes it (`OLDPWD not set`), two operands give `too many
  arguments`. `-L` (default) changes to the name worked out by text; if that fails it calls
  chdir(2) with the absolute name and then with the operand as written, and reports the error of
  the first attempt (`bash: cd: NAME: No such file or directory`, `Not a directory`,
  `Permission denied`, exit status 1). `-P` calls chdir(2) with the operand. Afterwards
  `OLDPWD` gets the old value of the `PWD` variable (empty if unset) and `PWD` the new name;
  `-Pe` returns 1 when bash cannot name the new directory. A non-empty `CDPATH` with an operand
  that does not start like a path (`/`, `.`, `..`) stops the input with the new notice
  `variable-not-simulated`, because the game does not search `CDPATH` yet.
- **`pwd`** writes the remembered name; `-P` resolves it by text and checks every step, falls
  back to getcwd(3) and remembers that answer, and fails with bash's `getcwd: cannot access
  parent directories` message in a removed directory. Operands are ignored, as in bash.
- **`echo`** has no option parser: leading words made only of `n`, `e` and `E` are options. `-e`
  translates escapes like `ansicstr` for echo: `\0` with up to three octal digits, `\x` with up
  to two hexadecimal digits, `\u`/`\U`, `\c` ends all output, and unknown escapes and `\1` to
  `\7` stay as written. The result is a byte sequence; if it is not valid UTF-8, the command
  writes nothing and stops the input with the new notice `invalid-utf8-not-simulated`.
  `src/utf8.ts` converts between text and bytes without the platform's `TextEncoder`.
- **`whoami`** uses `defineCommand` with its two options `--help` and `--version` (both
  unsimulated). An operand gives `whoami: extra operand ‘NAME’` and the "Try" line with exit
  status 1; a user ID without a user gives `cannot find name for user ID N`.
- **Coreutils quote operands with typographic quotes.** `src/quote.ts` implements gnulib's
  `quote` in the `locale_quoting_style` of an English UTF-8 locale: `‘…’`, with backslash
  escapes for `\`, the closing quote and control characters, and octal escapes for other
  non-printable characters. Messages of glibc's `getopt_long` keep their straight quotes.
- `COMMANDS` in `src/commands/index.ts` lists all simulated commands for `createCommandLookup`.

## Alternatives considered

- **Plain `ShellCommand`s that parse their options by hand:** every builtin would repeat the
  usage error, the `--help` notice and the rule for unsimulated options.
- **`parseOptions` with `require-order` for builtins:** it accepts long options and
  abbreviations (`--hel`) that bash rejects, and writes glibc's messages instead of bash's.
- **Store only the canonical path in the session and resolve every `cd` with the kernel's
  rules:** simpler, but `cd ..` would behave like `cd -P ..`, `cd //` would show `/`, and the
  fallback that lets `cd ..` work in a directory whose parent lost its search permission would
  be missing.
- **Simulate `CDPATH` now:** it needs the colon list rules of `extract_colon_unit`, tilde
  expansion in its elements and printing of the found directory; nobody needs it before a level
  asks for it. A notice is honest until then.
- **Write invalid bytes as U+FFFD or Latin-1 characters:** files would get content that the
  real command never writes, and `grep` or `wc -c` would later give wrong answers.

## Consequences

- The remaining builtins (`history` in M1.8c, later `type`, `export`, `read`) use
  `defineBuiltin`; `history -d` adds option arguments to it.
- The rule engine (M1.12) must compare working directories by their resolved path, because a
  player may stand in `//tmp`.
- Known gaps, until `rm` (M1.10) can remove the working directory: after a failed `pwd -P` in a
  removed directory bash forgets the name of its working directory, the game keeps it; and
  `cd ..` from a removed directory fails in the game, while Linux still finds the parent
  through the kernel. File names with control characters in `cd` messages are written as they
  are; bash quotes them as `$'…'`, which the game cannot type yet (ANSI-C quoting is
  unsupported).
- The UI needs messages in both languages for the notices `variable-not-simulated` and
  `invalid-utf8-not-simulated`.
