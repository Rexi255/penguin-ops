---
paths:
  - "content/**"
  - "packages/content/**"
---

# Rules for levels, worlds and translation catalogs

Full format: `docs/LEVEL-AUTHORING.md`. Reasons: ADR 0010, 0011, 0012.

## Data, not code

- Levels and worlds contain data only. Never add code or scripts to them. If a check or world
  feature cannot be expressed, propose a new engine vocabulary item to the user.
- Level IDs are stable. Never rename or reuse an existing ID; it is stored in save files.
- Schema changes need a new format version, a migration script for all levels, an update of
  `docs/LEVEL-AUTHORING.md`, and a decision record if the change is significant.

## Languages

- `de.yaml` and `en.yaml` must contain exactly the same keys; both are mandatory.
- Technical content inside the simulated world (names, paths, configs, logs, scripts, data) is
  literal English in `level.yaml`. Prose written by people in the story (notes, mails,
  handovers) uses `{ text: <key> }` and is translated.
- Check rules, tips and `grep` tasks may only refer to technical content or language-neutral
  tokens (IPs, names, error codes), never to translated text or the player's user name.
- Text markup: `code`, **bold**, lists, paragraphs. No HTML. ICU MessageFormat for placeholders
  and plurals.

## Story and curriculum

- Read `docs/STORY.md` before writing texts. Follow its tone, use its glossary, and add new
  characters, places or terms there.
- German texts address the player with "du".
- Use only commands from the current or earlier chapters (`docs/CURRICULUM.md`).
- All content is original and fictional: no real companies, brands or people; IP addresses
  from private ranges (`10.0.0.0/8`, `192.168.0.0/16`); no real email addresses or phone
  numbers.

## Solvability

- Every level has at least one reference solution; add alternatives that should also work.
- Add tips for typical mistakes.
- Run the content tests (`npm run check`) before committing.
