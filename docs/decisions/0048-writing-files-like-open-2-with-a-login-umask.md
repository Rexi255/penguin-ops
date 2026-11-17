# 0048. Writing files like open(2) with a login umask

- Status: Accepted
- Date: 2026-11-17
- Supersedes: –

## Context

Until ROADMAP M1.6c the engine could only read the file system (ADR 0042). The redirections `>`
and `>>` (M1.6c-2) and later `touch`, `mkdir`, `cp` and `mv` need a write side. The tree is
immutable (ADR 0041), so a write has to return a new world. Behaviour must match Debian 13
(ADR 0004): which error a failing write reports, which owner, group and mode a new file gets,
and which mtimes change. New files need a file mode creation mask (umask), which the session did
not have yet. ROADMAP M1.6c was split into M1.6c-1 (this record: writing files) and M1.6c-2
(redirections in the interpreter).

## Decision

- **One write function.** `writeFile(world, session, { path, text, mode }, clock)` in
  `packages/engine/src/fs-write.ts` does what bash does for a redirection: `open(2)` with
  `O_WRONLY | O_CREAT` and `O_TRUNC` (`mode: "truncate"`, for `>`) or `O_APPEND`
  (`mode: "append"`, for `>>`), one `write(2)` of the whole text, `close(2)`. It returns the new
  world or one of the error codes `ENOENT`, `ENOTDIR`, `EACCES` and `EISDIR` as a value.
- **Error order of the kernel's path walk.** First the directories on the way (as `lookup`),
  then search permission on the directory that holds the last component (`EACCES`), then the
  last component:
  - `/`, `.`, `..` and paths ending in them give `EISDIR` if they resolve, else the lookup error;
  - a trailing slash gives `EISDIR`, whether the name is missing, a file or a directory (the
    kernel rejects `O_CREAT` with a trailing slash before it looks at the name);
  - an existing directory gives `EISDIR`;
  - an existing file needs write permission on the file (`EACCES`), not on the directory;
  - a missing file needs write permission on the directory (`EACCES`).
- **Existing file.** Owner, group and mode stay. Truncate replaces the content and sets the
  mtime to the clock's time, even for the empty text (POSIX marks the file changed on
  `O_TRUNC`). Append adds the text to the end and sets the mtime; an append of the empty text
  changes nothing and returns the same world object, because bash never calls `write(2)`.
- **New file.** Owner is the session's UID, group is the session's primary GID, or the
  directory's group if the directory has the setgid bit (BSD group semantics of Linux). The mode
  is `0o666 & ~umask`, the mtime the clock's time. The directory's mtime becomes the clock's
  time too; directories further up keep theirs. The new entry is added after the existing ones.
- **Tree update.** The directories on the path to the changed directory are copied, everything
  else is shared with the old tree. `replaceHostRoot(world, hostName, root)` in `world.ts` puts
  the new root into a new world and keeps all other hosts as the same objects.
- **Session umask.** `Session` gets `umask` (0 to 0o777). `createSession` sets it like Debian
  13's `pam_umask` with the `usergroups` option on top of `UMASK 022` from `/etc/login.defs`: a
  user other than root whose primary group has the user's own name gets `002`; root and users
  with another primary group (for example `users`) get `022`. The `umask` command (later
  milestone) will change it.

## Alternatives considered

- **Separate functions for create, truncate and append:** closer to the system calls, but every
  caller would repeat the existence check and the error order. Commands such as `touch` and
  `mkdir` get their own functions later, because their rules differ.
- **Write functions on the tree only (root in, root out):** smaller, but every caller would have
  to find the host and put the root back; the world-level function keeps that in one place, and
  `lookup` stays the tree-level building block.
- **Umask 022 for everybody:** the value of Debian 12 and most tutorials, but Debian 13 enables
  user private groups out of the box, so a player on a real Debian 13 system sees `-rw-rw-r--`
  for new files. The game follows Debian 13 (ADR 0004).
- **Umask as a constant instead of a session field:** simpler now, but the `umask` command and
  levels about permissions need to change it per shell, like in Linux.

## Consequences

- M1.6c-2 can implement `>`, `>>` and `2>` on top of `writeFile` and turn its error codes into
  bash's messages, for example `bash: notes.txt: Permission denied`.
- The Debian 13 umask rule (current `pam_umask(8)`: not root and user name equals primary group
  name, no UID/GID comparison), the mtime of an empty append and `EISDIR` for a trailing slash on
  an existing file are marked `@differential` in the tests; milestone M6 checks them against a
  real Debian 13 system.
- Not simulated: `fs.protected_regular` (writes to other users' files in sticky directories such
  as `/tmp`), file size limits, and the change time (ctime), which the data model does not have.
- Every later write operation (`touch`, `mkdir`, `rm`, `cp`, `mv`) follows the same pattern:
  resolve, check in kernel order, build the changed directory, replace the path to it.
