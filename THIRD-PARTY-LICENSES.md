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
| Mulberry32 | Code (algorithm, adapted) | https://gist.github.com/tommyettinger/46a874533244883189143505d203312c | CC0-1.0 | Seeded random generator of the engine | `packages/engine/src/random.ts`; dedicated to the public domain by Tommy Ettinger |

<!--
Example row:
| JetBrains Mono 2.304 | Font | https://github.com/JetBrains/JetBrainsMono | OFL-1.1 | Terminal font | License text in apps/ui/assets/fonts/OFL.txt |
-->
