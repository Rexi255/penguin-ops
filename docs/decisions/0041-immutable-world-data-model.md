# 0041. Immutable world data model

- Status: Accepted
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M1.1 defines the core types of the engine: world, host, file system node, user, group
and session. Every later engine package (file system, shell, commands, rules) builds on them,
so their shape is hard to change later. ADR 0009 requires a multi-host model; ADR 0004 requires
behaviour like Debian 13; ADR 0008 requires a pure, deterministic engine. Open questions were:
whether world data is changed in place or replaced, how the file system tree is stored, how
owners and groups are referenced, and what a session remembers about its user.

## Decision

- **Immutable data.** All world types are `readonly`. A change creates a new world that shares
  the unchanged parts with the old one; nothing is modified in place. The gameplay package can
  keep the start state of a ticket next to the current state.
- **World and hosts.** A `World` holds a list of `Host`s with unique names. A host has a name, a
  root directory, users (in `/etc/passwd` order) and groups (in `/etc/group` order). Services,
  processes and network settings are added when a milestone needs them.
- **File system as a nested tree.** A `DirectoryNode` maps entry names to child nodes
  (`ReadonlyMap`). As in Linux, the name belongs to the directory entry, not to the node, so
  name and entry cannot disagree. Node kinds are a discriminated union: `file` (text content)
  and `directory`. Every node has `owner`, `group`, `mode` (permission bits 0 to 0o7777; the
  type comes from the kind) and `mtime` (whole milliseconds since the Unix epoch, UTC).
- **Numeric IDs.** Users, groups and file owners use numeric IDs like Linux. `Uid` and `Gid`
  are separate branded number types, created only through `toUid` and `toGid` (integers from 0
  to 2^32 − 2), so the compiler rejects a group ID where a user ID is expected. A file's owner
  or group may be an ID without a user or group, as after `userdel`.
- **Validation.** `createWorld` checks the structural rules and throws an `InvalidWorldError`
  naming the host and the problem: at least one host, host names are lowercase DNS labels,
  unique host names, user and group names without `:`, `/` or whitespace, unique user names,
  UIDs, group names and GIDs per host, existing primary groups, absolute home and shell paths,
  existing and unique group members, valid entry names (not empty, `.` or `..`, no `/` or NUL),
  valid modes and mtimes. Duplicate UIDs and GIDs are rejected although Linux tolerates them,
  because they make owner names in `ls -l` ambiguous.
- **Session.** A `Session` stores its host name, its credentials and its working directory.
  The credentials (UID, primary GID, all group IDs) are fixed at login, like those of a Linux
  process: a later `usermod -aG` reaches only new sessions. `createSession` starts in the
  user's home directory and throws for an unknown host or user. The prompt part `user@host`
  shows bash's `I have no name!` when the UID has no user any more.

## Alternatives considered

- **Mutable world objects:** fewer copies, but the start state of a ticket would need a deep
  copy, and a failing command could leave half-done changes. Performance is not a concern for
  the small worlds of the game.
- **Inode table (nodes in a table by inode number, directories map names to numbers):** closer
  to Linux and allows hard links, but the curriculum teaches neither hard links nor inode
  numbers; `ls -l` link counts can be computed from the tree. Moving to it later is possible
  behind the file system API of M1.2.
- **Owners and groups by name:** easier to read in tests, but `ls -l` could not show the bare
  number for a deleted user, and renaming a user would change file ownership.
- **Session looks up its groups on every check:** simpler, but hides a real-world lesson of
  chapter 6 (new group memberships need a new login).

## Consequences

- Every change to the world is a pure function that returns a new world. Updates of deep paths
  copy the directories along the path.
- Path resolution, lookup errors and permission checks (M1.2) work on this tree. If the home
  directory does not exist, the session should start in `/` like a real login; M1.2 adds this,
  because it needs path resolution.
- New node kinds (symbolic links, device files such as `/dev/null`) are added to the union
  when a chapter needs them; the exhaustive `switch` check shows every place to update.
- Files hold text only; binary content needs a new decision when a chapter needs it.
- `/etc/passwd` and `/etc/group` are not yet files of the tree. How they relate to the host's
  user and group lists is decided when chapter 6 content needs it.
