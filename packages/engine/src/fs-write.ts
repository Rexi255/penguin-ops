// Writing files (ADR 0048), modelled on what bash does for `>` and `>>`: the Linux kernel's
// open(2) with O_WRONLY | O_CREAT and O_TRUNC or O_APPEND, one write(2) of the whole text, then
// close(2). mkdir(2) and utimensat(2) follow the same kernel rules (ADR 0060). The tree is
// immutable (ADR 0041): a write creates new directories along the path to the changed file and
// shares every other node with the old tree.

import type { Clock } from "./clock";
import type { Credentials } from "./credentials";
import type { DirectoryNode, FileNode, FsNode } from "./fs-node";
import { lookup, type LookupError, nodeAtCanonicalPath } from "./lookup";
import { joinAbsolute, splitPath } from "./path";
import { hasPermission } from "./permissions";
import type { Session } from "./session";
import { findHost, type Host, replaceHostRoot, type World } from "./world";

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
      const file = createFile(directory, session.credentials, session.umask, write.text, now);
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
 * Creates a directory at `path` on the session's host like mkdir(2) with the mode 0777, as the
 * session's user with its working directory and umask:
 *
 * - The path up to the last component is resolved like `lookup` (ENOENT, ENOTDIR, EACCES); the
 *   directory that holds the last component must allow searching (else EACCES). A trailing
 *   slash is allowed.
 * - `/` and paths that end in `.` or `..` give EEXIST if they resolve, as does an existing
 *   entry of any kind.
 * - The directory that holds it needs write permission (else EACCES).
 * - The new directory is empty and gets the session's user as owner, the session's primary
 *   group (or the parent's group and its setgid bit if the parent has the setgid bit), the mode
 *   `0o777 & ~umask` and the clock's time as mtime; the parent's mtime becomes the clock's time.
 *
 * Throws an Error if the session's host is not part of `world`.
 */
export function makeDirectory(
  world: World,
  session: Session,
  path: string,
  clock: Clock,
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
    mode: (NEW_DIRECTORY_MODE & ~session.umask) | inherited,
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

/** The host of `session` in `world`; throws an Error if there is none. */
function hostOf(world: World, session: Session): Host {
  const host = findHost(world, session.host);
  if (host === undefined) {
    throw new Error(`the session's host "${session.host}" is not part of the world`);
  }
  return host;
}

/** The directory that holds the last component of a path, as the kernel's path walk finds it. */
type Parent =
  | {
      readonly kind: "entry";
      readonly directory: DirectoryNode;
      /** The canonical absolute path of `directory`. */
      readonly directoryPath: string;
      readonly name: string;
      readonly trailingSlash: boolean;
    }
  /** `/` and paths that end in `.` or `..`, which name an existing directory itself. */
  | { readonly kind: "directory-itself" }
  | { readonly kind: "error"; readonly error: LookupError };

/**
 * Resolves the directory that holds the last component of `path`, in the order of the kernel's
 * path walk: first the directories on the way, then the search permission on the last
 * directory. The empty path gives ENOENT.
 */
function resolveParent(root: DirectoryNode, session: Session, path: string): Parent {
  if (path === "") {
    return { kind: "error", error: "ENOENT" };
  }
  const parts = splitPath(path);
  const name = parts.components.at(-1);
  if (name === undefined || name === "." || name === "..") {
    // "/" and paths that end in "." or ".." name a directory whenever they resolve at all.
    const result = lookup(root, session.credentials, session.cwd, path);
    return result.ok ? { kind: "directory-itself" } : { kind: "error", error: result.error };
  }
  const directoryComponents = parts.components.slice(0, -1);
  const directoryPath = parts.absolute
    ? joinAbsolute(directoryComponents)
    : [".", ...directoryComponents].join("/");
  const result = lookup(root, session.credentials, session.cwd, directoryPath);
  if (!result.ok) {
    return { kind: "error", error: result.error };
  }
  if (result.node.kind !== "directory") {
    return { kind: "error", error: "ENOTDIR" };
  }
  if (!hasPermission(result.node, session.credentials, "execute")) {
    return { kind: "error", error: "EACCES" };
  }
  return {
    kind: "entry",
    directory: result.node,
    directoryPath: result.path,
    name,
    trailingSlash: parts.trailingSlash,
  };
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
  umask: number,
  text: string,
  now: number,
): FileNode {
  return {
    kind: "file",
    owner: credentials.uid,
    group: (directory.mode & SETGID) !== 0 ? directory.group : credentials.gid,
    mode: NEW_FILE_MODE & ~umask,
    mtime: now,
    content: text,
  };
}

/** Returns a copy of `directory` with the entry `name` set to `node` and the given mtime. */
function withEntry(
  directory: DirectoryNode,
  name: string,
  node: FsNode,
  mtime: number,
): DirectoryNode {
  const entries = new Map(directory.entries);
  entries.set(name, node);
  return { ...directory, mtime, entries };
}

/**
 * Returns a copy of `directory` in which the directory at the canonical `components` below it is
 * `replacement`. The directories on the way keep their mtimes, because their entries still point
 * to the same names.
 */
function replaceDirectory(
  directory: DirectoryNode,
  components: readonly string[],
  replacement: DirectoryNode,
): DirectoryNode {
  const [first, ...rest] = components;
  if (first === undefined) {
    return replacement;
  }
  const child = directory.entries.get(first);
  if (child?.kind !== "directory") {
    throw new Error(`the canonical path component "${first}" is not a directory`);
  }
  return withEntry(directory, first, replaceDirectory(child, rest, replacement), directory.mtime);
}

/**
 * Returns a copy of `root` in which the node at the canonical `components` is `node`. The root
 * itself can only be replaced by a directory. The directories on the way keep their mtimes.
 */
function replaceNode(
  root: DirectoryNode,
  components: readonly string[],
  node: FsNode,
): DirectoryNode {
  const name = components.at(-1);
  if (name === undefined) {
    if (node.kind !== "directory") {
      throw new Error("the root of a file system must be a directory");
    }
    return node;
  }
  const parentComponents = components.slice(0, -1);
  const parent = nodeAtCanonicalPath(root, parentComponents);
  if (parent?.kind !== "directory") {
    throw new Error(`the canonical path component "${name}" has no directory above it`);
  }
  return replaceDirectory(root, parentComponents, withEntry(parent, name, node, parent.mtime));
}
