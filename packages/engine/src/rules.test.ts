import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import { toUid } from "./ids";
import type { ShellEvent } from "./interpreter";
import {
  checkRule,
  evaluateRule,
  InvalidRuleError,
  type Rule,
  type RuleContext,
  terminalOutput,
} from "./rules";
import { createSession, type Session, setVariable } from "./session";
import type { World } from "./world";
import { buildWorld } from "./world-builder";

/** The same level files for a player called `name`, so that rules can be checked per name. */
function worldFor(name: string): World {
  return buildWorld(
    {
      hosts: [
        {
          name: "ws01",
          groups: [
            { name: "root", gid: 0 },
            { name, gid: 1000 },
          ],
          users: [
            { name: "root", uid: 0 },
            { name, uid: 1000 },
          ],
          files: {
            [`/home/${name}/reports/q3.txt`]: "revenue: 42\n",
            [`/home/${name}/reports/copy.txt`]: "revenue: 42\n",
            [`/home/${name}/reports/other.txt`]: "revenue: 43\n",
            [`/home/${name}/empty/`]: {},
            "/etc/app.conf": { content: "debug=false\n", mode: 0o600 },
            "/srv/locked/": { mode: 0o000 },
            "/srv/locked/inside.txt": "secret\n",
          },
        },
      ],
    },
    createGameClock(0),
  );
}

const alice = worldFor("alice");
const bob = worldFor("bob");

function context(cwd = "/home/alice", output = "", name = "alice"): RuleContext {
  const world = name === "alice" ? alice : bob;
  const session: Session = { ...createSession(world, "ws01", name), cwd };
  return { world, session, output };
}

function holds(rule: Rule, ruleContext: RuleContext = context()): boolean {
  return evaluateRule(rule, ruleContext);
}

describe("evaluateRule: the working directory", () => {
  test("cwd_is compares the working directory with the path", () => {
    const rule: Rule = { kind: "cwd_is", path: "~/reports" };
    expect(holds(rule, context("/home/alice/reports"))).toBe(true);
    expect(holds(rule, context("/home/alice"))).toBe(false);
    expect(holds({ kind: "cwd_is", path: "/" }, context("/"))).toBe(true);
  });

  test("cwd_is ignores ., .., repeated and trailing slashes on both sides", () => {
    expect(holds({ kind: "cwd_is", path: "~/reports/" }, context("//home/alice/reports"))).toBe(
      true,
    );
    expect(
      holds(
        { kind: "cwd_is", path: "/home//alice/./empty/../reports" },
        context("/home/alice/reports"),
      ),
    ).toBe(true);
    expect(holds({ kind: "cwd_is", path: "/.." }, context("/"))).toBe(true);
  });

  test("cwd_is holds for a working directory that was removed since", () => {
    expect(holds({ kind: "cwd_is", path: "~/gone" }, context("/home/alice/gone"))).toBe(true);
  });
});

