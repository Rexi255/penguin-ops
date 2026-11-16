# Level authoring

> **Status: draft.** The format is implemented in milestone M2. This guide describes the
> target. Update it whenever the schema changes. Reasons: ADR 0010, 0011, 0012.

## Principles

- A level is **data only**. Never put code into a level. If something cannot be expressed, add
  a new rule type or building block to the engine (with tests) and document it here.
- Level data is **language-independent**; all player-facing text lives in the catalogs.
- Inside the simulated world everything technical is **English**: names, paths, commands,
  configs, logs. Prose written by people in the story (notes, mails) is translated.
- Check rules never depend on translated text or on the player's user name.
- Every level is provably solvable: reference solutions are mandatory and tested.
- Before writing texts, read `docs/STORY.md` (characters, tone, glossary). German texts use
  "du".

## Folder structure

```
content/
  chapters.yaml                 order of chapters and their levels
  levels/<level-id>/
    level.yaml                  data: world, goal, tips, extra goals, solutions
    de.yaml                     German texts
    en.yaml                     English texts
  ui/de.yaml, ui/en.yaml        general UI texts
  worlds/<world-id>.yaml        shared base worlds
```

`<level-id>` is a stable kebab-case ID, for example `printer-floor2`. It is stored in save
files and must never change.

## `level.yaml`

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Level format version (starts at 1). |
| `id` | yes | Stable level ID; must match the folder name. |
| `kind` | yes | `main`, `review`, `side` or `incident`. |
| `teaches` | yes | Commands introduced (for `review`: commands practised). |
| `xp` | no | XP for solving (default 100). |
| `world` | no | Base world from `content/worlds/` (default: the standard office host). |
| `start.host` | no | Host the session starts on. |
| `start.cwd` | no | Start directory (default `~`). |
| `start.files` | no | Files and folders to create (see below). |
| `goal` | yes* | Rule that marks the ticket as solved. |
| `steps` | yes* | Alternative to `goal` for multi-step tickets: a list of `{ goal, on_complete }`. |
| `tips` | no | List of `{ when: <rule>, say: <text key> }`; each tip is shown once. |
| `extra_goals` | no | List of `{ id, when: <rule>, xp }`; optional bonus goals. |
| `solutions` | yes | One or more reference solutions, each a list of commands. |

\* Exactly one of `goal` and `steps`.

### Files in `start.files`

```yaml
start:
  files:
    "~/tickets/printer-floor2.txt": |        # literal content: technical, always English
      Device:     Kyocera ECOSYS M3655idn
      IP address: 10.20.2.50
    "~/tickets/handover.txt": { text: handover }   # prose: text from de.yaml / en.yaml
    "~/projects/": {}                         # empty directory (path ends with /)
    "/etc/app.conf": { content: "debug=false\n", owner: root, group: root, mode: "rw-r-----" }
```

`~` is the player's home directory. Default owner: the player inside `~`, otherwise `root`.
Planned later: `{ generate: <generator>, seed: <n>, ... }` for deterministic generated data
(e.g. large logs).

### Rule types

| Rule | Meaning |
|---|---|
| `cwd_is: <path>` | Current directory equals the path. |
| `exists: <path>` | File or directory exists. |
| `file_exists: <path>` | Regular file exists. |
| `dir_exists: <path>` | Directory exists. |
| `file_contains: [<path>, <text>]` | File contains the text. |
| `same_content: [<path>, <path>]` | Both files exist with identical content. |
| `output_contains: <text>` | Output of the last command contains the text. |
| `output_matches: <regex>` | Output of the last command matches the regular expression. |
| `all: [<rule>, ...]` | All rules are true. |
| `any: [<rule>, ...]` | At least one rule is true. |
| `not: <rule>` | The rule is false. |

New rule types (e.g. `mode_is`, `owner_is`, `service_running`, `script_works`) are added to this
table when the engine gains them.

## Texts: `de.yaml` and `en.yaml`

Both files must contain exactly the same keys.

| Key | Meaning |
|---|---|
| `title` | Ticket title. |
| `ticket` | Ticket text shown in the ticket panel. |
| `hints` | Exactly three hints: tip, concrete tip, solution. |
| `explanation.text` | Explanation shown after solving. |
| `explanation.options` | List of `[option, description]` pairs. |
| `explanation.example` | A command to try. |
| `extra_goals.<id>` | Description of each extra goal. |
| any other key | Prose file contents and tip texts referenced from `level.yaml`. |

Markup in texts: `` `code` ``, `**bold**`, lines starting with `- ` form a list, an empty line
starts a new paragraph. No HTML. Placeholders and plurals use ICU MessageFormat, e.g.
`{count, plural, one {# file} other {# files}}`.

## Example

```yaml
# content/levels/printer-floor2/level.yaml
format: 1
id: printer-floor2
kind: main
teaches: [cat]
xp: 100
start:
  files:
    "~/tickets/handover.txt": { text: handover }
    "~/tickets/printer-floor2.txt": |
      Device:     Kyocera ECOSYS M3655idn
      IP address: 10.20.2.50
    "~/tickets/printer-ground.txt": |
      Device:     Brother HL-L5100DN
      IP address: 10.20.0.41
goal:
  output_contains: "10.20.2.50"
tips:
  - when: { output_contains: "10.20.0.41" }
    say: tip-wrong-printer
solutions:
  - ["cat ~/tickets/handover.txt", "cat ~/tickets/printer-floor2.txt"]
  - ["cat ~/tickets/printer-floor2.txt"]
```

```yaml
# content/levels/printer-floor2/en.yaml
title: The printer on the second floor
ticket: |
  Ms Petersen from the office calls: the printer on the second floor does not print.
  Read Mehmet's handover in `~/tickets/handover.txt` and find the printer's **IP address**.
handover: |
  Hi! I'm away for two weeks from tomorrow. All data about the printer on the
  second floor is in printer-floor2.txt in the same folder. Cheers, Mehmet
tip-wrong-printer: That is the printer on the ground floor. We need the one on the second floor.
hints:
  - The handover is a text file. One command simply prints a file's content.
  - "`cat file` prints a file. Read the handover first: it names the file with the device data."
  - "`cat ~/tickets/handover.txt`, then `cat ~/tickets/printer-floor2.txt`"
explanation:
  text: "`cat` (concatenate) prints the content of files."
  options:
    - ["cat file", "Print the content"]
    - ["cat -n file", "With line numbers"]
  example: "cat -n /etc/hosts"
```

## Automated checks (run by `npm run check`)

- Schema validation of every `level.yaml` and of `content/chapters.yaml`.
- German and English catalogs contain exactly the keys the level needs.
- Every reference solution, in every language and with two different user names: the goal is
  not reached at the start, it is reached after the solution, and no tip fires on the way.

## Checklist for a new level

1. Pick the chapter and the commands from `docs/CURRICULUM.md`.
2. Create the folder with `level.yaml`, `de.yaml`, `en.yaml` (use `/new-level` once it exists).
3. Prose files use `{ text: key }`; technical files are literal English.
4. Write at least one reference solution; add alternatives that should also work.
5. Add tips for typical mistakes.
6. Add the level to `content/chapters.yaml`.
7. Run `npm run check`; play it once with the developer mode.
8. Update `docs/STORY.md` if new characters, places or terms appear.
