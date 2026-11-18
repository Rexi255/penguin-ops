# Status

_Last updated: 2026-11-18_

## Recently completed

- M1.10a `rm` (coreutils 9.7): files, `-r`/`-R` like remove.c's fts walk (entries that stay
  keep their directories without a message, unreadable empty directories go), `-d`, `-f`, `-v`,
  `--preserve-root`, refusal of `.`/`..` and `/`, the `./-x` hint; questions on the terminal
  stop with `terminal-input-not-simulated` and keep earlier removals (`CommandStop.world`,
  partly superseding ADR 0052). New `fs-remove.ts` and `fs-tree.ts` (ADR 0061).
- M1.9c `mkdir` and `touch` (coreutils 9.7): `mkdir` with `-p` like gnulib's `mkancesdirs`
  (umask of the directories on the way, chdir and mkdir errors) and `-v`; `touch` with `-a`,
  `-c`, `-f`, `-h`, `-m`, `-r` and `-`, and touch.c's choice between "cannot touch" and
  "setting times of". New `makeDirectory` and `setTimes` (utimensat permissions) in
  `fs-write.ts` (ADR 0060).
- M1.9b `head` and `tail` (coreutils 9.7): `-n`, `-c` (`head` with `-N` for "all but the
  last", `tail` with `+N` from the start), headers with `-q`/`-v`, `-z`, the obsolete forms
  (`head -5c`, `tail +5`, `tail -5f`), gnulib's counts with suffixes (`src/xstrtol.ts`), how far
  a `-` reads a pipe or file. `defineCommand` gets the hooks `obsoleteSyntax` and `checkOption`;
  `tail -f` gives a notice (ADR 0059).
- M1.9a `cat` (coreutils 9.7): files and standard input (`-`, read once), all formatting
  options (`-b`, `-n`, `-s`, `-v`, `-E`, `-T`, `-A`, `-e`, `-t`, `-u`) as a translation of
  `cat.c`'s state machine that carries over between files, errors with `quotef` names, "input
  file is output file" like `cat.c` (`cat a >> a`), and the new notice
  `terminal-input-not-simulated` for `cat` on the terminal. Commands learn the files of `<` and
  `>`/`>>` (`stdin.file`, `stdoutFile`) (ADR 0058).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.10b: `cp` (`-r`).
2. ROADMAP M1.10c: `mv`.
3. ROADMAP M1.10d: `grep`.

## Blockers and open questions

- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- Some details of `ls`, `clear`, `history`, `cat`, `head`, `tail`, `touch` and `rm` could not
  be checked against a real Debian 13 (tests marked `@differential`, ADR 0054 to ADR 0061); M6
  verifies them.
