# Status

_Last updated: 2026-11-17_

## Recently completed

- M3.0f-1 and M5.1-1, done early: the owner's logo is in `assets/brand/` (SVG variants for dark
  and light backgrounds, web icons, usage rules) and in the README; the installer, the app and
  the AppImage use the PenguinOps app icon; a test guards the brand files (ADR 0040).
- Roadmap: the design language comes before the game frame screens as M3.0a–f (impeccable
  design skill, tokens, styleguide page, typography, icon style, logo); the owner drafts the
  logo in a separate chat; M5.1 keeps only the final app icon files (ADR 0039).
- M0.11 `/adr` skill: `npm run adr:new` creates the next decision record from the template
  and updates the status lines of completely or partly superseded records; tested with Vitest
  against fixtures and the real records (ADR 0038). M0 is complete.
- M0.10 dropped: `main` stays without branch protection, so nothing in the repository
  settings gets in the way of direct pushes; the process guardrails stay (ADR 0037).
- M0.9 CI with GitHub Actions on every push to `main` and every pull request: Linux job
  (`npm run check`, end-to-end tests, AppImage, packaged app), Windows job (tests, end-to-end
  tests, installer, packaged app), documentation duty check (`npm run check:docs-duty`),
  Dependabot with grouped weekly updates, pull request template (ADR 0036).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.1: core types of the engine (world, host, file system node, user, group, session).
2. ROADMAP M1.2: virtual file system (paths, owner, group, mode, lookup errors, permission
   checks).
3. ROADMAP M1.3: determinism (injected game clock, world builder from a spec).

## Blockers and open questions

- Linux is verified only by CI (no WSL locally). The AppImage itself is built but not started
  in CI (the tests start the unpacked app); a manual check on a Linux machine is still open.
- Owner task: upload `assets/brand/web/social-preview.png` in GitHub → Settings → General →
  Social preview.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
