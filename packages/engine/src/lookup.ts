// Path lookup in a host's file system (ADR 0042), modelled on the Linux kernel's path walk:
// the path is resolved one component at a time, every directory on the way must allow searching
// (execute permission), and the first component that fails decides the error.

import type { Credentials } from "./credentials";
import type { DirectoryNode, FsNode } from "./fs-node";
import { joinAbsolute, splitPath } from "./path";
import { hasPermission } from "./permissions";

/**
 * Errors of a lookup, named like the Linux error codes. Commands turn them into the coreutils
 * messages "No such file or directory", "Not a directory" and "Permission denied".
 */
export type LookupError = "ENOENT" | "ENOTDIR" | "EACCES";

/** The result of `lookup`: the node and its canonical absolute path, or an error code. */
export type LookupResult =
  | { readonly ok: true; readonly node: FsNode; readonly path: string }
  | { readonly ok: false; readonly error: LookupError };

/** One step of the walk: the name of the entry and the node it points to ("" for the root). */
interface Step {
  readonly name: string;
  readonly node: FsNode;
}

/** The state of a walk: the current step and the steps above it, starting with the root. */
interface Walk {
  readonly ancestors: readonly Step[];
  readonly current: Step;
}

/**
 * Resolves `path` in the file system below `root`, as the user with `credentials` whose working
 * directory is the absolute path `cwd`:
 *
 * - an absolute path starts at `root`, a relative one at `cwd`;
 * - before each component, the current node must be a directory (else ENOTDIR) that
 *   `credentials` may search (else EACCES); `.` stays, `..` goes to the parent (the root is its
 *   own parent), any other name must be an entry (else ENOENT);
 * - a trailing slash requires the result to be a directory (else ENOTDIR);
 * - the empty path fails with ENOENT.
 *
 * Like the kernel, the walk to `cwd` itself is not checked again: a process keeps its working
 * directory when a parent directory loses its execute permission later. A `cwd` that no longer
 * leads to a directory gives ENOENT for every relative path.
 *
 * `~` is an ordinary name here; the shell expands it before (see `expandTilde`). Throws an Error
 * if `cwd` is not an absolute path.
 */
export function lookup(
  root: DirectoryNode,
  credentials: Credentials,
  cwd: string,
  path: string,
): LookupResult {
  if (!cwd.startsWith("/")) {
    throw new Error(`the working directory must be an absolute path, got "${cwd}"`);
  }
  if (path === "") {
    return { ok: false, error: "ENOENT" };
  }
  const atRoot: Walk = { ancestors: [], current: { name: "", node: root } };
  let start = atRoot;
  if (!path.startsWith("/")) {
    const toCwd = walk(atRoot, splitPath(cwd).components, undefined);
    if (!("ancestors" in toCwd) || toCwd.current.node.kind !== "directory") {
      return { ok: false, error: "ENOENT" };
    }
    start = toCwd;
  }
  const parts = splitPath(path);
  const result = walk(start, parts.components, credentials);
  if (!("ancestors" in result)) {
    return { ok: false, error: result.error };
  }
  const node = result.current.node;
  if (parts.trailingSlash && node.kind !== "directory") {
    return { ok: false, error: "ENOTDIR" };
  }
  const names = [...result.ancestors, result.current].slice(1).map((step) => step.name);
  return { ok: true, node, path: joinAbsolute(names) };
}

/**
 * Walks `components` from `from`. With `credentials`, every directory must allow searching;
 * without them (for the walk to the working directory) nothing is checked.
 */
function walk(
  from: Walk,
  components: readonly string[],
  credentials: Credentials | undefined,
): Walk | { readonly error: LookupError } {
  const ancestors = [...from.ancestors];
  let current = from.current;
  for (const component of components) {
    const directory = current.node;
    if (directory.kind !== "directory") {
      return { error: "ENOTDIR" };
    }
    if (credentials !== undefined && !hasPermission(directory, credentials, "execute")) {
      return { error: "EACCES" };
    }
    if (component === "..") {
      current = ancestors.pop() ?? current;
    } else if (component !== ".") {
      const child = directory.entries.get(component);
      if (child === undefined) {
        return { error: "ENOENT" };
      }
      ancestors.push(current);
      current = { name: component, node: child };
    }
  }
  return { ancestors, current };
}
