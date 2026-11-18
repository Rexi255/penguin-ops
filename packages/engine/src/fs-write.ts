// Writing files (ADR 0048), modelled on what bash does for `>` and `>>`: the Linux kernel's
// open(2) with O_WRONLY | O_CREAT and O_TRUNC or O_APPEND, one write(2) of the whole text, then
// close(2). mkdir(2) and utimensat(2) follow the same kernel rules (ADR 0060). The tree is
// immutable (ADR 0041): a write creates new directories along the path to the changed file and
// shares every other node with the old tree.

import type { Clock } from "./clock";
import type { Credentials } from "./credentials";
import { type DirectoryNode, type FileNode, type FsNode, isValidMode } from "./fs-node";
import { lookup, type LookupError, nodeAtCanonicalPath } from "./lookup";
import { joinAbsolute, splitPath } from "./path";
import { hasPermission } from "./permissions";
import type { Session } from "./session";
import { hostOf, replaceDirectory, replaceNode, resolveParent, withEntry } from "./fs-tree";
import { findHost, replaceHostRoot, type World } from "./world";

/** How a write treats an existing file: replace its content (`>`) or add to its end (`>>`). */
export type WriteMode = "truncate" | "append";

/**
 * Errors of a write, named like the Linux error codes. Commands turn them into the messages
 * "No such file or directory", "Not a directory", "Permission denied" and "Is a directory".
 */
export type WriteError = LookupError | "EISDIR";

/** What to write: the path of the file, the text, and how to treat an existing file. */
export interface FileWrite {
  readonly path: string;
  readonly text: string;
  readonly mode: WriteMode;
  /**
   * The permission bits that open(2) asks for when it creates the file, before the umask:
   * 0o666 by default, as bash asks for; `cp` asks for the source's bits (ADR 0062).
   */
  readonly createMode?: number;
}

/**
 * The result of `writeFile`: the changed world and the canonical absolute path of the file, or an
 * error code.
 */
export type WriteResult =
  | { readonly ok: true; readonly world: World; readonly path: string }
  | { readonly ok: false; readonly error: WriteError };

/** The mode that `open(2)` asks for when bash creates a file; the umask removes bits from it. */
const NEW_FILE_MODE = 0o666;

/** The setgid bit. On a directory, new entries get the directory's group instead of the creator's. */
const SETGID = 0o2000;

/** The sticky bit, which mkdir(2) keeps from the mode it is given. */
const STICKY = 0o1000;

/** The read, write and execute bits of owner, group and others. */
const PERMISSION_BITS = 0o777;

/**
 * Writes `write.text` to the file at `write.path` on the session's host, as the session's user
 * with its working directory and umask:
 *
 * - The path up to the last component is resolved like `lookup` (ENOENT, ENOTDIR, EACCES); the
 *   directory that holds the last component must allow searching (else EACCES).
 * - A path that names a directory gives EISDIR: `/`, a path ending in `.` or `..`, an existing
 *   directory, and every path with a trailing slash.
 * - An existing file needs write permission (else EACCES). "truncate" replaces its content,
 *   "append" adds the text to its end. Owner, group and mode stay. The mtime becomes the
 *   clock's time, except for an append of the empty text, which changes nothing.
 * - A missing file needs write permission on its directory (else EACCES). It gets the session's
 *   user as owner, the session's primary group (or the directory's group if the directory has
 *   the setgid bit) as group, the mode `0o666 & ~umask` and the clock's time as mtime; the
 *   directory's mtime becomes the clock's time too.
 *
 * Throws an Error if the session's host is not part of `world`.
 */
export function writeFile(
  world: World,
  session: Session,
  write: FileWrite,
  clock: Clock,
): WriteResult {
  const host = hostOf(world, session);
  const target = resolveTarget(host.root, session, write.path);
  if (!target.ok) {
    return target;
  }
  const { directory, name } = target;
  const directoryComponents = splitPath(target.directoryPath).components;
  const path = joinAbsolute([...directoryComponents, name]);
  const existing = directory.entries.get(name);
  const now = clock.now();
  let changed: DirectoryNode;
  switch (existing?.kind) {
    case "directory":
      return { ok: false, error: "EISDIR" };
    case "file": {
      if (!hasPermission(existing, session.credentials, "write")) {
        return { ok: false, error: "EACCES" };
      }
      const file = writeToFile(existing, write, now);
      if (file === existing) {
        return { ok: true, world, path };
      }
      changed = withEntry(directory, name, file, directory.mtime);
      break;
    }
    case undefined: {
      if (!hasPermission(directory, session.credentials, "write")) {
        return { ok: false, error: "EACCES" };
      }
      const createMode = write.createMode ?? NEW_FILE_MODE;
      const file = createFile(
        directory,
        session.credentials,
        createMode & ~session.umask,
        write.text,
        now,
      );
      changed = withEntry(directory, name, file, now);
      break;
    }
  }
  const root = replaceDirectory(host.root, directoryComponents, changed);
  return { ok: true, world: replaceHostRoot(world, host.name, root), path };
}

