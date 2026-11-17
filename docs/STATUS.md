# Status

_Last updated: 2026-11-17_

## Recently completed

- M1.3 Determinism: game clock that stands still until its owner advances it, with a
  read-only `Clock` view for the engine; `buildWorld` creates a checked world from a short
  spec (users and groups by name, files by path, missing parents and default owner, mode and
  mtime filled in) (ADR 0043).
- M1.2 Virtual file system, read side: path lookup component by component like the kernel
  (`.`, `..`, trailing slash, ENOENT/ENOTDIR/EACCES as values), permission checks with one
  class and root rules, tilde expansion for the shell, session start in `/` when the home
  cannot be entered (ADR 0042).
- M1.1 Core types of the engine: immutable world with hosts, users, groups and a file system
  tree of `file` and `directory` nodes; branded `Uid`/`Gid`; `createWorld` checks the
  structural rules; sessions keep the groups of their login like Linux (ADR 0041).
- M3.0f-1 and M5.1-1, done early: the owner's logo is in `assets/brand/` (SVG variants for dark
  and light backgrounds, web icons, usage rules) and in the README; the installer, the app and
  the AppImage use the PenguinOps app icon; a test guards the brand files (ADR 0040).
- Roadmap: the design language comes before the game frame screens as M3.0a–f (impeccable
  design skill, tokens, styleguide page, typography, icon style, logo); the owner drafts the
  logo in a separate chat; M5.1 keeps only the final app icon files (ADR 0039).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.4: lexer (words, quotes, escapes, operators, variables, `~`).
2. ROADMAP M1.5: parser (AST for simple commands, pipelines, lists, redirections).
3. ROADMAP M1.6: interpreter (expansion, pipelines, redirections, exit codes, `$?`); decide
   there who advances the game clock and by how much (ADR 0043).

## Blockers and open questions

- Linux is verified only by CI (no WSL locally). The AppImage itself is built but not started
  in CI (the tests start the unpacked app); a manual check on a Linux machine is still open.
- Owner task: upload `assets/brand/web/social-preview.png` in GitHub → Settings → General →
  Social preview.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