describe("evaluateRule: files and directories", () => {
  test("exists holds for files and directories", () => {
    expect(holds({ kind: "exists", path: "~/reports/q3.txt" })).toBe(true);
    expect(holds({ kind: "exists", path: "~/reports" })).toBe(true);
    expect(holds({ kind: "exists", path: "~" })).toBe(true);
    expect(holds({ kind: "exists", path: "~/nothing" })).toBe(false);
  });

  test("file_exists holds only for regular files", () => {
    expect(holds({ kind: "file_exists", path: "~/reports/q3.txt" })).toBe(true);
    expect(holds({ kind: "file_exists", path: "~/reports" })).toBe(false);
    expect(holds({ kind: "file_exists", path: "~/nothing" })).toBe(false);
  });

  test("dir_exists holds only for directories, also with a trailing slash", () => {
    expect(holds({ kind: "dir_exists", path: "~/empty" })).toBe(true);
    expect(holds({ kind: "dir_exists", path: "~/empty/" })).toBe(true);
    expect(holds({ kind: "dir_exists", path: "~/reports/q3.txt" })).toBe(false);
    expect(holds({ kind: "dir_exists", path: "~/reports/q3.txt/" })).toBe(false);
  });

  test("paths through a file or a missing directory hold nothing", () => {
    expect(holds({ kind: "exists", path: "~/reports/q3.txt/x" })).toBe(false);
    expect(holds({ kind: "exists", path: "~/nothing/x" })).toBe(false);
  });

  test("permissions do not count", () => {
    expect(holds({ kind: "file_exists", path: "/srv/locked/inside.txt" })).toBe(true);
    expect(holds({ kind: "file_contains", path: "/etc/app.conf", text: "debug" })).toBe(true);
  });

  test("relative parts of absolute paths are resolved", () => {
    expect(holds({ kind: "file_exists", path: "/home/alice/empty/../reports/./q3.txt" })).toBe(
      true,
    );
  });

  test("file_contains needs a regular file with the text", () => {
    expect(holds({ kind: "file_contains", path: "~/reports/q3.txt", text: "revenue: 42" })).toBe(
      true,
    );
    expect(holds({ kind: "file_contains", path: "~/reports/q3.txt", text: "Revenue" })).toBe(false);
    expect(holds({ kind: "file_contains", path: "~/reports/q3.txt", text: "" })).toBe(true);
    expect(holds({ kind: "file_contains", path: "~/reports", text: "" })).toBe(false);
    expect(holds({ kind: "file_contains", path: "~/nothing", text: "" })).toBe(false);
  });

  test("same_content needs two regular files with equal content", () => {
    const same = (first: string, second: string): Rule => ({
      kind: "same_content",
      paths: [first, second],
    });
    expect(holds(same("~/reports/q3.txt", "~/reports/copy.txt"))).toBe(true);
    expect(holds(same("~/reports/q3.txt", "~/reports/other.txt"))).toBe(false);
    expect(holds(same("~/reports/q3.txt", "~/nothing"))).toBe(false);
    expect(holds(same("~/nothing", "~/nothing"))).toBe(false);
    expect(holds(same("~/empty", "~/empty"))).toBe(false);
  });
});

describe("evaluateRule: the player's name and home", () => {
  test("~ is the player's home whatever the player is called", () => {
    const rule: Rule = { kind: "file_contains", path: "~/reports/q3.txt", text: "42" };
    expect(holds(rule, context("/home/alice"))).toBe(true);
    expect(holds(rule, context("/home/bob", "", "bob"))).toBe(true);
    expect(holds({ kind: "cwd_is", path: "~" }, context("/home/bob", "", "bob"))).toBe(true);
  });

  test("~ is the home from the user list, not HOME", () => {
    const base = context();
    const moved: RuleContext = { ...base, session: setVariable(base.session, "HOME", "/tmp") };
    expect(holds({ kind: "file_exists", path: "~/reports/q3.txt" }, moved)).toBe(true);
  });

  test("a session whose user has no entry is an Error", () => {
    const base = context();
    const ghost: RuleContext = {
      ...base,
      session: { ...base.session, credentials: { ...base.session.credentials, uid: toUid(4242) } },
    };
    expect(() => holds({ kind: "exists", path: "~" }, ghost)).toThrow(/has no home/u);
    expect(holds({ kind: "exists", path: "/etc" }, ghost)).toBe(true);
  });

  test("a session on a host outside the world is an Error", () => {
    const base = context();
    const lost: RuleContext = { ...base, session: { ...base.session, host: "nosuch" } };
    expect(() => holds({ kind: "exists", path: "/" }, lost)).toThrow(/not part of the world/u);
  });
});

