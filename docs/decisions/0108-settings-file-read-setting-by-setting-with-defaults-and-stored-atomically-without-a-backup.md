# 0108. Settings file read setting by setting with defaults and stored atomically without a backup

- Status: Accepted
- Date: 2026-11-24
- Supersedes: –

## Context

ADR 0013 decided that the settings are global, not per save slot: language, volumes,
fullscreen, font size, colour scheme, effects and reduce motion. ADR 0012 stores the player's
language there, with the system's language as the default; ADR 0020 starts the game in
fullscreen and names the colour schemes, the effects (glow, scanlines) and three volumes
(master, music, effects). ROADMAP M3.8 is split into the settings model and file (M3.8a), the
settings screen with language and fullscreen (M3.8b), and font size, reduce motion, volumes,
colour scheme and effects (M3.8c); the colour schemes and effects work from M3.9, the sounds
from M3.10.

The save slots already have a format with versions and migrations (ADR 0104) and files that the
main process stores as texts with atomic writes (ADR 0105). Settings differ from saves in one
way that matters: they are replaceable. A broken save must never be overwritten, because the
player's progress may still be in it; a broken settings file costs the player a few clicks at
most, and a game that does not start because of it would cost much more.

## Decision

- **Format.** `packages/gameplay/src/settings.ts` defines version 1 of the settings file: JSON
  with `format: "penguin-ops-settings"`, `version`, `language` (`system`, `en`, `de`), `volumes`
  (`master`, `music`, `effects`, whole percentages from 0 to 100), `fullscreen`, `fontSize`
  (whole percentage of the design's type scale from 80 to 200), `colorScheme` (`default`,
  `retro-crt`, `solarized`, `high-contrast`), `effects` (`glow`, `scanlines`) and
  `reduceMotion` (`system`, `on`, `off`). `serializeSettings` writes every setting in a fixed
  order. Format changes add a migration and a stored example file in
  `packages/gameplay/settings-fixtures/`, like the save format.
- **Defaults.** The system's language and the system's reduce motion setting
  (`prefers-reduced-motion`), fullscreen on, font size 100, the default colour scheme, no
  effects, and the volumes master 80, music 50, effects 80.
- **Reading never refuses.** `parseSettings` reads every setting on its own. A text that is no
  JSON or no settings file, a broken `version` and a file of a newer version give the default
  settings; a missing or invalid setting gives only that setting's default; an unknown field is
  ignored. Every problem is returned with a code, and the renderer writes it to the log.
- **A newer file is not used.** Its settings may mean something else in the newer version, so
  an older game uses its defaults instead of guessing. The file stays as it is until the player
  changes a setting.
- **Not written back at start.** The renderer only reads the file at start, also when it found
  problems or migrated it; the file is written when the player changes a setting (M3.8b, M3.8c).
  The whole file is written, with every setting.
- **The model lists every setting of ADR 0013 now.** Values whose effect comes later (the
  colour schemes other than `default`, the effects, the volumes) are part of version 1 already,
  so that adding their effect needs no format change. The settings screens offer a value only
  when it works.
- **Storage.** The main process stores the text, like a save, without parsing it, in
  `settings.json` directly in `app.getPath("userData")` (on Windows
  `%APPDATA%\PenguinOps\settings.json`), next to the `saves` folder. The write is atomic
  (temporary file, flushed, renamed, with the rename retries for Windows of ADR 0105); reads and
  writes run one after the other. The atomic writing moves from the save store to
  `apps/desktop/src/main/stored-files.ts`, which both stores use. The preload API `settings`
  has `read` and `write`; the main process accepts only a text of at most 64 KiB.
- **No backup.** A settings file that cannot be read gives the defaults; a backup would only
  spare the player setting a few settings again.
- **Language at start.** `gameLanguage` in the gameplay package turns the language setting and
  `navigator.language` into the game's language; it replaces `languageForLocale` of ADR 0090
  with the same rule for the system's language (German for a locale that starts with `de`,
  otherwise English).

## Alternatives considered

- **Refuse a broken file like a save (ADR 0104):** the player would have to repair or delete a
  file to start the game, for settings they can set again in a few seconds.
- **Use the valid fields of a newer file:** convenient when a newer version only added a
  setting, but wrong when it changed the meaning of one; the defaults are always safe.
- **Rewrite the file at start after a migration or with problems:** keeps the file clean, but
  writes without the player doing anything and would destroy the settings of a newer version
  that the player still uses.
- **A backup like the save slots:** more files and code for something the defaults already
  cover.
- **Only the settings that work today in version 1:** each later work package would then change
  the format and add a migration for a plain addition.
- **Parse the settings in the main process,** which needs fullscreen before the window shows:
  `apps/desktop` may not import the gameplay package (ADR 0006, ADR 0033). M3.8b decides how the
  window learns the fullscreen setting.

## Consequences

- M3.8b and M3.8c only add the screens and the effect of each setting; the format, the file and
  the preload API are ready.
- The window does not know the fullscreen setting yet; M3.8b has to bring it from the renderer
  or read it in the main process without the gameplay package.
- The settings of an older version are read with migrations, which every format change has to
  add with an example file.
