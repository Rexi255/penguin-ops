# 0012. Internationalization: German and English, Linux world in English

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The game is bilingual (German and English) and should make more languages easy to add. Level
data must stay language-independent, and check rules must never depend on translated text.
Real Linux systems, logs and man pages are English, while notes written by colleagues in a
German company would be German.

## Decision

- **What is translated:** UI, tickets, level titles, hints, explanations, story, ranks, game
  messages (including the output of the game commands `help` and `hint`), the in-game
  handbook, and **prose files** inside the simulated world (notes, mails, handovers,
  colleagues' READMEs).
- **What is always English:** everything technical in the simulated Linux world: folder and
  file names, paths, commands and options, user, group and host names, domains, configs, logs,
  `/etc/*`, scripts, data lists, output and error messages of simulated commands, and `man`
  pages.
- **Catalogs:** YAML files per level (`de.yaml`, `en.yaml` next to `level.yaml`) plus
  `content/ui/<lang>.yaml` for general texts. Placeholders and plurals use ICU MessageFormat
  (`intl-messageformat`). Texts support a small markup: `code`, **bold**, lists and paragraphs;
  no HTML.
- **Prose files:** in `level.yaml`, `{ text: <key> }` marks a file whose content comes from the
  catalogs; literal content stays English. Check rules and `grep` tasks only refer to technical
  content or language-neutral tokens (IPs, names, error codes). The per-language solvability
  test (ADR 0011) enforces this.
- **Languages:** German and English are mandatory and must be complete; CI fails otherwise.
  Additional languages may be incomplete; missing texts fall back to English and CI only
  reports them.
- **Default language:** the operating system's locale (German if it starts with `de`,
  otherwise English); the player's choice is stored in the settings (ADR 0013). Switching
  language during a ticket restarts the ticket after a confirmation, so translated files stay
  consistent.
- German texts address the player with "du".

## Alternatives considered

- **i18next with JSON:** widely known, but long ticket texts in JSON are unreadable and all
  texts would sit far away from their level.
- **Fluent (.ftl):** powerful, but an extra syntax that is oversized for this project.
- **All file contents English:** simpler, but builds a language barrier into a flat learning
  curve for German beginners.
- **All file contents translated, including logs and configs:** unrealistic.

## Consequences

- A level is one folder with data and both languages side by side.
- Completeness and solvability are checked per language in CI.
