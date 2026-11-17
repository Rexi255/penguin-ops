// Nodes of a host's file system (ADR 0041). The file system is an immutable tree: a directory
// maps entry names to nodes, and a change creates new nodes along the changed path instead of
// modifying the old ones. As in Linux, a node does not know its own name; the name belongs to
// the directory entry that points to the node.

import type { Gid, Uid } from "./ids";

/** Attributes that every kind of node has, like the inode fields shown by `ls -l`. */
export interface NodeAttributes {
  /** The owning user. The ID may belong to no user, for example after the user was deleted. */
  readonly owner: Uid;
  /** The owning group. The ID may belong to no group. */
  readonly group: Gid;
  /** Permission bits from 0 to 0o7777 (setuid, setgid, sticky, rwx for user, group, other). */
  readonly mode: number;
  /** Time of the last content change, in whole milliseconds since 1970-01-01T00:00:00Z. */
  readonly mtime: number;
}

/** A regular file with text content. */
export interface FileNode extends NodeAttributes {
  readonly kind: "file";
  readonly content: string;
}

/** A directory. Its entries map names to nodes; "." and ".." are implicit and never stored. */
export interface DirectoryNode extends NodeAttributes {
  readonly kind: "directory";
  readonly entries: ReadonlyMap<string, FsNode>;
}

/** Any node of the file system. More kinds (for example symbolic links) can be added later. */
export type FsNode = FileNode | DirectoryNode;

/** The largest valid mode: all permission bits plus setuid, setgid and sticky. */
export const MAX_MODE = 0o7777;

/**
 * Returns whether `name` can be stored as a directory entry. Like Linux, it must not be empty,
 * "." or "..", and must not contain "/" or the NUL character.
 */
export function isValidEntryName(name: string): boolean {
  return name !== "" && name !== "." && name !== ".." && !/[/\0]/u.test(name);
}

/** Returns whether `mode` is an integer from 0 to MAX_MODE. */
export function isValidMode(mode: number): boolean {
  return Number.isInteger(mode) && mode >= 0 && mode <= MAX_MODE;
}
