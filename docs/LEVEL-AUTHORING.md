# Level authoring

> **Status: in progress.** The schemas of `level.yaml` (format 1), `content/chapters.yaml`,
> the base worlds and the text catalogs, the loader and the checks of ICU, markup and
> completeness, the level session and the content test of the reference solutions are
> implemented (ADR 0068 to ADR 0078). Update this guide whenever the format changes. Reasons: ADR 0010,
> 0011, 0012, 0067 to 0078.

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

`content/schemas/level.schema.json` and `content/schemas/world.schema.json` are JSON Schemas
generated from the zod schemas. VS Code with the recommended YAML extension
(`redhat.vscode-yaml`) uses them for every `content/levels/*/level.yaml` and every
`content/worlds/*.yaml` (`.vscode/settings.json`): completion, descriptions and error
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

## Base worlds: `content/worlds/<world-id>.yaml`

A base world holds the hosts of the simulated company with their groups, users and files
(ADR 0076). Levels start from a base world and add their own start files; a level without
`world` uses the standard world `office`.

```yaml
format: 1
id: office
hosts:
  - name: desk                     # the first host is the default host
    groups:
      - { name: root, gid: 0 }
      - { name: staff, gid: 50, members: [anna] }
      - { name: anna, gid: 1001 }
    users:
      - { name: root, uid: 0 }
      - { name: anna, uid: 1001 }  # primary group: the group with the user's name
    files:
      "/etc/motd": "Welcome to the office network.
"
      "/srv/share/": { owner: anna, group: staff, mode: rwxrwsr-x }
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | World format version: `1`. |
| `id` | yes | Stable kebab-case world ID; must match the file name. |
| `hosts` | yes | At least one host; the first one is the default host. |
| `hosts[].name` | yes | Host name: lowercase letters, digits and inner hyphens, unique. |
| `hosts[].groups` | yes | `{ name, gid, members? }` in `/etc/group` order. |
| `hosts[].users` | yes | `{ name, uid, group?, home?, shell? }` in `/etc/passwd` order. |
| `hosts[].files` | no | Files and directories, written like `start.files` (see below). |

- Every host has the user `root` (UID 0) and the group `root` (GID 0). Names and IDs of users
  and groups are unique on a host; IDs are whole numbers from 0 to 4294967294.
- A user's primary group is `group`, or the group with the user's name; it must exist.
  `members` are users of the host. Defaults: home `/root` for UID 0 and `/home/<name>`
  otherwise, shell `/bin/bash`.
- **The player's account is added by the game** to every host: user and group with the
  player's name, UID and GID 1000, home `/home/<name>`. A world must not use UID or GID 1000.
  `~/` in a world file is the player's home.
- World files are always literal (technical, English): worlds have no catalogs, so
  `{ text: <key> }` is not allowed. Prose belongs in the start files of a level.

```
content/worlds/office.yaml:7:24: hosts[0].groups[1].gid: the gid 1000 belongs to the player's account
content/levels/printer-floor2/level.yaml:6:3: start.host: the world "office" has no host "server"
```

The loader also checks that a level's world exists, that its `start.host` is a host of the
world, and that the owners and groups of its start files are users and groups of the start host.

## `level.yaml`

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Level format version: `1`. |
| `id` | yes | Stable level ID; must match the folder name. |
| `kind` | yes | `main`, `review`, `side` or `incident`. |
| `teaches` | yes | Commands introduced (for `review`: commands practised); at least one, each once. |
| `xp` | no | XP for solving, a positive integer (default 100). |
| `world` | no | Base world ID from `content/worlds/` (default: the standard office world). |
| `start.host` | no | Host the session starts on (default: the world's first host). |
| `start.cwd` | no | Start directory: absolute, `~` or starting with `~/` (default `~`). |
| `start.files` | no | Files and folders to create (see below). |
| `goal` | yes* | Rule that marks the ticket as solved. |
| `steps` | yes* | Alternative to `goal` for multi-step tickets (see below). |
| `tips` | no | List of `{ when: <rule>, say: <text key> }`; each tip is shown once, before solving. |
| `extra_goals` | no | List of `{ id, when: <rule>, xp }`; bonus goals with unique IDs, each reached once. |
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

A multi-step ticket has at least two steps, each with a unique `id` and a `goal`. Use `goal`
for a single-step ticket.

- Steps are completed **in order**: after every input the next step is checked; when it holds,
  the step after it is checked against the same state. One input can complete several steps,
  but a later step that holds early waits until the steps before it are completed.
- Save games remember the last completed step (checkpoint). Resuming there plays the **first
  reference solution** until that step is completed (ADR 0077), so the first reference solution
  must pass through every step in order.

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
`owner` and `group` name users and groups of the start host's world; the player's own account
cannot be named (rules and files never depend on the player's name).

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

## How the game plays a level

The level session (ADR 0077) starts the level and evaluates its rules after every input:

- **Start:** the base world with the player's account and the start files, built at the game
  clock's time; the player is logged in on the start host in `start.cwd`. Nothing is
  evaluated at the start, and the content tests require the goal to be false there.
- **Inputs:** an input that bash would continue on the next line (open quote, trailing `|`)
  waits for the next line. A syntax error prints bash's message
  (``bash: syntax error near unexpected token `;;'``) and counts as output. Syntax the game
  does not simulate yet shows a game notice and runs nothing.
