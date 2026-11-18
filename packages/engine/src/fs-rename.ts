// Renaming entries in a host's file system (ADR 0063), modelled on the Linux kernel's
// renameat2(2) with or without RENAME_NOREPLACE, which `mv` uses. The entry keeps its node (and
// so its mtime); the directories that lose and gain it get the current time. The game has one
// file system per host, so a rename never fails with EXDEV. The tree is immutable (ADR 0041).

import type { Clock } from "./clock";
import type { Credentials } from "./credentials";
import type { DirectoryNode, FsNode } from "./fs-node";
import { hostOf, type Parent, replaceDirectory, resolveParent } from "./fs-tree";
import { type LookupError, nodeAtCanonicalPath } from "./lookup";
import { joinAbsolute, splitPath } from "./path";
import { hasPermission } from "./permissions";
import type { Session } from "./session";
import { replaceHostRoot, type World } from "./world";

/**
 * Errors of rename(2), named like the Linux error codes: the lookup errors, EEXIST (an existing
 * destination with RENAME_NOREPLACE, or a directory that is not empty), EBUSY (`/`, `.` or `..`
 * as a name), EINVAL (a directory into itself), ENOTEMPTY, EISDIR, EPERM (sticky bit).
 */
export type RenameError =
  LookupError | "EEXIST" | "EBUSY" | "EINVAL" | "ENOTEMPTY" | "EISDIR" | "EPERM";

/** The result of `renameEntry`: the changed world, or an error code. */
export type RenameResult =
  | { readonly ok: true; readonly world: World }
  | { readonly ok: false; readonly error: RenameError };

/** The sticky bit: in such a directory only the owners may remove or replace an entry. */
const STICKY = 0o1000;

/** A resolved name: the directory that holds it, its canonical path and the entry's name. */
type Entry = Extract<Parent, { kind: "entry" }>;

/**
 * Renames the entry `from` to `to` on the session's host like renameat2(2), as the session's
 * user with its working directory, in the order of the kernel's checks:
 *
 * - Both directories resolve like `lookup` (ENOENT, ENOTDIR, EACCES) and must allow searching.
 * - `from` must name an entry (not `/`, `.` or `..`: EBUSY); `to` neither (EEXIST with
 *   `noReplace`, else EBUSY).
 * - `from` must exist (ENOENT); with `noReplace`, `to` must not (EEXIST).
 * - A file with a trailing slash on either name gives ENOTDIR.
 * - A directory cannot move into itself or below itself (EINVAL), and the destination cannot
 *   be a directory above the source (ENOTEMPTY).
 * - Renaming an entry to itself changes nothing.
 * - Both directories need write permission (EACCES), with the sticky bit's ownership rule for
 *   the source and an existing destination (EPERM). A directory replaces only a directory
 *   (ENOTDIR), a file only a file (EISDIR). A directory that moves to another directory needs
 *   write permission itself (EACCES), and a directory it replaces must be empty (ENOTEMPTY).
 *
 * Throws an Error if the session's host is not part of `world`.
 */