/**
 * Adds `text` to the end of the file at the canonical absolute `path` on the host `hostName`,
 * like a write(2) to a file that `writeFile` opened before (a redirection of bash):
 *
 * - There are no permission checks; open(2) checked them, and an open file stays writable when
 *   its mode changes later.
 * - If `path` no longer leads to a file (a command removed it or replaced it with a directory),
 *   the text is lost like a write to a deleted file, and `world` is returned unchanged.
 * - The mtime becomes the clock's time, except for the empty text, which changes nothing.
 *
 * The game has no inodes, so a file that a command renamed is not followed; a new file at `path`
 * gets the text instead. Throws an Error if `hostName` is not part of `world`.
 */
export function writeToOpenFile(
  world: World,
  hostName: string,
  path: string,
  text: string,
  clock: Clock,
): World {
  const host = findHost(world, hostName);
  if (host === undefined) {
    throw new Error(`the host "${hostName}" is not part of the world`);
  }
  const components = splitPath(path).components;
  const name = components.at(-1);
  const directoryComponents = components.slice(0, -1);
  const directory = nodeAtCanonicalPath(host.root, directoryComponents);
  if (name === undefined || directory?.kind !== "directory") {
    return world;
  }
  const file = directory.entries.get(name);
  if (file?.kind !== "file") {
    return world;
  }
  const written = writeToFile(file, { path, text, mode: "append" }, clock.now());
  if (written === file) {
    return world;
  }
  const changed = withEntry(directory, name, written, directory.mtime);
  const root = replaceDirectory(host.root, directoryComponents, changed);
  return replaceHostRoot(world, host.name, root);
}

/** Errors of mkdir(2): a lookup error, or EEXIST for a name that already exists. */
export type MakeDirectoryError = LookupError | "EEXIST";

/**
 * The result of `makeDirectory`: the changed world and the canonical absolute path of the new
 * directory, or an error code.
 */
export type MakeDirectoryResult =
  | { readonly ok: true; readonly world: World; readonly path: string }
  | { readonly ok: false; readonly error: MakeDirectoryError };

/** The mode that mkdir(1) asks for when it creates a directory; the umask removes bits from it. */
const NEW_DIRECTORY_MODE = 0o777;

/**
 * Creates a directory at `path` on the session's host like mkdir(2) with `mode` (0777 by default,
 * as mkdir(1) asks for), as the session's user with its working directory and umask:
 *
 * - The path up to the last component is resolved like `lookup` (ENOENT, ENOTDIR, EACCES); the
 *   directory that holds the last component must allow searching (else EACCES). A trailing
 *   slash is allowed.
 * - `/` and paths that end in `.` or `..` give EEXIST if they resolve, as does an existing
 *   entry of any kind.
 * - The directory that holds it needs write permission (else EACCES).
 * - The new directory is empty and gets the session's user as owner, the session's primary
 *   group (or the parent's group and its setgid bit if the parent has the setgid bit), the
 *   permission and sticky bits of `mode & ~umask` and the clock's time as mtime; the parent's
 *   mtime becomes the clock's time.
 *
 * Throws an Error if the session's host is not part of `world`.
 */
export function makeDirectory(
  world: World,
  session: Session,
  path: string,
  clock: Clock,
  mode = NEW_DIRECTORY_MODE,
): MakeDirectoryResult {
  const host = hostOf(world, session);
  const parent = resolveParent(host.root, session, path);
  switch (parent.kind) {
    case "error":
      return { ok: false, error: parent.error };
    case "directory-itself":
      return { ok: false, error: "EEXIST" };
    case "entry":
      break;
  }
  const { directory, name } = parent;
  if (directory.entries.has(name)) {
    return { ok: false, error: "EEXIST" };
  }
  if (!hasPermission(directory, session.credentials, "write")) {
    return { ok: false, error: "EACCES" };
  }
  const now = clock.now();
  const inherited = directory.mode & SETGID;
  const created: DirectoryNode = {
    kind: "directory",
    owner: session.credentials.uid,
    group: inherited !== 0 ? directory.group : session.credentials.gid,
    mode: (mode & (PERMISSION_BITS | STICKY) & ~session.umask) | inherited,
    mtime: now,
    entries: new Map(),
  };
  const directoryComponents = splitPath(parent.directoryPath).components;
  const changed = withEntry(directory, name, created, now);
  const root = replaceDirectory(host.root, directoryComponents, changed);
  return {
    ok: true,
    world: replaceHostRoot(world, host.name, root),
    path: joinAbsolute([...directoryComponents, name]),
  };
}

/** Errors of chmod(2): a lookup error, or EPERM for a user who does not own the node. */
export type ChangeModeError = LookupError | "EPERM";

/** The result of `changeMode`: the changed world, or an error code. */
export type ChangeModeResult =
  | { readonly ok: true; readonly world: World }
  | { readonly ok: false; readonly error: ChangeModeError };

/**
 * Sets the mode of the node at `path` on the session's host to `mode` (0 to 0o7777) like
 * chmod(2), as the session's user with its working directory: the path resolves like `lookup`,
 * and only root and the owner may change the mode (else EPERM). The mtime stays. The kernel's
 * clearing of the setgid bit for files of a group the user is not in is not simulated yet.
 *
 * Throws a RangeError for an invalid mode and an Error if the session's host is not part of
 * `world`.
 */
