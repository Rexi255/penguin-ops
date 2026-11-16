import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { checkLicenses, checkPackage, formatResult, type ViolationReason } from "./check.ts";
import type { LockedPackage } from "./lockfile.ts";
import { parsePolicy } from "./policy.ts";

const POLICY_TEXT = JSON.stringify({
  allowed: ["MIT", "ISC", "Apache-2.0"],
  exceptions: [{ package: "tool", license: "MPL-2.0", scope: "development", reason: "test tool" }],
  askFirst: ["GPL-*", "MPL-*", "UNLICENSED", "SEE LICENSE IN *"],
  forbidden: ["CC-BY-NC-*"],
});
const policy = parsePolicy(POLICY_TEXT);

function locked(
  license: string | undefined,
  scope: LockedPackage["scope"] = "runtime",
  name = "pkg",
): LockedPackage {
  return { name, version: "1.0.0", license, scope, path: `node_modules/${name}` };
}

describe("checkPackage", () => {
  test.each([
    ["MIT", "runtime"],
    ["(MIT OR GPL-3.0)", "runtime"],
    ["MIT AND ISC", "runtime"],
    ["  Apache-2.0  ", "development"],
  ] as const)("accepts %j in %s scope", (license, scope) => {
    expect(checkPackage(policy, locked(license, scope))).toBeUndefined();
  });

  test("accepts a development exception for the named package in development scope", () => {
    expect(checkPackage(policy, locked("MPL-2.0", "development", "tool"))).toBeUndefined();
  });

  test.each<[string | undefined, LockedPackage["scope"], string, ViolationReason]>([
    [undefined, "development", "pkg", "missing"],
    ["   ", "runtime", "pkg", "missing"],
    ["MIT/X11", "runtime", "pkg", "invalid"],
    ["CC-BY-NC-4.0", "development", "pkg", "forbidden"],
    ["MIT AND CC-BY-NC-4.0", "runtime", "pkg", "forbidden"],
    ["GPL-3.0-only", "development", "pkg", "ask-first"],
    ["MIT AND GPL-2.0", "runtime", "pkg", "ask-first"],
    ["MIT AND MPL-2.0", "runtime", "tool", "development-only"],
    ["UNLICENSED", "runtime", "pkg", "ask-first"],
    ["SEE LICENSE IN LICENSE.md", "runtime", "pkg", "ask-first"],
    ["MPL-2.0", "runtime", "tool", "development-only"],
    ["MPL-2.0", "development", "other-tool", "ask-first"],
    ["WTFPL", "runtime", "pkg", "not-allowed"],
    ["MIT WITH Custom-exception", "runtime", "pkg", "not-allowed"],
  ])("rejects %j in %s scope for %s as %s", (license, scope, name, reason) => {
    expect(checkPackage(policy, locked(license, scope, name))?.reason).toBe(reason);
  });

  test("explains why an expression is not valid SPDX", () => {
    expect(checkPackage(policy, locked("MIT/X11"))?.detail).toBe(
      'MIT/X11 (invalid identifier "MIT/X11")',
    );
  });
});

describe("checkLicenses", () => {
  const lockfileText = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "root", license: "MIT" },
      "node_modules/react": { version: "19.0.0", license: "MIT" },
      "node_modules/tool": { version: "2.0.0", license: "MPL-2.0", dev: true },
      "node_modules/copyleft": { version: "3.0.0", license: "GPL-3.0" },
    },
  });

  test("reports each violating package and the number of checked packages", () => {
    const result = checkLicenses(lockfileText, POLICY_TEXT);
    expect(result.checked).toBe(3);
    expect(result.violations.map((violation) => violation.package.name)).toEqual(["copyleft"]);
    expect(formatResult(result)).toEqual([
      "License check failed: 1 of 3 packages violate license-policy.json.",
      "  copyleft@3.0.0 (runtime): GPL-3.0 - needs the owner's approval first",
      "See docs/decisions/0005-mit-license-and-dependency-allowlist.md for what to do.",
    ]);
  });

  test("passes when every package complies", () => {
    const permissive = JSON.stringify({ ...policy, allowed: [...policy.allowed, "GPL-3.0"] });
    const result = checkLicenses(lockfileText, permissive);
    expect(result.violations).toEqual([]);
    expect(formatResult(result)).toEqual([
      "License check passed: 3 packages comply with the policy.",
    ]);
  });

  test("passes for the repository's own lockfile and policy", () => {
    const root = join(import.meta.dirname, "../..");
    const result = checkLicenses(
      readFileSync(join(root, "package-lock.json"), "utf8"),
      readFileSync(join(root, "license-policy.json"), "utf8"),
    );
    expect(formatResult(result)).toHaveLength(1);
    expect(result.violations).toEqual([]);
  });
});
