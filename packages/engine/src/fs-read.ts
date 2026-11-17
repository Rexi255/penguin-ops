// Opening files for reading (ADR 0049, ADR 0050), modelled on the Linux kernel's open(2) with
// O_RDONLY, which bash calls for `<`: the path is looked up like `lookup`, and the node needs
// read permission. A directory opens too; only reading from it fails later with EISDIR.

import { lookup, type LookupError, nodeAtCanonicalPath } from "./lookup";
import { splitPath } from "./path";
import { hasPermission } from "./permissions";
import type { Session } from "./session";
import { findHost, type World } from "./world";

/**
 * What was opened: a file with its canonical absolute path and its content at the time it was
 * opened, or a directory, whose every read fails with EISDIR ("Is a directory"). Whoever reads
 * the file later must read it again with `readOpenFile`, because it may have changed since.
 */
export type OpenedForReading =
  | { readonly kind: "file"; readonly path: string; readonly content: string }
  | { readonly kind: "directory" };

/** The result of `openForReading`: what was opened, or an error code of the lookup. */
export type ReadOpenResult =
  | { readonly ok: true; readonly opened: OpenedForReading }
  | { readonly ok: false; readonly error: LookupError };

/**
 * Opens the node at `path` on the session's host for reading, as the session's user with its
 * working directory: the path resolves like `lookup` (ENOENT, ENOTDIR, EACCES), and the file or
 * directory needs read permission (else EACCES).
 *
 * Throws an Error if the session's host is not part of `world`.
 */
export function openForReading(world: World, session: Session, path: string): ReadOpenResult {
  const host = findHost(world, session.host);
  if (host === undefined) {
    throw new Error(`the session's host "${session.host}" is not part of the world`);
  }
  const found = lookup(host.root, session.credentials, session.cwd, path);
  if (!found.ok) {
    return found;
  }
  if (!hasPermission(found.node, session.credentials, "read")) {
    return { ok: false, error: "EACCES" };
  }
  switch (found.node.kind) {
    case "file":
      return {
        ok: true,
        opened: { kind: "file", path: found.path, content: found.node.content },
      };
    case "directory":
      return { ok: true, opened: { kind: "directory" } };
  }
}

/**
 * Returns the current content of the file at the canonical absolute `path` on the host
 * `hostName`, like a read(2) from a file that `openForReading` opened before: there are no
 * permission checks, and a `>` that emptied the file since is seen. Returns the empty text if
 * no file is at `path` any more (the game has no inodes to keep a removed file readable).
 *
 * Throws an Error if `hostName` is not part of `world`.
 */
export function readOpenFile(world: World, hostName: string, path: string): string {
  const host = findHost(world, hostName);
  if (host === undefined) {
    throw new Error(`the host "${hostName}" is not part of the world`);
  }
  const node = nodeAtCanonicalPath(host.root, splitPath(path).components);
  return node?.kind === "file" ? node.content : "";
}
