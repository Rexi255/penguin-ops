import { describe, expect, test } from "vitest";

import { isSatisfied, licenseTerms, parseSpdx, SpdxSyntaxError } from "./spdx.ts";

describe("parseSpdx", () => {
  test("parses a single license", () => {
    expect(parseSpdx("MIT")).toEqual({ kind: "license", id: "MIT", exception: undefined });
  });

  test("parses OR and AND with AND binding stronger", () => {
    expect(parseSpdx("MIT OR Apache-2.0 AND ISC")).toEqual({
      kind: "or",
      left: { kind: "license", id: "MIT", exception: undefined },
      right: {
        kind: "and",
        left: { kind: "license", id: "Apache-2.0", exception: undefined },
        right: { kind: "license", id: "ISC", exception: undefined },
      },
    });
  });

  test("respects parentheses, also without spaces around them", () => {
    expect(parseSpdx("(MIT OR Apache-2.0)AND ISC")).toEqual({
      kind: "and",
      left: {
        kind: "or",
        left: { kind: "license", id: "MIT", exception: undefined },
        right: { kind: "license", id: "Apache-2.0", exception: undefined },
      },
      right: { kind: "license", id: "ISC", exception: undefined },
    });
  });

  test("parses WITH exceptions, plus suffixes and license references", () => {
    expect(licenseTerms(parseSpdx("Apache-2.0 WITH LLVM-exception"))).toEqual([
      "Apache-2.0 WITH LLVM-exception",
    ]);
    expect(licenseTerms(parseSpdx("GPL-2.0+ OR LicenseRef-Custom"))).toEqual([
      "GPL-2.0+",
      "LicenseRef-Custom",
    ]);
    expect(licenseTerms(parseSpdx("DocumentRef-spdx-tool:LicenseRef-MIT-style"))).toEqual([
      "DocumentRef-spdx-tool:LicenseRef-MIT-style",
    ]);
  });

  test.each([
    ["", "unexpected end of expression"],
    ["MIT OR", "unexpected end of expression"],
    ["(MIT", 'missing ")"'],
    ["MIT)", 'unexpected ")"'],
    [")", 'unexpected ")"'],
    ["MIT Apache-2.0", "expected AND or OR between licenses"],
    ["OR MIT", 'unexpected operator "OR"'],
    ["MIT WITH", 'expected an exception identifier after "WITH"'],
    ["MIT or ISC", "expected AND or OR between licenses"],
    ["SEE LICENSE IN LICENSE.md", "expected AND or OR between licenses"],
    ["MIT/X11", 'invalid identifier "MIT/X11"'],
  ])("rejects %j", (text, message) => {
    expect(() => parseSpdx(text)).toThrow(new SpdxSyntaxError(message));
  });
});

describe("isSatisfied", () => {
  const onlyMit = (term: string) => term === "MIT";

  test("needs one accepted side of OR", () => {
    expect(isSatisfied(parseSpdx("GPL-3.0 OR MIT"), onlyMit)).toBe(true);
    expect(isSatisfied(parseSpdx("GPL-3.0 OR ISC"), onlyMit)).toBe(false);
  });

  test("needs both sides of AND", () => {
    expect(isSatisfied(parseSpdx("MIT AND MIT"), onlyMit)).toBe(true);
    expect(isSatisfied(parseSpdx("MIT AND GPL-3.0"), onlyMit)).toBe(false);
  });

  test("treats a license with an exception as its own term", () => {
    expect(isSatisfied(parseSpdx("MIT WITH Some-exception"), onlyMit)).toBe(false);
  });
});
