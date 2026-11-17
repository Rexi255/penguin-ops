// Opening files for reading (ADR 0049), modelled on the Linux kernel's open(2) with O_RDONLY,
// which bash calls for `<`: the path is looked up like `lookup`, and the node needs read
// permission. A directory opens too; only reading from it fails later with EISDIR.

import { lookup, type LookupError } from "./lookup";
import { hasPermission } from "./permissions";
import type { Session } from "./session";
import { findHost, type World } from "./world";

/**
 * What an opened node gives a reader: the content of a file at the time it was opened, or a
 * directory, whose every read fails with EISDIR ("Is a directory").
 */
export type OpenedForReading =
  { readonly kind: "file"; readonly content: string } | { readonly kind: "directory" };

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
      return { ok: true, opened: { kind: "file", content: found.node.content } };
    case "directory":
      return { ok: true, opened: { kind: "directory" } };
  }
}