export function renameEntry(
  world: World,
  session: Session,
  from: string,
  to: string,
  noReplace: boolean,
  clock: Clock,
): RenameResult {
  const host = hostOf(world, session);
  const source = resolveParent(host.root, session, from);
  if (source.kind === "error") {
    return { ok: false, error: source.error };
  }
  const target = resolveParent(host.root, session, to);
  if (target.kind === "error") {
    return { ok: false, error: target.error };
  }
  if (source.kind === "directory-itself") {
    return { ok: false, error: "EBUSY" };
  }
  if (target.kind === "directory-itself") {
    return { ok: false, error: noReplace ? "EEXIST" : "EBUSY" };
  }
  const moved = source.directory.entries.get(source.name);
  if (moved === undefined) {
    return { ok: false, error: "ENOENT" };
  }
  const replaced = target.directory.entries.get(target.name);
  if (noReplace && replaced !== undefined) {
    return { ok: false, error: "EEXIST" };
  }
  if (moved.kind !== "directory" && (source.trailingSlash || target.trailingSlash)) {
    return { ok: false, error: "ENOTDIR" };
  }
  const sourcePath = entryPath(source);
  const targetPath = entryPath(target);
  if (source.directoryPath !== target.directoryPath) {
    if (isAtOrBelow(target.directoryPath, sourcePath)) {
      return { ok: false, error: "EINVAL" };
    }
    if (isAtOrBelow(source.directoryPath, targetPath)) {
      return { ok: false, error: "ENOTEMPTY" };
    }
  }
  if (sourcePath === targetPath) {
    return { ok: true, world };
  }
  const denied = permissionError(source, moved, target, replaced, session.credentials);
  if (denied !== undefined) {
    return { ok: false, error: denied };
  }
  if (replaced?.kind === "directory" && replaced.entries.size > 0) {
    return { ok: false, error: "ENOTEMPTY" };
  }
  return { ok: true, world: moveEntry(world, host.name, host.root, source, target, moved, clock) };
}

/** The canonical path of a resolved entry. */
function entryPath(entry: Entry): string {
  return joinAbsolute([...splitPath(entry.directoryPath).components, entry.name]);
}

/** Whether the canonical `path` is `ancestor` itself or lies below it. */
function isAtOrBelow(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(ancestor === "/" ? "/" : `${ancestor}/`);
}

/** The permission checks of `vfs_rename`: `may_delete`, `may_create` and the moved directory. */
function permissionError(
  source: Entry,
  moved: FsNode,
  target: Entry,
  replaced: FsNode | undefined,
  credentials: Credentials,
): RenameError | undefined {
  const removing = deletionError(source.directory, moved, credentials);
  if (removing !== undefined) {
    return removing;
  }
  if (replaced === undefined) {
    if (!hasPermission(target.directory, credentials, "write")) {
      return "EACCES";
    }
  } else {
    const replacing = deletionError(target.directory, replaced, credentials);
    if (replacing !== undefined) {
      return replacing;
    }
    if (moved.kind === "directory" && replaced.kind !== "directory") {
      return "ENOTDIR";
    }
    if (moved.kind !== "directory" && replaced.kind === "directory") {
      return "EISDIR";
    }
  }
  const newParent = source.directoryPath !== target.directoryPath;
  if (newParent && moved.kind === "directory" && !hasPermission(moved, credentials, "write")) {
    // The directory's ".." entry changes.
    return "EACCES";
  }
  return undefined;
}

/** The kernel's `may_delete` without the type check: write permission and the sticky bit. */
function deletionError(
  directory: DirectoryNode,
  node: FsNode,
  credentials: Credentials,
): RenameError | undefined {
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

/** Removes the source entry and sets the target entry, in one new tree. */
function moveEntry(
  world: World,
  hostName: string,
  root: DirectoryNode,
  source: Entry,
  target: Entry,
  moved: FsNode,
  clock: Clock,
): World {
  const now = clock.now();
  const sourceComponents = splitPath(source.directoryPath).components;
  const withoutSource = new Map(source.directory.entries);
  withoutSource.delete(source.name);
  let current = replaceDirectory(root, sourceComponents, {
    ...source.directory,
    mtime: now,
    entries: withoutSource,
  });
  // The target directory as it is after the source left (it may be the same directory).
  const targetComponents = splitPath(target.directoryPath).components;
  const targetDirectory = nodeAtCanonicalPath(current, targetComponents);
  if (targetDirectory?.kind !== "directory") {
    throw new Error(`the directory "${target.directoryPath}" is gone during a rename`);
  }
  const withTarget = new Map(targetDirectory.entries);
  withTarget.set(target.name, moved);
  current = replaceDirectory(current, targetComponents, {
    ...targetDirectory,
    mtime: now,
    entries: withTarget,
  });
  return replaceHostRoot(world, hostName, current);
}