export function changeMode(
  world: World,
  session: Session,
  path: string,
  mode: number,
): ChangeModeResult {
  if (!isValidMode(mode)) {
    throw new RangeError(`${String(mode)} is not a valid mode`);
  }
  const host = hostOf(world, session);
  const found = lookup(host.root, session.credentials, session.cwd, path);
  if (!found.ok) {
    return found;
  }
  const { uid } = session.credentials;
  if (uid !== 0 && uid !== found.node.owner) {
    return { ok: false, error: "EPERM" };
  }
  const changed: FsNode = { ...found.node, mode };
  const root = replaceNode(host.root, splitPath(found.path).components, changed);
  return { ok: true, world: replaceHostRoot(world, host.name, root) };
}

/**
 * The new times of utimensat(2). The game keeps only the modification time; access times are
 * not simulated (ADR 0060), but they decide which permission the call needs.
 *
 * - `now`: `times` is NULL (or both are UTIME_NOW), so both times become the current time. The
 *   owner or a user with write permission may do that.
 * - `explicit`: other times. The mtime becomes the given time, the current time, or stays
 *   (`omit`, as when only the access time changes). Only the owner may do that.
 */
export type TimesUpdate =
  { readonly kind: "now" } | { readonly kind: "explicit"; readonly mtime: number | "now" | "omit" };

/** Errors of utimensat(2): a lookup error, EACCES, or EPERM for explicit times of a non-owner. */
export type SetTimesError = LookupError | "EPERM";

/** The result of `setTimes`: the changed world, or an error code. */
export type SetTimesResult =
  | { readonly ok: true; readonly world: World }
  | { readonly ok: false; readonly error: SetTimesError };

/**
 * Sets the times of the node at `path` on the session's host like utimensat(2) as the session's
 * user with its working directory. The path resolves like `lookup` (ENOENT, ENOTDIR, EACCES).
 * Root may always change the times. For `now` other users need to own the node or have write
 * permission (else EACCES); for `explicit` times they need to own it (else EPERM). The parent
 * directory's mtime stays.
 *
 * Throws an Error if the session's host is not part of `world`.
 */
export function setTimes(
  world: World,
  session: Session,
  path: string,
  update: TimesUpdate,
  clock: Clock,
): SetTimesResult {
  const host = hostOf(world, session);
  const found = lookup(host.root, session.credentials, session.cwd, path);
  if (!found.ok) {
    return found;
  }
  const { node } = found;
  const { credentials } = session;
  const owner = credentials.uid === 0 || credentials.uid === node.owner;
  if (update.kind === "now" && !owner && !hasPermission(node, credentials, "write")) {
    return { ok: false, error: "EACCES" };
  }
  if (update.kind === "explicit" && !owner) {
    return { ok: false, error: "EPERM" };
  }
  const mtime = update.kind === "now" ? "now" : update.mtime;
  if (mtime === "omit") {
    return { ok: true, world };
  }
  const changed: FsNode = { ...node, mtime: mtime === "now" ? clock.now() : mtime };
  const root = replaceNode(host.root, splitPath(found.path).components, changed);
  return { ok: true, world: replaceHostRoot(world, host.name, root) };
}

/** Where a write goes: the directory that holds the file, its canonical path, the file's name. */
type Target =
  | {
      readonly ok: true;
      readonly directory: DirectoryNode;
      readonly directoryPath: string;
      readonly name: string;
    }
  | { readonly ok: false; readonly error: WriteError };

/**
 * Resolves the directory that holds the last component of `path` for open(2) with O_CREAT:
 * like `resolveParent`, and a path that names a directory or has a trailing slash gives EISDIR.
 */
function resolveTarget(root: DirectoryNode, session: Session, path: string): Target {
  const parent = resolveParent(root, session, path);
  switch (parent.kind) {
    case "error":
      return { ok: false, error: parent.error };
    case "directory-itself":
      return { ok: false, error: "EISDIR" };
    case "entry":
      if (parent.trailingSlash) {
        return { ok: false, error: "EISDIR" };
      }
      return {
        ok: true,
        directory: parent.directory,
        directoryPath: parent.directoryPath,
        name: parent.name,
      };
  }
}

/** Returns `file` after the write, or `file` itself if the write changes nothing. */
function writeToFile(file: FileNode, write: FileWrite, now: number): FileNode {
  switch (write.mode) {
    case "truncate":
      return { ...file, content: write.text, mtime: now };
    case "append":
      return write.text === "" ? file : { ...file, content: file.content + write.text, mtime: now };
  }
}

function createFile(
  directory: DirectoryNode,
  credentials: Credentials,
  mode: number,
  text: string,
  now: number,
): FileNode {
  return {
    kind: "file",
    owner: credentials.uid,
    group: (directory.mode & SETGID) !== 0 ? directory.group : credentials.gid,
    mode: mode & PERMISSION_BITS,
    mtime: now,
    content: text,
  };
}
