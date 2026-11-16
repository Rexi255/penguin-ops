// Reads and validates `license-policy.json` (ADR 0005, ADR 0031) and answers which license
// terms a package may use.

/** Where a package ends up: only in development tools, or in the shipped app. */
export type Scope = "development" | "runtime";

export interface LicenseException {
  /** Package name, or a pattern where `*` matches any characters (for example "lightningcss-*"). */
  readonly package: string;
  /** The license term the exception allows for matching packages. */
  readonly license: string;
  /** "development": the exception applies only to packages that are never shipped. */
  readonly scope: "development";
  readonly reason: string;
}

export interface LicensePolicy {
  readonly allowed: readonly string[];
  readonly exceptions: readonly LicenseException[];
  /** Patterns of licenses that need the owner's approval before use. */
  readonly askFirst: readonly string[];
  /** Patterns of licenses that are never allowed. */
  readonly forbidden: readonly string[];
}

/** Thrown when `license-policy.json` does not have the expected shape. */
export class PolicyError extends Error {
  override name = "PolicyError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item !== "")) {
    throw new PolicyError(`"${field}" must be an array of non-empty strings`);
  }
  return value as string[];
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new PolicyError(`"${field}" must be a non-empty string`);
  }
  return value;
}

const KNOWN_FIELDS = new Set(["$comment", "allowed", "exceptions", "askFirst", "forbidden"]);
const KNOWN_EXCEPTION_FIELDS = new Set(["package", "license", "scope", "reason"]);

function rejectUnknownFields(value: Record<string, unknown>, known: Set<string>, where: string) {
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      throw new PolicyError(`unknown field "${key}" in ${where}`);
    }
  }
}

function parseException(value: unknown, index: number): LicenseException {
  const where = `exceptions[${String(index)}]`;
  if (!isRecord(value)) {
    throw new PolicyError(`"${where}" must be an object`);
  }
  rejectUnknownFields(value, KNOWN_EXCEPTION_FIELDS, where);
  if (value["scope"] !== "development") {
    throw new PolicyError(`"${where}.scope" must be "development"`);
  }
  return {
    package: nonEmptyString(value["package"], `${where}.package`),
    license: nonEmptyString(value["license"], `${where}.license`),
    scope: "development",
    reason: nonEmptyString(value["reason"], `${where}.reason`),
  };
}

/** Parses the text of `license-policy.json`. Throws `PolicyError` for an invalid policy. */
export function parsePolicy(text: string): LicensePolicy {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new PolicyError(`not valid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(data)) {
    throw new PolicyError("the policy must be a JSON object");
  }
  rejectUnknownFields(data, KNOWN_FIELDS, "the policy");
  const exceptions = data["exceptions"];
  if (!Array.isArray(exceptions)) {
    throw new PolicyError('"exceptions" must be an array');
  }
  const allowed = stringArray(data["allowed"], "allowed");
  const wildcard = allowed.find((license) => license.includes("*"));
  if (wildcard !== undefined) {
    throw new PolicyError(`"allowed" must list exact licenses, not the pattern "${wildcard}"`);
  }
  return {
    allowed,
    exceptions: exceptions.map(parseException),
    askFirst: stringArray(data["askFirst"], "askFirst"),
    forbidden: stringArray(data["forbidden"], "forbidden"),
  };
}

/** Matches `text` against a pattern in which `*` stands for any characters (also none). */
export function matchesPattern(pattern: string, text: string): boolean {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(text);
}

/** Returns whether a package with the given name and scope may use the license term. */
export function acceptsTerm(
  policy: LicensePolicy,
  packageName: string,
  scope: Scope,
  term: string,
): boolean {
  if (policy.allowed.includes(term)) {
    return true;
  }
  return policy.exceptions.some(
    (exception) =>
      exception.license === term &&
      scope === exception.scope &&
      matchesPattern(exception.package, packageName),
  );
}
