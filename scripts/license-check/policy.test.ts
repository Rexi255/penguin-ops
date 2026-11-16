import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { acceptsTerm, matchesPattern, parsePolicy, PolicyError } from "./policy.ts";

const VALID = {
  $comment: "test policy",
  allowed: ["MIT", "ISC"],
  exceptions: [
    { package: "tool-*", license: "MPL-2.0", scope: "development", reason: "test tool" },
  ],
  askFirst: ["GPL-*", "MPL-*"],
  forbidden: ["CC-BY-NC-*"],
};

function withChanges(changes: Record<string, unknown>): string {
  return JSON.stringify({ ...VALID, ...changes });
}

describe("parsePolicy", () => {
  test("reads a valid policy", () => {
    const policy = parsePolicy(JSON.stringify(VALID));
    expect(policy.allowed).toEqual(["MIT", "ISC"]);
    expect(policy.exceptions).toEqual(VALID.exceptions);
    expect(policy.askFirst).toEqual(["GPL-*", "MPL-*"]);
    expect(policy.forbidden).toEqual(["CC-BY-NC-*"]);
  });

  test("reads the repository's license-policy.json", () => {
    const text = readFileSync(join(import.meta.dirname, "../../license-policy.json"), "utf8");
    expect(parsePolicy(text).allowed).toContain("MIT");
  });

  test.each([
    ["{", /^not valid JSON: /],
    ["[]", /^the policy must be a JSON object$/],
    [withChanges({ extra: true }), /^unknown field "extra" in the policy$/],
    [withChanges({ allowed: "MIT" }), /^"allowed" must be an array of non-empty strings$/],
    [withChanges({ allowed: ["MIT", ""] }), /^"allowed" must be an array of non-empty strings$/],
    [
      withChanges({ allowed: ["GPL-*"] }),
      /^"allowed" must list exact licenses, not the pattern "GPL-\*"$/,
    ],
    [withChanges({ askFirst: [1] }), /^"askFirst" must be an array of non-empty strings$/],
    [withChanges({ forbidden: undefined }), /^"forbidden" must be an array of non-empty strings$/],
    [withChanges({ exceptions: {} }), /^"exceptions" must be an array$/],
    [withChanges({ exceptions: ["x"] }), /^"exceptions\[0\]" must be an object$/],
    [
      withChanges({ exceptions: [{ ...VALID.exceptions[0], scope: "runtime" }] }),
      /^"exceptions\[0\]\.scope" must be "development"$/,
    ],
    [
      withChanges({ exceptions: [{ ...VALID.exceptions[0], package: "" }] }),
      /^"exceptions\[0\]\.package" must be a non-empty string$/,
    ],
    [
      withChanges({ exceptions: [{ ...VALID.exceptions[0], reason: 5 }] }),
      /^"exceptions\[0\]\.reason" must be a non-empty string$/,
    ],
    [
      withChanges({ exceptions: [{ ...VALID.exceptions[0], note: "x" }] }),
      /^unknown field "note" in exceptions\[0\]$/,
    ],
  ])("rejects an invalid policy (%#)", (text, message) => {
    expect(() => parsePolicy(text)).toThrow(PolicyError);
    expect(() => parsePolicy(text)).toThrow(message);
  });
});

describe("matchesPattern", () => {
  test.each([
    ["MIT", "MIT", true],
    ["MIT", "MIT-0", false],
    ["GPL-*", "GPL-3.0-only", true],
    ["GPL-*", "LGPL-2.1", false],
    ["lightningcss-*", "lightningcss-win32-x64-msvc", true],
    ["lightningcss-*", "lightningcss", false],
    ["SEE LICENSE IN *", "SEE LICENSE IN LICENSE.md", true],
    ["a.b", "axb", false],
    ["(x)+", "(x)+", true],
  ])("%j matches %j: %j", (pattern, text, expected) => {
    expect(matchesPattern(pattern, text)).toBe(expected);
  });
});

describe("acceptsTerm", () => {
  const policy = parsePolicy(JSON.stringify(VALID));

  test("accepts allowed licenses in every scope", () => {
    expect(acceptsTerm(policy, "react", "runtime", "MIT")).toBe(true);
    expect(acceptsTerm(policy, "vite", "development", "ISC")).toBe(true);
  });

  test("accepts an exception only for matching packages in development scope", () => {
    expect(acceptsTerm(policy, "tool-linux", "development", "MPL-2.0")).toBe(true);
    expect(acceptsTerm(policy, "tool-linux", "runtime", "MPL-2.0")).toBe(false);
    expect(acceptsTerm(policy, "other", "development", "MPL-2.0")).toBe(false);
    expect(acceptsTerm(policy, "tool-linux", "development", "GPL-3.0")).toBe(false);
  });
});
