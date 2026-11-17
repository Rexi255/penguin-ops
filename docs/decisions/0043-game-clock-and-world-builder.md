# 0043. Game clock and world builder

- Status: Accepted; partly superseded by
  [0047](0047-shell-execution-of-lists-pipelines-and-assignments.md) (who advances the game clock)
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M1.3 completes the determinism of ADR 0008: the engine needs an injected game clock,
and tests and levels need a way to create worlds without writing nested `FileNode` and
`DirectoryNode` objects by hand. The commands of M1.8–M1.10 need many small test worlds, and
`touch`, `mkdir` and `cp` need a time for `mtime`. The level format (`docs/LEVEL-AUTHORING.md`)
already describes `start.files` as a map from paths to contents with defaults for owner and
mode; the builder should fit that format so that the content loader (M2.2) can use it. The
in-game calendar ("Week 1 · Monday", ADR 0020) is not decided yet.

## Decision

- **Game clock** (`packages/engine/src/clock.ts`). `createGameClock(start)` returns a
  `GameClock` with `now()` and `advance(milliseconds)`. The time is a safe integer in
  milliseconds since the Unix epoch, like `mtime` (ADR 0041). The clock stands still until
  `advance` is called; `advance` takes only non-negative safe integers and never leaves the safe
  integer range, so time never moves backwards. Invalid values throw a `RangeError`.
- **Read-only view.** Engine functions take a `Clock` (only `now()`); only the owner of the
  clock (the gameplay package, or a test) holds the `GameClock` and advances it. The engine
  sets no start date: the in-game calendar is decided with the game frame and chapters.
- **World builder** (`packages/engine/src/world-builder.ts`). `buildWorld(spec, clock)` takes a
  `WorldSpec` (hosts with groups, users and `files`) and returns a world checked by
  `createWorld`. Problems throw an `InvalidWorldError` that names the host.
  - Users: the primary group is given by name and defaults to the group with the user's name
    (Debian's user private groups); home defaults to `/root` for UID 0 and `/home/<name>`
    otherwise; shell defaults to `/bin/bash`. Group members default to none.
  - Files: absolute paths without `.` or `..`. A path that ends with `/` is a directory, any
    other path a file; a plain string is file content. Optional `content`, `owner` and `group`
    (by name), `mode` and `mtime`. `/` sets the attributes of the root directory. Each node is
    listed at most once, and a file cannot be the parent of another path. Missing parent
    directories are created with default attributes. Directory entries keep the order of
    `files`.
  - Defaults: mode `0644` for files and `0755` for directories (what `touch` and `mkdir`
    create with Debian's umask `022`); mtime `clock.now()`. A node inside the home directory of
    a regular user (UID 1000 or more, Debian's `UID_MIN`), or that home itself, belongs to that
    user; with nested homes the innermost wins. Every other node belongs to UID 0. The default
    group is the owner's primary group, GID 0 for root.
- **The engine spec stays technical.** Text keys of translated files (`{ text: handover }`),
  `~` in paths and symbolic modes like `rw-r-----` belong to the level format; the content
  loader (M2.2) resolves them before it calls `buildWorld`.

## Alternatives considered

- **A clock that follows the real time:** different output on every run; forbidden by ADR 0008.
- **A clock that advances by itself on every call of `now()`:** every read would change the
  world, and the result would depend on how often a command reads the time.
- **A fixed game start date in the engine:** the date is a story and UI question (calendar in
  the top bar) and not needed by the engine; tests pass their own start time.
- **Owners in the spec as numeric IDs:** closer to the data model, but levels and tests read
  better with names, and the level format already uses names. Files of deleted users (an ID
  without a user) can be added to the spec when chapter 6 needs them.
- **Home directories with mode `0700` by default:** recent Debian releases create homes with
  `0700`, but levels often need homes that colleagues can read, and a special case for homes
  surprises authors. Levels set `mode` explicitly where it matters.
- **Every node in the home of any user, including system users:** `/var/www` is the home of
  `www-data`, but on Debian its files belong to root.

## Consequences

- Tests and levels describe worlds in a few lines; the builder rejects contradictory specs
  with a message that names the host and the path.
- Without `advance`, all changes of one session get the same mtime. Who advances the clock and
  by how much (for example a few seconds per command, a new day per ticket) is decided with the
  interpreter (M1.6) or the gameplay package.
- The content loader (M2.2) maps the level format onto `WorldSpec`. Deterministic data
  generators (`{ generate: … }`) are added to the spec when a level needs them.
