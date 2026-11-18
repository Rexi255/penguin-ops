// The content package may only import types from the engine (ADR 0006), so its rule schema
// repeats the checks of the engine's checkRule (ADR 0068). Gameplay sees both packages: these
// tests make sure that the schema accepts exactly the rules that the engine accepts.

import { ruleSchema } from "@penguin-ops/content";
import { checkRule, InvalidRuleError, type Rule } from "@penguin-ops/engine";
import { describe, expect, test } from "vitest";

/** Rule paths, valid and invalid ones, in the engine's notation. */
const PATHS = [
  "/",
  "/etc/hosts",
  "/a/../b//c/.",
  "~",
  "~/",
  "~/reports",
  "~/a/../b",
  "",
  "reports",
  "./reports",
  "../x",
  "~reports",
  "~admin",
  "~admin/x",
  " /etc",
];

/** Output patterns, valid and invalid ones. */
const PATTERNS = [
  "",
  "^total \\d+$",
  "\\p{L}+",
  "a{2,3}",
  "(?<name>x)\\k<name>",
  "(",
  "a{2,1}",
  "\\p{Nope}",
  "[z-a]",
  "\\c",
  "a**",
  "(?<a>x)(?<a>y)",
];

/** Whether the engine accepts the rule. */
function engineAccepts(rule: Rule): boolean {
  try {
    checkRule(rule);
    return true;
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidRuleError);
    return false;
  }
}

describe("the rule schema agrees with the engine's checkRule", () => {
  test.each(PATHS)("on the path %j", (path) => {
    const parsed = ruleSchema.safeParse({ cwd_is: path });
    expect(parsed.success).toBe(engineAccepts({ kind: "cwd_is", path }));
  });

  test.each(PATTERNS)("on the output pattern %j", (pattern) => {
    const parsed = ruleSchema.safeParse({ output_matches: pattern });
    expect(parsed.success).toBe(engineAccepts({ kind: "output_matches", pattern }));
  });

  test.each(["all", "any"] as const)("on an empty %s", (kind) => {
    expect(ruleSchema.safeParse({ [kind]: [] }).success).toBe(false);
    expect(engineAccepts({ kind, rules: [] })).toBe(false);
  });

  test("every rule the schema returns passes the engine's checks", () => {
    const input = {
      all: [
        { cwd_is: "~" },
        { exists: "/etc" },
        { file_exists: "~/a" },
        { dir_exists: "/tmp/" },
        { file_contains: ["~/a", "x"] },
        { same_content: ["~/a", "/tmp/a"] },
        { output_contains: "x" },
        { any: [{ output_matches: "^x$" }, { not: { cwd_is: "/" } }] },
      ],
    };
    expect(engineAccepts(ruleSchema.parse(input))).toBe(true);
  });
});
