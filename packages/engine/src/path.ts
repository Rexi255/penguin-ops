// Path strings (ADR 0042). A path is only split into its components here; resolving them
// against the file system tree happens in `lookup.ts`, because `.`, `..` and the lookup errors
// depend on the nodes along the way. Tilde expansion is a feature of the shell, not of the file
// system: the kernel sees `~` as an ordinary name.

import { findUser, type Host } from "./world";

/** A path string split into its parts. */
export interface PathParts {
  /** Whether the path starts with "/". */
  readonly absolute: boolean;
  /** The names between the slashes, without empty names from repeated slashes. */
  readonly components: readonly string[];
  /** Whether the path ends with "/". Such a path must name a directory. */
  readonly trailingSlash: boolean;
}

/** Splits `path` at every "/". "." and ".." stay components; `lookup` resolves them. */
export function splitPath(path: string): PathParts {
  return {
    absolute: path.startsWith("/"),
    components: path.split("/").filter((component) => component !== ""),
    trailingSlash: path.endsWith("/"),
  };
}

/** Joins absolute path components to an absolute path; no components give "/". */
export function joinAbsolute(components: readonly string[]): string {
  return `/${components.join("/")}`;
}

/**
 * Expands a leading tilde in an unquoted word like bash: `~` and `~/…` start with `home` (the
 * value of `HOME`), `~name` and `~name/…` with the home directory of the user `name` on `host`.
 * A word with an unknown user name, or without a leading tilde, stays unchanged. The interpreter
 * (ROADMAP M1.6) calls this only for unquoted words and adds `~+` and `~-`, which need the shell
 * variables `PWD` and `OLDPWD`.
 */
export function expandTilde(word: string, host: Host, home: string): string {
  if (!word.startsWith("~")) {
    return word;
  }
  const slash = word.indexOf("/");
  const prefixEnd = slash === -1 ? word.length : slash;
  const name = word.slice(1, prefixEnd);
  const rest = word.slice(prefixEnd);
  if (name === "") {
    return home + rest;
  }
  const user = findUser(host, name);
  return user === undefined ? word : user.home + rest;
}
