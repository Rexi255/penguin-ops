// Path strings (ADR 0042). A path is only split into its components here; resolving them
// against the file system tree happens in `lookup.ts`, because `.`, `..` and the lookup errors
// depend on the nodes along the way. Tilde expansion is a feature of the shell, not of the file
// system: the kernel sees `~` as an ordinary name, and `expand.ts` expands it (ADR 0046).

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