- **Order after an input:** first the goal or the next steps, then the extra goals, then the
  tips. A solved ticket stays solved.
- **Extra goals** are reached once each, also after the ticket is solved.
- **Tips** are shown once each, in the order of `tips`, only while the ticket is not solved;
  the input that solves the ticket shows none.

## Texts: `de.yaml` and `en.yaml`

Every level has an English (`en.yaml`) and a German (`de.yaml`) catalog next to its
`level.yaml`; both must contain exactly the same keys (ADR 0012, ADR 0071, ADR 0075).

| Key | Required | Meaning |
|---|---|---|
| `title` | yes | Ticket title, one paragraph; shown in the ticket panel and the top bar. |
| `ticket` | yes | Ticket text shown in the ticket panel. |
| `hints` | yes | Exactly three hints: tip, concrete tip, solution. |
| `explanation.text` | yes | Explanation shown after solving. |
| `explanation.options` | no | List of `[option, description]` pairs. |
| `explanation.example` | no | A command to try. |
| `extra_goals.<id>` | no | Description of each extra goal, by its ID. |
| any other key | no | Prose file contents, tips and step messages referenced from `level.yaml`; tips and step messages appear under the ticket text in the ticket panel. |

- Every text is a string and not empty. Long texts use a YAML block (`|`), which keeps the
  line breaks and ends with one.
- Other keys are text keys: kebab-case, starting with a letter, like in `level.yaml`.
  `explanation` takes no other fields; unknown fields are errors.
- Catalogs have no `format` field; they follow the format of their level.

**Further languages** (`fr.yaml`, `pt-br.yaml`, ...) may be incomplete: every key is optional,
and missing texts fall back to English (ADR 0074). Each text falls back on its own; the three
hints and the option table only as a whole, so give all three hints or none. A level without a
catalog in the language is shown in English. A fallback text keeps English plurals and
numbers. What is there is checked like in English: three hints, options as pairs, valid keys,
ICU and markup. A catalog file is named after its language code: two or three lowercase
letters, optionally a hyphen and a lowercase region (`de`, `en`, `pt-br`); `Intl` must know the
language. The content tests list the missing texts of every further language; they are not
errors.

The loader reports a catalog without `level.yaml` in its folder, a file name that is not a
language code (for example `notes.yaml`), a catalog given twice and a missing English or German
catalog:

```
content/levels/printer-floor2/de.yaml:1:1: the German catalog is missing: every level needs en.yaml and de.yaml
content/levels/printer-floor2/notes.yaml:1:1: "notes.yaml" is not named after a language: a catalog is named after its language code, for example de.yaml, en.yaml or pt-br.yaml
content/levels/printer-floor2/en.yaml:9:1: hints: a level has exactly three hints: a tip, a concrete tip and the solution
```

### Completeness

The loader also compares the catalogs with `level.yaml` and with English (ADR 0075):

- English and German hold every text key that `level.yaml` uses (`{ text: <key> }`, the `say`
  of tips and steps) and `extra_goals.<id>` for every extra goal.
- No catalog holds a free text or an extra goal that `level.yaml` does not use: delete
  leftovers, fix typos.
- A text key is either a file content or a message (tip, step), never both.
- `explanation.options` and `explanation.example` are commands and the same in every language:
  German repeats them exactly, in the same order. A further language may leave them out or
  write `options: []` for no table.
- UI catalogs: German has every key of English; no catalog has keys that English lacks. A UI
  text uses the same placeholders as its English text, in the same way.

```
content/levels/printer-floor2/de.yaml:1:1: the text "tip-wrong-printer" is missing: level.yaml uses it
content/levels/printer-floor2/en.yaml:12:1: ["tip-old"]: level.yaml does not use the text "tip-old"
content/ui/de.yaml:2:1: status.solved: the placeholders must be the same as in English: {count} (number)
```

### Markup

Texts have a small markup (ADR 0073); there is no HTML, so `<b>` is shown as written.

```yaml
ticket: |
  Hi,
  the printer on the second floor prints **blank pages**.
  Please check:
  - the toner
  - the queue with `lpq`

  Thanks, Petra
```

- **Lines:** a line break is kept as written. An empty line (or one of spaces) starts a new
  paragraph. Write each paragraph on one line, however long: the UI wraps it to the width of the
  panel, and a paragraph wrapped by hand keeps its breaks in the middle of the panel's lines.
