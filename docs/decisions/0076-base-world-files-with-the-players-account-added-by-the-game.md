# 0076. Base world files with the player's account added by the game

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

Every level starts from a world: hosts with users, groups and files (ADR 0009, ADR 0041). The
level format already has `world` ("base world ID from `content/worlds/`, default: the standard
office world") and `start.host` (ADR 0068), but the format of `content/worlds/` and its loading
were left to the level session (ROADMAP M2.5, STATUS). The engine builds worlds from a short
`WorldSpec` (ADR 0043); the content package may only import engine types (ADR 0006), so it
cannot build a world itself.

The player's Linux account carries the name the player chose (ADR 0019), which a world file
cannot know, and check rules must never depend on it.

## Decision

- **File:** `content/worlds/<world-id>.yaml` with `format: 1`, a kebab-case `id` equal to the
  file name, and `hosts`, a non-empty list. The **first host is the default host**, where a
  level without `start.host` starts. The standard world of levels without `world` has the ID
  `office`.
- **Host:** `name` (a host name as the engine allows it), `groups` (`name`, `gid`, optional
  `members`), `users` (`name`, `uid`, optional `group`, `home`, `shell` with the engine's
  defaults) and optional `files`. Files are written like `start.files` of a level (same paths,
  modes, owners and directory notation, shared schema in `file-entries-schema.ts`), but always
  literal: worlds have no catalogs, so `{ text: <key> }` is an unknown field. `~/` in a world
  file is the player's home.
- **Checked by the schema, with file, line and column:** unique host names; per host unique user
  and group names and IDs, the user `root` with UID 0 and the group `root` with GID 0, existing
  primary groups and members, owners and groups of files that exist on the host, absolute homes
  and shells, IDs from 0 to 2^32 − 2. The checks across the fields of a host run only when its
  fields are valid.
- **Checked by `loadContent`:** world files lie in a `worlds` folder, are named after their ID
  and are given once; a level's world exists (a missing standard world is reported at the
  level's `id`); its `start.host` is a host of the world; the owners and groups of its start
  files are users and groups of the start host. A level whose world file has problems is not
  reported as well.
- **The player's account is not in the file.** The level session adds it to every host of the
  world: user and group with the player's name, UID and GID 1000 (Debian's first regular ID),
  home `/home/<name>`, shell `/bin/bash`. A world file must keep UID and GID 1000 free; the
  schema reports them. Level files cannot name the player as owner; files in `~` belong to the
  player by default.
- **What a world builds into** (owners, permissions, contents as the engine sees them) is
  checked by building it: the content tests build every level's world (ROADMAP M2.4b).

## Alternatives considered

- **Worlds as part of each level:** every level would repeat the office's hosts and accounts,
  and a change to the office would have to be made in every level.
- **The player's account in the world file with a placeholder name:** a placeholder such as
  `$player` in names and paths would need substitution rules everywhere and would let rules
  depend on it.
- **The player's account only on the start host:** simpler today, but the multi-host chapters
  (10 and later) would need a second decision; one account on every host matches a company
  with central accounts.
- **An explicit `default_host` field:** one more field to keep in line with the list; the order
  of the list already says it.

## Consequences

- Levels stay short: most of them name no world and only add their start files.
- The world's look (host names, colleagues' accounts) can change in the story workshop (M4)
  without touching levels, as long as the levels' start hosts and owners still exist.
- The content tests must build every level's world, because only the engine sees every problem
  of the built tree.
- Group membership of the player (for example a shared department group) cannot be expressed
  yet; it is added when a level needs it.
