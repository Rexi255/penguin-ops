import type { Rule } from "@penguin-ops/engine";
import { describe, expect, test } from "vitest";

import { ruleSchema } from "./rule-schema";

/** The messages and paths of the issues of a rule that must fail. */
function problems(input: unknown): { path: PropertyKey[]; message: string }[] {
  const result = ruleSchema.safeParse(input);
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map(({ path, message }) => ({ path, message }));
}

describe("ruleSchema: every rule type", () => {
  test.each<[string, unknown, Rule]>([
    ["cwd_is", { cwd_is: "~/reports" }, { kind: "cwd_is", path: "~/reports" }],
    ["exists", { exists: "/etc/hosts" }, { kind: "exists", path: "/etc/hosts" }],
    ["file_exists", { file_exists: "~/a.txt" }, { kind: "file_exists", path: "~/a.txt" }],
    ["dir_exists", { dir_exists: "~" }, { kind: "dir_exists", path: "~" }],
    [
      "file_contains",
      { file_contains: ["~/notes.txt", "10.20.2.50"] },
      { kind: "file_contains", path: "~/notes.txt", text: "10.20.2.50" },
    ],
    [
      "same_content",
      { same_content: ["~/a.txt", "/tmp/a.txt"] },
      { kind: "same_content", paths: ["~/a.txt", "/tmp/a.txt"] },
    ],
    [
      "output_contains",
      { output_contains: "10.20.2.50" },
      { kind: "output_contains", text: "10.20.2.50" },
    ],
    [
      "output_matches",
      { output_matches: "^total \\d+$" },
      { kind: "output_matches", pattern: "^total \\d+$" },
    ],
  ])("%s becomes the engine's rule", (_type, input, rule) => {
    expect(ruleSchema.parse(input)).toEqual(rule);
  });

  test("all, any and not take rules in their YAML form, also nested", () => {
    const input = {
      all: [{ cwd_is: "~" }, { any: [{ exists: "~/a" }, { not: { output_contains: "error" } }] }],
    };
    expect(ruleSchema.parse(input)).toEqual({
      kind: "all",
      rules: [
        { kind: "cwd_is", path: "~" },
        {
          kind: "any",
          rules: [
            { kind: "exists", path: "~/a" },
            { kind: "not", rule: { kind: "output_contains", text: "error" } },
          ],
        },
      ],
    });
  });

  test("paths may contain ., .. and repeated slashes like in the engine", () => {
    expect(ruleSchema.parse({ cwd_is: "~/a/../b//c/." })).toEqual({
      kind: "cwd_is",
      path: "~/a/../b//c/.",
    });
  });

  test("texts may be empty and contain line breaks", () => {
    expect(ruleSchema.parse({ output_contains: "" })).toEqual({
      kind: "output_contains",
      text: "",
    });
    expect(ruleSchema.parse({ file_contains: ["/f", "a\nb"] })).toEqual({
      kind: "file_contains",
      path: "/f",
      text: "a\nb",
    });
  });
});

describe("ruleSchema: invalid rules", () => {
  test("a rule without a rule type names the rule types", () => {
    expect(problems({})).toEqual([
      {
        path: [],
        message:
          "a rule needs one rule type: cwd_is, exists, file_exists, dir_exists, file_contains, same_content, output_contains, output_matches, all, any, not",
      },
    ]);
  });

  test("a rule with two rule types points to all, any and not", () => {
    expect(problems({ cwd_is: "~", exists: "~/a" })).toEqual([
      {
        path: [],
        message:
          "a rule has exactly one rule type, not cwd_is and exists; combine rules with all, any or not",
      },
    ]);
  });

  test("an unknown rule type is an error, also next to a known one", () => {
    const types =
      "cwd_is, exists, file_exists, dir_exists, file_contains, same_content, output_contains, output_matches, all, any, not";
    expect(problems({ cwd_iss: "~" })).toEqual([
      { path: ["cwd_iss"], message: `unknown rule type "cwd_iss"; the rule types are ${types}` },
    ]);
    expect(problems({ cwd_is: "~", say: "x" })).toEqual([
      { path: ["say"], message: `unknown rule type "say"; the rule types are ${types}` },
    ]);
    expect(problems({ toString: "x" })[0]?.path).toEqual(["toString"]);
  });

  test.each(["reports", "./reports", "~reports", "~admin/x", ""])(
    "the path %j is neither absolute nor in the player's home",
    (path) => {
      expect(problems({ dir_exists: path })).toEqual([
        {
          path: ["dir_exists"],
          message: "a path must be absolute or start with ~/ (the player's home)",
        },
      ]);
    },
  );

  test("paths inside file_contains and same_content are checked", () => {
    expect(problems({ file_contains: ["notes.txt", "x"] })).toEqual([
      {
        path: ["file_contains", 0],
        message: "a path must be absolute or start with ~/ (the player's home)",
      },
    ]);
    expect(problems({ same_content: ["~/a", "b"] })).toEqual([
      {
        path: ["same_content", 1],
        message: "a path must be absolute or start with ~/ (the player's home)",
      },
    ]);
  });

  test("file_contains and same_content take exactly two values", () => {
    expect(problems({ file_contains: ["~/a"] })[0]?.path).toEqual(["file_contains"]);
    expect(problems({ same_content: ["~/a", "~/b", "~/c"] })[0]?.path).toEqual(["same_content"]);
    expect(problems({ file_contains: "~/a" })[0]?.path).toEqual(["file_contains"]);
  });

  test.each(["(", "a{2,1}", "\\p{Nope}", "[z-a]"])(
    "output_matches rejects %j, which is no JavaScript regular expression with the flag u",
    (pattern) => {
      expect(problems({ output_matches: pattern })).toEqual([
        {
          path: ["output_matches"],
          message: "not a valid JavaScript regular expression (with the flags m and u)",
        },
      ]);
    },
  );

  test("all and any need at least one rule", () => {
    expect(problems({ all: [] })).toEqual([
      { path: ["all"], message: '"all" needs at least one rule' },
    ]);
    expect(problems({ any: [] })).toEqual([
      { path: ["any"], message: '"any" needs at least one rule' },
    ]);
  });

  test("errors inside nested rules name the path to them", () => {
    expect(problems({ all: [{ cwd_is: "~" }, { not: { exists: "rel" } }] })).toEqual([
      {
        path: ["all", 1, "not", "exists"],
        message: "a path must be absolute or start with ~/ (the player's home)",
      },
    ]);
  });

  test.each([null, "cwd_is", ["cwd_is", "~"], 1])("%j is no rule", (input) => {
    expect(problems(input)[0]?.path).toEqual([]);
  });

  test("wrong value types are errors at the rule type", () => {
    expect(problems({ cwd_is: 1 })[0]?.path).toEqual(["cwd_is"]);
    expect(problems({ output_contains: null })[0]?.path).toEqual(["output_contains"]);
    expect(problems({ not: [] })[0]?.path).toEqual(["not"]);
  });
});