- **Lists:** a line that starts with `- ` (hyphen and space) is a list item; consecutive items
  form a list, also right after a paragraph line. A line without `- ` ends the list. There are
  no nested or numbered lists.
- **Bold:** `**bold**`, opened and closed on the same line (and inside the same plural or
  select option). A single `*` is text.
- **Code:** `` `code` `` (see below); asterisks and hyphens inside code are not markup.
- Values that the game puts into placeholders are never markup.

The loader reports bold that is not closed on its line or in its option, empty bold, bold
around a plural or select option with a line break, and an empty list item. Prose file texts
(`{ text: <key> }`), `explanation.example` and the option column of `explanation.options` are
not markup.

### Placeholders, plurals and code (ICU MessageFormat)

Placeholders and plurals use ICU MessageFormat (ADR 0072), with three simplifications for texts
about the shell:

- **Code is literal.** Everything between two backticks on one line stays exactly as written:
  `` `awk '{print $1}' file` `` and `` `find . -exec rm {} \;` `` need no escaping. A code span
  must be closed on its line and must not be empty.
- **Apostrophes are literal.** `It's` and `geht's` keep their apostrophes, also before a brace;
  ICU's quoting with `'{'` does not exist. A literal brace outside code is not possible: put it
  in code.
- **Tags are text.** `<file>` and `a > b` are shown as written; there is no HTML.

Outside code, `{` starts a placeholder:

| Form | Example |
|---|---|
| Text value | `Hello {name}` |
| Number in the language's format | `{size, number}` |
| Plural | `{count, plural, =0 {no files} one {# file} other {# files}}` |
| Ordinal | `{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}` |
| Choice | `{kind, select, file {a file} other {a folder}}` |

- Placeholder names are camelCase (`fileCount`). `plural`, `selectordinal` and `select` need
  an `other` option; plural options must exist in the catalog's language (`few` is fine in
  Polish, a problem in English). Dates and times are not supported.
- **Level texts have no placeholders yet:** the game passes no values to them. UI texts may use
  placeholders.
- Not formatted at all (neither ICU nor markup): `explanation.example`, the option column of
  `explanation.options`, and texts used as file contents with `{ text: <key> }`. A note in the
  simulated world may contain braces and backticks.

Problems point at the spot inside the text (exactly for `|` blocks and one-line texts without
escapes):

```
content/levels/printer-floor2/en.yaml:9:8: ["tip-wrong"]: a placeholder is not closed: "}" is missing
content/ui/de.yaml:3:21: status.solved: the plural option "few" does not exist in "de", which has one, other and exact numbers like =0
```

## UI texts: `content/ui/<language>.yaml`

General texts of the game (menus, settings, messages) live in `content/ui/en.yaml`,
`content/ui/de.yaml` and optionally further languages. A UI catalog groups texts in nested
maps; the game uses the dotted key, for example `menu.new-game`:

```yaml
menu:
  new-game: New game
  settings:
    title: Settings
```

Keys are kebab-case and start with a letter; a group is never empty; every text is a string
and not empty. English and German are mandatory.

The UI decides which keys exist: `UI_TEXT_PLACEHOLDERS` in `apps/ui/src/texts/ui-texts.ts`
lists every key with the values the UI passes, and a test fails if the English or German
catalog lacks a key, has a key the UI does not use, or uses other placeholders (ADR 0090). A
new UI text therefore needs its key there and in both catalogs. Labels, menu entries and texts
in attributes must be one paragraph.

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

- Schema validation of every `level.yaml`, of `content/chapters.yaml`, of every world and of
  every catalog, and the checks of levels against their worlds.
- ICU and markup of every text, and the completeness of the catalogs (see above).
- The content test (`tests/content/`, ADR 0078) loads `content/` and plays every reference
  solution in English, German and every further language, with the player names `alice` and
  `max-2`. It fails if a level cannot start, if the goal, a step, a tip or an extra goal fires
  before the first input, if a command line is incomplete or uses something the game does not
  simulate, if a tip fires during a solution, if a solution does not solve the ticket, or if a
  checkpoint cannot resume. Any other file in `content/` fails it too. Run it alone with
  `npx vitest run --project content-tests`.
- The texts that further languages lack are printed by the content test; they are not errors.

## Checklist for a new level

1. Pick the chapter and the commands from `docs/CURRICULUM.md`.
2. Create the folder with `level.yaml`, `de.yaml`, `en.yaml` (the `/new-level` skill guides
   Claude Code through this checklist).
3. Prose files use `{ text: key }`; technical files are literal English.
4. Write at least one reference solution; add alternatives that should also work.
5. Add tips for typical mistakes.
6. Add the level to `content/chapters.yaml`.
7. Run `npm run check`; play it once with the developer mode.
8. Update `docs/STORY.md` if new characters, places or terms appear.
