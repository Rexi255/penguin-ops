// Reads the installed third-party packages from `package-lock.json` (lockfile version 2 or 3).
// The lockfile lists every package for every platform, including optional platform binaries
// that are not installed on the current machine, so the check gives the same result on Windows
// and Linux.
import type { Scope } from "./policy.ts";

export interface LockedPackage {
  readonly name: string;
  readonly version: string;
  /** The declared license, or `undefined` when the package declares none. */
  readonly license: string | undefined;
  readonly scope: Scope;
  /** The key in the lockfile, for example "node_modules/a/node_modules/b". */
  readonly path: string;
}

/** Thrown when `package-lock.json` cannot be read as expected. */
export class LockfileError extends Error {
  override name = "LockfileError";
}

const NODE_MODULES = "node_modules/";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns the third-party packages of the lockfile. Workspaces, the root package and links to
 * workspaces are skipped: they are part of this repository and MIT licensed.
 *
 * A package counts as "development" only if npm marks it `dev`, which means no runtime
 * dependency reaches it. Everything else, including `devOptional`, counts as "runtime".
 */
export function readLockedPackages(text: string): LockedPackage[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new LockfileError(`not valid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(data)) {
    throw new LockfileError("the lockfile must be a JSON object");
  }
  const version = data["lockfileVersion"];
  if (version !== 2 && version !== 3) {
    throw new LockfileError(
      `unsupported lockfileVersion ${JSON.stringify(version)}; expected 2 or 3 (npm 7 or newer)`,
    );
  }
  const packages = data["packages"];
  if (!isRecord(packages)) {
    throw new LockfileError('the lockfile has no "packages" object');
  }

  const result: LockedPackage[] = [];
  for (const [path, entry] of Object.entries(packages)) {
    if (!path.startsWith(NODE_MODULES) && !path.includes(`/${NODE_MODULES}`)) {
      continue; // The root package or a workspace folder.
    }
    if (!isRecord(entry)) {
      throw new LockfileError(`entry "${path}" must be an object`);
    }
    if (entry["link"] === true) {
      continue; // A symlink to a workspace.
    }
    const name =
      typeof entry["name"] === "string"
        ? entry["name"]
        : path.slice(path.lastIndexOf(NODE_MODULES) + NODE_MODULES.length);
    const license = entry["license"];
    if (license !== undefined && typeof license !== "string") {
      throw new LockfileError(`entry "${path}" has a license that is not a string`);
    }
    result.push({
      name,
      version: typeof entry["version"] === "string" ? entry["version"] : "unknown",
      license,
      scope: entry["dev"] === true ? "development" : "runtime",
      path,
    });
  }
  return result;
}