describe("evaluateRule: output", () => {
  const output = "Device:     Kyocera\nIP address: 10.20.2.50\n";

  test("output_contains looks for the text in the output of the last input", () => {
    expect(holds({ kind: "output_contains", text: "10.20.2.50" }, context("/", output))).toBe(true);
    expect(holds({ kind: "output_contains", text: "10.20.0.41" }, context("/", output))).toBe(
      false,
    );
    expect(holds({ kind: "output_contains", text: "x" }, context("/", ""))).toBe(false);
  });

  test("output_matches finds the pattern anywhere, with ^ and $ at line breaks", () => {
    const matches = (pattern: string): boolean =>
      holds({ kind: "output_matches", pattern }, context("/", output));
    expect(matches(String.raw`10\.20\.2\.\d+`)).toBe(true);
    expect(matches("^IP address: [0-9.]+$")).toBe(true);
    expect(matches("^Kyocera")).toBe(false);
    expect(matches(String.raw`\p{Lu}`)).toBe(true);
  });
});

describe("evaluateRule: combinations", () => {
  const yes: Rule = { kind: "exists", path: "/etc" };
  const no: Rule = { kind: "exists", path: "/nothing" };

  test("all holds if every rule holds", () => {
    expect(holds({ kind: "all", rules: [yes, yes] })).toBe(true);
    expect(holds({ kind: "all", rules: [yes, no] })).toBe(false);
  });

  test("any holds if one rule holds", () => {
    expect(holds({ kind: "any", rules: [no, yes] })).toBe(true);
    expect(holds({ kind: "any", rules: [no, no] })).toBe(false);
  });

  test("not inverts its rule, and combinations nest", () => {
    expect(holds({ kind: "not", rule: no })).toBe(true);
    expect(holds({ kind: "not", rule: yes })).toBe(false);
    expect(
      holds({ kind: "all", rules: [yes, { kind: "not", rule: { kind: "any", rules: [no] } }] }),
    ).toBe(true);
  });
});

describe("checkRule", () => {
  test("accepts valid rules", () => {
    const rule: Rule = {
      kind: "all",
      rules: [
        { kind: "cwd_is", path: "~" },
        { kind: "same_content", paths: ["/a", "~/b"] },
        { kind: "output_contains", text: "" },
        { kind: "output_matches", pattern: "a+" },
        { kind: "not", rule: { kind: "dir_exists", path: "/" } },
      ],
    };
    expect(() => {
      checkRule(rule);
    }).not.toThrow();
  });

  test.each([
    ["a relative path", { kind: "exists", path: "reports" }],
    ["an empty path", { kind: "file_exists", path: "" }],
    ["another user's home", { kind: "dir_exists", path: "~bob/x" }],
    ["a relative second path", { kind: "same_content", paths: ["/a", "b"] }],
    ["an invalid pattern", { kind: "output_matches", pattern: "(" }],
    ["an empty all", { kind: "all", rules: [] }],
    ["an empty any", { kind: "any", rules: [] }],
    ["an invalid rule inside not", { kind: "not", rule: { kind: "cwd_is", path: "." } }],
    ["an invalid rule inside any", { kind: "any", rules: [{ kind: "exists", path: "x" }] }],
  ] satisfies [string, Rule][])("rejects %s", (_name, rule) => {
    expect(() => {
      checkRule(rule);
    }).toThrow(InvalidRuleError);
    expect(() => evaluateRule(rule, context())).toThrow(InvalidRuleError);
  });
});

describe("terminalOutput", () => {
  test("joins standard output and standard error in order, without clears and notices", () => {
    const events: ShellEvent[] = [
      { kind: "output", stream: "stdout", text: "a\n" },
      { kind: "output", stream: "stderr", text: "cat: x: No such file or directory\n" },
      { kind: "clear-screen", clearsScrollback: true },
      { kind: "output", stream: "stdout", text: "b\n" },
      { kind: "notice", command: "ls", notice: { key: "option-not-simulated", option: "-R" } },
    ];
    expect(terminalOutput(events)).toBe("a\ncat: x: No such file or directory\nb\n");
    expect(terminalOutput([])).toBe("");
  });
});
