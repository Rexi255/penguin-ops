# Level authoring

> **Status: in progress.** The schema of `level.yaml` (format 1) is implemented (ADR 0068); the
> loader, the text catalogs and the content tests follow in milestone M2. Update this guide
> whenever the schema changes. Reasons: ADR 0010, 0011, 0012, 0067, 0068.

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

`<level-id>` is a stable kebab-case ID (lowercase letters and digits, separated by single
hyphens), for example `printer-floor2`. It is stored in save files and must never change.

## Editor support

`content/schemas/level.schema.json` is a JSON Schema generated from the zod schema. VS Code
with the recommended YAML extension (`redhat.vscode-yaml`) uses it for every
`content/levels/*/level.yaml` (`.vscode/settings.json`): completion, descriptions and error
highlighting. The zod schema stays the authority: some checks (duplicate IDs, valid regular
expressions, "a directory has no content") only `npm run check` finds. After a schema change,
run `npm run schemas:update`.

## YAML and error messages

Level files are YAML 1.2: `yes` and `no` are strings, `0640` is the decimal number 640 (write
modes as `rw-r-----`), and a repeated key is an error. Tabs as indentation, unknown tags such as
`!big`, a second document after `---`, an alias without its anchor and an empty file are errors
too. The loader (ADR 0069) reports every problem with file, line and column, followed by the
path inside the level:

```
content/levels/printer-floor2/level.yaml:11:5: start.files["notes.txt"]: a start file path must be absolute or start with "~/" (the player's home)
content/levels/printer-floor2/level.yaml:14:1: tipps: unknown field "tipps"
```

A problem of a field points at the line that names the field, a problem of a list item at the
item. A missing required field points at the map that lacks it.

## `content/chapters.yaml`

The chapters file sets the order of the chapters and of the levels in each chapter (ADR 0070).
Chapter titles and texts belong in the translation catalogs, so the file holds only IDs:

```yaml
format: 1
chapters:
  - id: first-day
    levels: [first-steps, printer-floor2]
  - id: left-behind
    levels:
      - handover
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Chapters file format version, currently `1`. |
| `chapters` | yes | The chapters in game order, at least one. |
| `chapters[].id` | yes | Stable kebab-case chapter ID, unique; stored in save files, never changed. |
| `chapters[].levels` | yes | Level IDs in the order the game offers them, at least one. |

The loader also checks the levels against this file and against their folders:

- The `id` of a level is the name of its folder (`content/levels/<level-id>/level.yaml`).
- Every level that a chapter lists has a `level.yaml`.
- Every level is in exactly one chapter, and only once.

```
content/chapters.yaml:4:27: chapters[0].levels[1]: there is no level "printer-flor2" (no file levels/printer-flor2/level.yaml)
content/levels/handover/level.yaml:2:1: id: the level is in no chapter of content/chapters.yaml
```

## `level.yaml`

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Level format version: `1`. |
| `id` | yes | Stable level ID; must match the folder name. |
| `kind` | yes | `main`, `review`, `side` or `incident`. |
| `teaches` | yes | Commands introduced (for `review`: commands practised); at least one, each once. |
| `xp` | no | XP for solving, a positive integer (default 100). |
| `world` | no | Base world ID from `content/worlds/` (default: the standard office world). |
| `start.host` | no | Host the session starts on (default: the world's default host). |
| `start.cwd` | no | Start directory: absolute, `~` or starting with `~/` (default `~`). |
| `start.files` | no | Files and folders to create (see below). |
| `goal` | yes* | Rule that marks the ticket as solved. |
| `steps` | yes* | Alternative to `goal` for multi-step tickets (see below). |
| `tips` | no | List of `{ when: <rule>, say: <text key> }`; each tip is shown once. |
| `extra_goals` | no | List of `{ id, when: <rule>, xp }`; optional bonus goals with unique IDs. |
| `solutions` | yes | One or more reference solutions, each a list of command lines. |

\* Exactly one of `goal` and `steps`.

Unknown fields are errors everywhere, so a typo such as `tipps:` is found at once.

- **IDs** (`id`, `world`, step and extra goal IDs) are kebab-case. Step and extra goal IDs are
  unique within the level and stable, like the level ID.
- **Text keys** (`say`, `{ text: ... }`) are kebab-case and start with a letter, for example
  `tip-wrong-printer`. `title`, `ticket`, `hints` and `explanation` are reserved for the
  catalog's own texts.
- **Command lines** in `solutions` are single lines and not empty.

### Multi-step tickets

```yaml
steps:
  - id: find-log
    goal: { cwd_is: /var/log }
    say: found-the-logs          # optional text key, shown when the step is completed
  - id: read-log
    goal: { output_contains: "disk full" }
```

A multi-step ticket has at least two steps, each with a unique `id` and a `goal`. Save games
remember the last completed step (checkpoint). Use `goal` for a single-step ticket.

### Files in `start.files`

```yaml
start:
  files:
    "~/tickets/printer-floor2.txt": |        # literal content: technical, always English
      Device:     Inkwell P4200
      IP address: 10.20.2.50
    "~/tickets/handover.txt": { text: handover }   # prose: text from de.yaml / en.yaml
    "~/projects/": {}                         # empty directory (path ends with /)
    "/etc/app.conf": { content: "debug=false\n", owner: root, group: root, mode: "rw-r-----" }
```

`~` is the player's home directory. Default owner: the player inside `~`, otherwise `root`.

- Paths are absolute or start with `~/`, without empty components, `.` or `..`. A path that
  ends with `/` is a directory; all others are files.
- A file is a string (its content) or an object with either `content` or `text`, and optionally
  `owner`, `group` and `mode`. A directory is `{}` or an object with only `owner`, `group` and
  `mode`.
- `mode` is written like `ls -l` shows it: `rw-r-----`, `rwxr-xr-x`, with `s`/`S` for setuid
  and setgid and `t`/`T` for the sticky bit. Octal numbers are not accepted, because YAML reads
  `0640` as the decimal number 640.
- A path cannot be both a file and a directory, and nothing can lie inside a file.
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

A rule is an object with exactly one key, the rule type. Several conditions are combined with
`all`, `any` or `not`, never by writing two rule types into one object.

How rules see the world (ADR 0067):

- Paths are absolute or start with `~/` (or are `~`); `~` is the player's home directory,
  whatever the player is called. Relative paths and `~name` are invalid.
- Permissions do not count: a rule sees every file, also one the player cannot read.
- `file_contains` and `same_content` need regular files; a directory never matches.
- "Output" is everything the last input wrote to the terminal, standard output and standard
  error together. Output redirected into a file does not count.
- `output_matches` takes a JavaScript regular expression; it is found anywhere in the output,
  and `^` and `$` also match at line breaks (flags `m` and `u`).
- `all` and `any` need at least one rule.

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
      Device:     Inkwell P4200
      IP address: 10.20.2.50
    "~/tickets/printer-ground.txt": |
      Device:     Inkwell P300
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
