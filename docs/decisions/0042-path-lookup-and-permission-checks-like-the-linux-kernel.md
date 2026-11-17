# 0042. Path lookup and permission checks like the Linux kernel

- Status: Accepted; partly superseded by [0046](0046-shell-word-expansion.md) (the tilde expansion
  function)
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M1.2 adds the read side of the virtual file system on top of the immutable world model
(ADR 0041): resolving paths, reporting lookup errors and checking permissions. Every command,
the shell's redirections and the rule engine will use it, and chapter 6 teaches permissions,
so the behaviour has to match Debian 13 (ADR 0004) closely. Open questions were: how errors are
returned, whether `.` and `..` are resolved on the string or on the tree, where `~` belongs,
how root is treated, and what a session does when its home directory cannot be entered.

## Decision

- **Path walk like the kernel.** `lookup(root, credentials, cwd, path)` resolves a path one
  component at a time on the tree. Absolute paths start at the root, relative ones at the
  working directory. Before each component the current node must be a directory (else
  `ENOTDIR`) that the credentials may search, i.e. execute permission (else `EACCES`). `.`
  stays, `..` goes to the parent (the root is its own parent), any other name must exist (else
  `ENOENT`). The first failing component decides the error. A trailing slash requires a
  directory but no search permission. The empty path is `ENOENT`. Because `..` is resolved on
  the tree, `file/..` gives `ENOTDIR` and `missing/..` gives `ENOENT`, as in Linux; a purely
  textual normalisation would hide both. Without symbolic links, the logical and the physical
  view of `..` are the same.
- **Errors as values.** `lookup` returns `{ ok: true, node, path }` with the canonical absolute
  path, or `{ ok: false, error }` with `ENOENT`, `ENOTDIR` or `EACCES`. Exceptions remain for
  programming errors only (for example a relative working directory). Commands map the codes to
  the coreutils messages.
- **The working directory is not checked again.** The walk to the working directory checks only
  that it still leads to a directory, not the permissions on the way, because a Linux process
  keeps its working directory when a parent loses its execute bit later. If the working
  directory no longer exists, every relative path gives `ENOENT`.
- **Permission classes.** `hasPermission(node, credentials, access)` follows the kernel's
  `generic_permission`: exactly one class applies, the owner class for the owning UID, else the
  group class if the node's group is the primary or a supplementary group of the credentials,
  else the other class. A class that denies is final, even if a later class would allow.
  Setuid, setgid and sticky bits grant nothing.
- **Root.** UID 0 may read and write every node and search every directory, but may execute a
  file only if at least one execute bit is set. Capabilities other than this are not modelled.
- **Tilde belongs to the shell.** The file system treats `~` as an ordinary name.
  `expandTilde(word, host, home)` expands `~`, `~/…`, `~name` and `~name/…` like bash and keeps
  unknown user names unchanged. The interpreter (ROADMAP M1.6) calls it for unquoted words only
  and adds `~+` and `~-`, which need shell variables.
- **Session start.** `createSession` starts in the canonical home directory if the user can
  change into it, and in `/` otherwise (home missing, not a directory, or not searchable), like
  `login`. The credentials type moves to its own module, because sessions, lookup and
  permission checks all use it.

## Alternatives considered

- **Normalise the path string first, then descend:** simpler, but it gives wrong answers for
  `file/..` and `missing/..` and cannot check search permission for `.` and `..`.
- **Throw exceptions for lookup errors:** shorter call sites, but nothing forces a command to
  handle the error, and errors are an expected, frequent outcome for the player.
- **Check the whole path to the working directory on every lookup:** simpler, but different
  from Linux after a `chmod` on a parent directory, which a chapter 6 ticket may show.
- **Expand `~` inside `lookup`:** convenient, but a quoted `'~'` names a real file called `~`,
  and `cd '~'` must fail like in bash.

## Consequences

- Commands of M1.8 to M1.10 get lookup and permission checks from one place and only have to
  check the permission of the target itself (read for `cat`, write on the parent for `touch`).
- Writing to the tree (creating, changing and removing nodes) is not part of this decision; it
  follows with the first commands that need it (ROADMAP M1.9).
- Real `login` prints "No directory, logging in with HOME=/" when it falls back to `/`. The
  message and the value of `HOME` follow with the shell variables and the terminal flow.
- Symbolic links need a new decision; they change `..` handling and add `ELOOP`.
- The test for a home directory of `/` (`~/x` becomes `//x`) is marked `@differential` for the
  comparison with Debian 13 in M6.
