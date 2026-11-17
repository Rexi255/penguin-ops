// Names of the working directory (ADR 0053), as bash 5.2 keeps them for `cd` and `pwd`. Bash
// remembers the working directory as a text (`the_current_working_directory`, the session's
// `cwd`) and works out new names by text: `cd docs/..` removes the last component instead of
// asking the kernel for `..`. The kernel still has the final say through chdir(2). The game has
// no symbolic links, so the logical and the physical names differ only in a leading `//`, which
// bash keeps as POSIX allows, and in directories that were removed.

import type { Credentials } from "../credentials";
import type { DirectoryNode } from "../fs-node";
import { lookup, type LookupError, nodeAtCanonicalPath } from "../lookup";
import { joinAbsolute, splitPath } from "../path";
import { hasPermission } from "../permissions";
import type { Session } from "../session";
import { findHost, type World } from "../world";

/** A file system and a user that names of directories are checked against. */
export interface DirectoryView {
  readonly root: DirectoryNode;
  readonly credentials: Credentials;
  /** The working directory, from which relative paths start. */
  readonly cwd: string;
}

/**
 * The view of `session` on the file system of its host. Throws an Error if the session's host
 * is not part of `world`.
 */
export function directoryView(world: World, session: Session): DirectoryView {
  const host = findHost(world, session.host);
  if (host === undefined) {
    throw new Error(`the session's host "${session.host}" is not part of the world`);
  }
  return { root: host.root, credentials: session.credentials, cwd: session.cwd };
}

/**
 * Bash's `make_absolute`: `path` itself if it is absolute, else `path` after the working
 * directory `cwd` with one slash between them. `cd ""` gives `cwd` with a slash at the end.
 */
export function makeAbsolute(path: string, cwd: string): string {
  if (path.startsWith("/")) {
    return path;
  }
  return cwd.endsWith("/") ? cwd + path : `${cwd}/${path}`;
}

/**
 * Bash's `sh_canonpath` with `PATH_CHECKDOTDOT` and `PATH_CHECKEXISTS`, for the absolute
 * `path`: removes empty components, `.` and each `..` with the component before it, and returns
 * `undefined` as soon as the path so far is not a directory that `stat(2)` reaches. Exactly two
 * leading slashes stay (`//tmp`); more become one. `/..` is `/`.
 */
export function canonicalPath(view: DirectoryView, path: string): string | undefined {
  return resolveByText(path, (prefix) => {
    const found = lookup(view.root, view.credentials, "/", prefix);
    return found.ok && found.node.kind === "directory";
  });
}

/**
 * Bash's `sh_physpath` for the absolute `path` in a file system without symbolic links: like
 * `canonicalPath`, but `..` is removed without a check, and each path so far only has to exist
 * (`readlink(2)` fails only on lookup errors). Returns `undefined` if one does not.
 */
export function physicalPath(view: DirectoryView, path: string): string | undefined {
  return resolveByText(path, (prefix) => lookup(view.root, view.credentials, "/", prefix).ok);
}

/**
 * Removes empty components, `.` and `..` from the absolute `path` by text. `exists` checks the
 * path so far after each real component; the first `false` gives `undefined`.
 */
function resolveByText(path: string, exists: (prefix: string) => boolean): string | undefined {
  const start = hasDoubleSlash(path) ? "//" : "/";
  const components: string[] = [];
  for (const component of splitPath(path).components) {
    if (component === "..") {
      // The path so far was checked when its last component was added.
      components.pop();
    } else if (component !== ".") {
      components.push(component);
      if (!exists(start + components.join("/"))) {
        return undefined;
      }
    }
  }
  return start + components.join("/");
}

/** POSIX's special case: a path that starts with exactly two slashes. */
function hasDoubleSlash(path: string): boolean {
  return path.startsWith("//") && !path.startsWith("///");
}

/** The result of `changeDirectory`: the canonical path of the new working directory, or why not. */
export type ChangeDirectoryResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly error: LookupError };

/**
 * chdir(2): looks up `path` from the working directory; the result must be a directory (else
 * ENOTDIR) that the user may search (else EACCES). On success the path is what getcwd(3) would
 * return afterwards.
 */
export function changeDirectory(view: DirectoryView, path: string): ChangeDirectoryResult {
  const found = lookup(view.root, view.credentials, view.cwd, path);
  if (!found.ok) {
    return found;
  }
  if (found.node.kind !== "directory") {
    return { ok: false, error: "ENOTDIR" };
  }
  if (!hasPermission(found.node, view.credentials, "execute")) {
    return { ok: false, error: "EACCES" };
  }
  return { ok: true, path: found.path };
}

/**
 * getcwd(3): the physical name of the working directory, or `undefined` if the directory was
 * removed. Linux finds it without permission checks.
 */
export function currentDirectory(view: DirectoryView): string | undefined {
  const components = splitPath(view.cwd).components;
  const node = nodeAtCanonicalPath(view.root, components);
  return node?.kind === "directory" ? joinAbsolute(components) : undefined;
}

/** The messages of the lookup errors, as `strerror(3)` writes them. */
export const LOOKUP_ERROR_MESSAGES: Readonly<Record<LookupError, string>> = {
  ENOENT: "No such file or directory",
  ENOTDIR: "Not a directory",
  EACCES: "Permission denied",
};
