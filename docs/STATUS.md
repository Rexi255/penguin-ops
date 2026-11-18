# Status

_Last updated: 2026-11-18_

## Recently completed

- M1.10c `mv` (coreutils 9.7): rename first without replacing, then the target directory;
  move-mode checks of `copy_internal` (same file, directory over file, just-created
  destinations, repeated directories), the errors "subdirectory of itself", "cannot overwrite"
  and "cannot move", `-f`, `-v`, `-t`, `-T`, `--strip-trailing-slashes`; the question before a
  write-protected destination stops with a notice. New `fs-rename.ts` (ADR 0063).
- M1.10b `cp` (coreutils 9.7): files and `-r` like `copy_internal` (target directory, same
  file, overwrite checks, new files with the source's bits minus the umask, directories filled
  with owner rights and fixed afterwards, "into itself" and repeated operands by canonical
  paths), `-f`, `-v`, `-t`, `-T`. New `changeMode`, `createMode`, mkdir modes and
  `file-names.ts` (ADR 0062).
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

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.10d: `grep`.
2. ROADMAP M1.11: tab completion and history navigation APIs.
3. ROADMAP M1.12: rule engine.

## Blockers and open questions

- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- Some details of `ls`, `clear`, `history`, `cat`, `head`, `tail`, `touch`, `rm`, `cp` and `mv`
  could not be checked against a real Debian 13 (tests marked `@differential`, ADR 0054 to
  ADR 0063); M6 verifies them.
