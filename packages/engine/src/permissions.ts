// Permission checks of the file system (ADR 0042), following the Linux kernel's
// `generic_permission`: exactly one class of the mode bits applies (owner, group or other), and
// root (UID 0) may read and write everything but runs a file only if any execute bit is set.

import type { Credentials } from "./credentials";
import type { FsNode } from "./fs-node";

/** The kind of access to a node. For a directory, "execute" means searching it (`cd`, lookup). */
export type Access = "read" | "write" | "execute";

const ACCESS_BITS: Readonly<Record<Access, number>> = { read: 0o4, write: 0o2, execute: 0o1 };

/** The execute bits of all three classes (`--x--x--x`). */
const ANY_EXECUTE = 0o111;

/** Returns whether `credentials` grant `access` to `node`. */
export function hasPermission(node: FsNode, credentials: Credentials, access: Access): boolean {
  if (credentials.uid === 0) {
    return access !== "execute" || node.kind === "directory" || (node.mode & ANY_EXECUTE) !== 0;
  }
  return (permissionClass(node, credentials) & ACCESS_BITS[access]) !== 0;
}

/**
 * Returns the three rwx bits of the class that applies to `credentials`. Only one class counts:
 * an owner whose owner bits deny an access is denied even if the group or other bits allow it.
 */
function permissionClass(node: FsNode, credentials: Credentials): number {
  if (credentials.uid === node.owner) {
    return (node.mode >> 6) & 0o7;
  }
  if (credentials.gid === node.group || credentials.groups.includes(node.group)) {
    return (node.mode >> 3) & 0o7;
  }
  return node.mode & 0o7;
}
