// Checks the licenses of all locked npm packages against the policy (ADR 0005, ADR 0031,
// ADR 0032). Pure: the caller reads the files and prints the result.
import { readLockedPackages, type LockedPackage } from "./lockfile.ts";
import {
  acceptsTerm,
  matchesPattern,
  parsePolicy,
  type LicensePolicy,
  type Scope,
} from "./policy.ts";
import {
  isSatisfied,
  licenseTerms,
  parseSpdx,
  SpdxSyntaxError,
  type SpdxExpression,
} from "./spdx.ts";

/** Why a package failed the check. */
export type ViolationReason =
  | "missing" // no license declared
  | "invalid" // not a valid SPDX expression
  | "forbidden" // matches a forbidden pattern
  | "ask-first" // matches a pattern that needs the owner's approval
  | "development-only" // allowed only by a development exception, but used at runtime
  | "not-allowed"; // not on the allowlist

export interface Violation {
  readonly package: LockedPackage;
  readonly reason: ViolationReason;
  readonly detail: string;
}

export interface CheckResult {
  readonly checked: number;
  readonly violations: readonly Violation[];
}

/**
 * Explains why a license failed. `developmentOnly` says whether the license would pass if the
 * package were used only in development tools.
 */
function classify(
  policy: LicensePolicy,
  terms: readonly string[],
  developmentOnly: boolean,
): Exclude<ViolationReason, "missing" | "invalid"> {
  const matchesAny = (patterns: readonly string[]) =>
    terms.some((term) => patterns.some((pattern) => matchesPattern(pattern, term)));
  if (matchesAny(policy.forbidden)) {
    return "forbidden";
  }
  if (developmentOnly) {
    return "development-only";
  }
  if (matchesAny(policy.askFirst)) {
    return "ask-first";
  }
  return "not-allowed";
}

/** Checks one package and returns its violation, or `undefined` if its license is allowed. */
export function checkPackage(policy: LicensePolicy, item: LockedPackage): Violation | undefined {
  const license = item.license?.trim();
  if (license === undefined || license === "") {
    return { package: item, reason: "missing", detail: "the package declares no license" };
  }
  let expression: SpdxExpression;
  try {
    expression = parseSpdx(license);
  } catch (error) {
    if (!(error instanceof SpdxSyntaxError)) {
      throw error;
    }
    // Strings like "SEE LICENSE IN LICENSE.md" are not SPDX but may match a policy pattern.
    const reason = classify(policy, [license], false);
    if (reason !== "not-allowed") {
      return { package: item, reason, detail: license };
    }
    return { package: item, reason: "invalid", detail: `${license} (${error.message})` };
  }
  const acceptedIn = (scope: Scope) => (term: string) =>
    acceptsTerm(policy, item.name, scope, term);
  if (isSatisfied(expression, acceptedIn(item.scope))) {
    return undefined;
  }
  const developmentOnly =
    item.scope === "runtime" && isSatisfied(expression, acceptedIn("development"));
  return {
    package: item,
    reason: classify(policy, licenseTerms(expression), developmentOnly),
    detail: license,
  };
}

/** Checks every third-party package of the lockfile against the policy. */
export function checkLicenses(lockfileText: string, policyText: string): CheckResult {
  const policy = parsePolicy(policyText);
  const packages = readLockedPackages(lockfileText);
  const violations = packages.flatMap((item) => checkPackage(policy, item) ?? []);
  return { checked: packages.length, violations };
}

const REASON_TEXT: Record<ViolationReason, string> = {
  missing: "no license declared",
  invalid: "not a valid SPDX license expression",
  forbidden: "forbidden license (never allowed)",
  "ask-first": "needs the owner's approval first",
  "development-only": "allowed only for development tools, but this package is shipped",
  "not-allowed": "license not on the allowlist",
};

/** Formats the result as lines for the console. */
export function formatResult(result: CheckResult): string[] {
  if (result.violations.length === 0) {
    return [`License check passed: ${String(result.checked)} packages comply with the policy.`];
  }
  return [
    `License check failed: ${String(result.violations.length)} of ${String(result.checked)} packages violate license-policy.json.`,
    ...result.violations.map(
      ({ package: item, reason, detail }) =>
        `  ${item.name}@${item.version} (${item.scope}): ${detail} - ${REASON_TEXT[reason]}`,
    ),
    "See docs/decisions/0005-mit-license-and-dependency-allowlist.md for what to do.",
  ];
}
