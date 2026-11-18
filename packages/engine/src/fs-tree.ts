// The immutable tree of a host's file system (ADR 0041) as the kernel calls of `fs-write.ts`
// and `fs-remove.ts` change it: finding the directory that holds the last component of a path
// like the kernel's path walk, and copying the directories on a changed path while every other
// node is shared with the old tree.

import type { DirectoryNode, FsNode } from "./fs-node";
import { lookup, type LookupError, nodeAtCanonicalPath } from "./lookup";
import { joinAbsolute, splitPath } from "./path";
import { hasPermission } from "./permissions";
import type { Session } from "./session";
import { findHost, type Host, type World } from "./world";

/** The host of `session` in `world`; throws an Error if there is none. */
export function hostOf(world: World, session: Session): Host {
  const host = findHost(world, session.host);
  if (host === undefined) {
    throw new Error(`the session's host "${session.host}" is not part of the world`);
  }
  return host;
}

/** The directory that holds the last component of a path, as the kernel's path walk finds it. */
export type Parent =
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
export function resolveParent(root: DirectoryNode, session: Session, path: string): Parent {
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

/** Returns a copy of `directory` with the entry `name` set to `node` and the given mtime. */
export function withEntry(
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
export function replaceDirectory(
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
export function replaceNode(
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
