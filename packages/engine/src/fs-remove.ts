// Removing entries from a host's file system (ADR 0061), modelled on the Linux kernel's
// unlink(2) and rmdir(2) (`unlinkat` without and with AT_REMOVEDIR): the directory that holds
// the entry needs write and search permission, the sticky bit protects other users' entries,
// and a directory must be empty. The tree is immutable (ADR 0041).

import type { Clock } from "./clock";
import type { Credentials } from "./credentials";
import type { DirectoryNode, FsNode } from "./fs-node";
import { hostOf, replaceDirectory, resolveParent } from "./fs-tree";
import type { LookupError } from "./lookup";
import { splitPath } from "./path";
import { hasPermission } from "./permissions";
import type { Session } from "./session";
import { replaceHostRoot, type World } from "./world";

/** What a removal expects: a file (unlink(2)) or an empty directory (rmdir(2)). */
export type RemovedKind = FsNode["kind"];

/**
 * Errors of unlink(2) and rmdir(2), named like the Linux error codes: the lookup errors, and
 * EISDIR (unlink of a directory), ENOTEMPTY ("Directory not empty"), EPERM (sticky bit), EBUSY
 * (`/`) and EINVAL (a path ending in `.`).
 */
export type RemoveError = LookupError | "EISDIR" | "ENOTEMPTY" | "EPERM" | "EBUSY" | "EINVAL";

/** The result of `removeEntry`: the changed world, or an error code. */
export type RemoveResult =
  | { readonly ok: true; readonly world: World }
  | { readonly ok: false; readonly error: RemoveError };

/** The sticky bit: in such a directory only the owners may remove an entry. */
const STICKY = 0o1000;

/**
 * Removes the entry at `path` on the session's host, as the session's user with its working
 * directory, in the order of the kernel's checks:
 *
 * - The directory that holds the last component is resolved like `lookup` (ENOENT, ENOTDIR,
 *   EACCES) and must allow searching (EACCES).
 * - For a directory: a path ending in `.` gives EINVAL, one ending in `..` ENOTEMPTY, and `/`
 *   EBUSY. For a file, a path ending in `.`, `..` or `/` names a directory: EISDIR.
 * - A missing entry gives ENOENT. A file with a trailing slash gives ENOTDIR (EISDIR for a
 *   directory) when a file is expected.
 * - The directory needs write permission (EACCES); with the sticky bit, only root, the owner of
 *   the entry and the owner of the directory may remove it (EPERM).
 * - The entry must be of the expected kind: unlink(2) of a directory gives EISDIR, rmdir(2) of a
 *   file ENOTDIR, and a directory must be empty (ENOTEMPTY).
 *
 * The directory's mtime becomes the clock's time. Throws an Error if the session's host is not
 * part of `world`.
 */
export function removeEntry(
  world: World,
  session: Session,
  path: string,
  kind: RemovedKind,
  clock: Clock,
): RemoveResult {
  const host = hostOf(world, session);
  const parent = resolveParent(host.root, session, path);
  switch (parent.kind) {
    case "error":
      return { ok: false, error: parent.error };
    case "directory-itself":
      return { ok: false, error: kind === "file" ? "EISDIR" : selfError(path) };
    case "entry":
      break;
  }
  const { directory, name, trailingSlash } = parent;
  const node = directory.entries.get(name);
  if (node === undefined) {
    return { ok: false, error: "ENOENT" };
  }
  if (kind === "file" && trailingSlash) {
    return { ok: false, error: node.kind === "directory" ? "EISDIR" : "ENOTDIR" };
  }
  const denied = deletionDenied(directory, node, session.credentials);
  if (denied !== undefined) {
    return { ok: false, error: denied };
  }
  if (kind === "file" && node.kind === "directory") {
    return { ok: false, error: "EISDIR" };
  }
  if (kind === "directory" && node.kind === "file") {
    return { ok: false, error: "ENOTDIR" };
  }
  if (node.kind === "directory" && node.entries.size > 0) {
    return { ok: false, error: "ENOTEMPTY" };
  }
  const entries = new Map(directory.entries);
  entries.delete(name);
  const changed: DirectoryNode = { ...directory, mtime: clock.now(), entries };
  const root = replaceDirectory(host.root, splitPath(parent.directoryPath).components, changed);
  return { ok: true, world: replaceHostRoot(world, host.name, root) };
}

/** The error of rmdir(2) for a path that names a directory itself: `/`, `.` or `..` at the end. */
function selfError(path: string): RemoveError {
  const last = splitPath(path).components.at(-1);
  if (last === undefined) {
    return "EBUSY";
  }
  return last === "." ? "EINVAL" : "ENOTEMPTY";
}

/**
 * The kernel's `may_delete`: write permission on the directory (EACCES), and with the sticky
 * bit, ownership of the entry or of the directory (EPERM); root may always.
 */
function deletionDenied(
  directory: DirectoryNode,
  node: FsNode,
  credentials: Credentials,
): RemoveError | undefined {
  if (!hasPermission(directory, credentials, "write")) {
    return "EACCES";
  }
  const sticky = (directory.mode & STICKY) !== 0;
  const owner = credentials.uid === node.owner || credentials.uid === directory.owner;
  if (sticky && credentials.uid !== 0 && !owner) {
    return "EPERM";
  }
  return undefined;
}
