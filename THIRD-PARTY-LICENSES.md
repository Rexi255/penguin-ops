# Third-party licenses

PenguinOps itself is licensed under the [MIT License](LICENSE). This file lists third-party
content that was **added by hand**: fonts, images, sounds, music and copied code. Allowed
licenses: [ADR 0005](docs/decisions/0005-mit-license-and-dependency-allowlist.md).

- **npm dependencies** are not listed here. Their license texts are generated automatically for
  every release and shipped with it.
- **Electron** ships Chromium's third-party notices (`LICENSES.chromium.html`) inside the
  installed app. This includes the ffmpeg library under LGPL-2.1+, an approved exception.

## Hand-added content

| Name | Type | Source | License | Used for | Notes |
|---|---|---|---|---|---|
| Geist Mono Bold | Font (glyph outlines) | https://github.com/vercel/geist-font | OFL-1.1 | Wordmark of the logo | Converted to paths in `assets/brand/svg/logo-wordmark-*.svg` and `logo-horizontal-*.svg` and in the raster images made from them; the font file is not shipped. © The Geist Project Authors |
| impeccable 4.9.1 | Code (Claude Code skill, unchanged copy) | https://github.com/pbakaus/impeccable (tag `cli-v4.9.1`) | Apache-2.0 | Design skill for Claude Code sessions; not part of the app | `.claude/skills/impeccable/`, with its `LICENSE` and `NOTICE.md` (which credits MIT-licensed content by ehmo); © Paul Bakaus. The engine binary is downloaded at run time, not committed (ADR 0080) |
| Mulberry32 | Code (algorithm, adapted) | https://gist.github.com/tommyettinger/46a874533244883189143505d203312c | CC0-1.0 | Seeded random generator of the engine | `packages/engine/src/random.ts`; dedicated to the public domain by Tommy Ettinger |

<!--
Example row:
| JetBrains Mono 2.304 | Font | https://github.com/JetBrains/JetBrainsMono | OFL-1.1 | Terminal font | License text in apps/ui/assets/fonts/OFL.txt |
-->
