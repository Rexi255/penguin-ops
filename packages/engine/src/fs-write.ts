// Writing files (ADR 0048), modelled on what bash does for `>` and `>>`: the Linux kernel's
// open(2) with O_WRONLY | O_CREAT and O_TRUNC or O_APPEND, one write(2) of the whole text, then
// close(2). The tree is immutable (ADR 0041): a write creates new directories along the path to
// the changed file and shares every other node with the old tree.

import type { Clock } from "./clock";
import type { Credentials } from "./credentials";
import type { DirectoryNode, FileNode, FsNode } from "./fs-node";
import { lookup, type LookupError, nodeAtCanonicalPath } from "./lookup";
import { joinAbsolute, splitPath } from "./path";
import { hasPermission } from "./permissions";
import type { Session } from "./session";
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
  const host = findHost(world, session.host);
  if (host === undefined) {
    throw new Error(`the session's host "${session.host}" is not part of the world`);
  }
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
 * Resolves the directory that holds the last component of `path`, in the order of the kernel's
 * path walk: first the directories on the way, then the search permission on the last
 * directory, then the trailing slash.
 */
function resolveTarget(root: DirectoryNode, session: Session, path: string): Target {
  if (path === "") {
    return { ok: false, error: "ENOENT" };
  }
  const parts = splitPath(path);
  const name = parts.components.at(-1);
  if (name === undefined || name === "." || name === "..") {
    // "/" and paths that end in "." or ".." name a directory whenever they resolve at all.
    const result = lookup(root, session.credentials, session.cwd, path);
    return { ok: false, error: result.ok ? "EISDIR" : result.error };
  }
  const directoryComponents = parts.components.slice(0, -1);
  const directoryPath = parts.absolute
    ? joinAbsolute(directoryComponents)
    : [".", ...directoryComponents].join("/");
  const result = lookup(root, session.credentials, session.cwd, directoryPath);
  if (!result.ok) {
    return result;
  }
  if (result.node.kind !== "directory") {
    return { ok: false, error: "ENOTDIR" };
  }
  if (!hasPermission(result.node, session.credentials, "execute")) {
    return { ok: false, error: "EACCES" };
  }
  if (parts.trailingSlash) {
    return { ok: false, error: "EISDIR" };
  }
  return { ok: true, directory: result.node, directoryPath: result.path, name };
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
