import { describe, expect, test } from "vitest";

import { type Level, levelSchema, parseMode } from "./level-schema";

/** The example level of docs/LEVEL-AUTHORING.md, as the YAML parser reads it. */
function exampleLevel(): Record<string, unknown> {
  return {
    format: 1,
    id: "printer-floor2",
    kind: "main",
    teaches: ["cat"],
    xp: 100,
    start: {
      files: {
        "~/tickets/handover.txt": { text: "handover" },
        "~/tickets/printer-floor2.txt": "Device:     Inkwell P4200\nIP address: 10.20.2.50\n",
        "~/tickets/printer-ground.txt": "Device:     Inkwell P300\nIP address: 10.20.0.41\n",
      },
    },
    goal: { output_contains: "10.20.2.50" },
    tips: [{ when: { output_contains: "10.20.0.41" }, say: "tip-wrong-printer" }],
    solutions: [
      ["cat ~/tickets/handover.txt", "cat ~/tickets/printer-floor2.txt"],
      ["cat ~/tickets/printer-floor2.txt"],
    ],
  };
}

/** A minimal valid level, with `changes` applied; `undefined` removes a field. */
function level(changes: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    format: 1,
    id: "first-steps",
    kind: "main",
    teaches: ["pwd"],
    goal: { output_contains: "/home" },
    solutions: [["pwd"]],
    ...changes,
  };
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined));
}

/** The messages and paths of the issues of a level that must fail. */
function problems(input: unknown): { path: PropertyKey[]; message: string }[] {
  const result = levelSchema.safeParse(input);
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map(({ path, message }) => ({ path, message }));
}

/** The start files of a level with these `start.files`. */
function startFiles(files: Record<string, unknown>): Level["start"]["files"] {
  return levelSchema.parse(level({ start: { files } })).start.files;
}

describe("levelSchema: the example level", () => {
  test("parses into a level with engine rules and a list of start files", () => {
    expect(levelSchema.parse(exampleLevel())).toEqual({
      format: 1,
      id: "printer-floor2",
      kind: "main",
      teaches: ["cat"],
      xp: 100,
      start: {
        cwd: "~",
        files: [
          {
            kind: "file",
            path: "~/tickets/handover.txt",
            source: { kind: "text", key: "handover" },
          },
          {
            kind: "file",
            path: "~/tickets/printer-floor2.txt",
            source: {
              kind: "content",
              content: "Device:     Inkwell P4200\nIP address: 10.20.2.50\n",
            },
          },
          {
            kind: "file",
            path: "~/tickets/printer-ground.txt",
            source: {
              kind: "content",
              content: "Device:     Inkwell P300\nIP address: 10.20.0.41\n",
            },
          },
        ],
      },
      goal: { kind: "output_contains", text: "10.20.2.50" },
      tips: [{ when: { kind: "output_contains", text: "10.20.0.41" }, say: "tip-wrong-printer" }],
      extraGoals: [],
      solutions: [
        ["cat ~/tickets/handover.txt", "cat ~/tickets/printer-floor2.txt"],
        ["cat ~/tickets/printer-floor2.txt"],
      ],
    } satisfies Level);
  });
});

describe("levelSchema: defaults and optional fields", () => {
  test("a minimal level gets the defaults", () => {
    expect(levelSchema.parse(level())).toEqual({
      format: 1,
      id: "first-steps",
      kind: "main",
      teaches: ["pwd"],
      xp: 100,
      start: { cwd: "~", files: [] },
      goal: { kind: "output_contains", text: "/home" },
      tips: [],
      extraGoals: [],
      solutions: [["pwd"]],
    } satisfies Level);
  });

  test("xp, world, start host and start directory are taken over", () => {
    const parsed = levelSchema.parse(
      level({ xp: 250, world: "office-network", start: { host: "web-01", cwd: "/var/log" } }),
    );
    expect(parsed.xp).toBe(250);
    expect(parsed.world).toBe("office-network");
    expect(parsed.start).toEqual({ host: "web-01", cwd: "/var/log", files: [] });
  });

  test.each(["main", "review", "side", "incident"])("the kind %s is valid", (kind) => {
    expect(levelSchema.parse(level({ kind })).kind).toBe(kind);
  });

  test("extra goals become extraGoals with engine rules", () => {
    const parsed = levelSchema.parse(
      level({
        extra_goals: [
          { id: "no-cd", when: { cwd_is: "~" }, xp: 20 },
          { id: "tidy", when: { not: { exists: "~/tmp" } }, xp: 30 },
        ],
      }),
    );
    expect(parsed.extraGoals).toEqual([
      { id: "no-cd", when: { kind: "cwd_is", path: "~" }, xp: 20 },
      { id: "tidy", when: { kind: "not", rule: { kind: "exists", path: "~/tmp" } }, xp: 30 },
    ]);
  });
});

describe("levelSchema: goal and steps", () => {
  test("steps replace the goal, with an optional text key", () => {
    const parsed = levelSchema.parse(
      level({
        goal: undefined,
        steps: [
          { id: "find-log", goal: { cwd_is: "/var/log" }, say: "found-the-logs" },
          { id: "read-log", goal: { output_contains: "disk full" } },
        ],
      }),
    );
    expect(parsed.goal).toBeUndefined();
    expect(parsed.steps).toEqual([
      { id: "find-log", goal: { kind: "cwd_is", path: "/var/log" }, say: "found-the-logs" },
      { id: "read-log", goal: { kind: "output_contains", text: "disk full" } },
    ]);
  });

  test("a level needs a goal or steps", () => {
    expect(problems(level({ goal: undefined }))).toEqual([
      { path: [], message: "a level needs either goal or steps" },
    ]);
  });

  test("a level has a goal or steps, not both", () => {
    const steps = [
      { id: "a", goal: { cwd_is: "~" } },
      { id: "b", goal: { cwd_is: "/" } },
    ];
    expect(problems(level({ steps }))).toEqual([
      { path: [], message: "a level has either goal or steps, not both" },
    ]);
  });

  test("a multi-step ticket has at least two steps", () => {
    expect(
      problems(level({ goal: undefined, steps: [{ id: "a", goal: { cwd_is: "~" } }] })),
    ).toEqual([
      {
        path: ["steps"],
        message: "a multi-step ticket has at least two steps; use goal for one",
      },
    ]);
  });

  test("step IDs are unique and kebab-case", () => {
    const steps = [
      { id: "same", goal: { cwd_is: "~" } },
      { id: "same", goal: { cwd_is: "/" } },
      { id: "Not_Kebab", goal: { cwd_is: "/" } },
    ];
    expect(problems(level({ goal: undefined, steps }))).toEqual([
      {
        path: ["steps", 2, "id"],
        message:
          "a step ID must be kebab-case: lowercase letters and digits, separated by single hyphens",
      },
      { path: ["steps", 1, "id"], message: 'the step ID "same" is repeated' },
    ]);
  });

  test("rule errors name their place in the level", () => {
    expect(problems(level({ goal: { all: [{ cwd_is: "logs" }] } }))).toEqual([
      {
        path: ["goal", "all", 0, "cwd_is"],
        message: "a path must be absolute or start with ~/ (the player's home)",
      },
    ]);
    expect(
      problems(level({ tips: [{ when: { output_matches: "(" }, say: "tip" }] }))[0]?.path,
    ).toEqual(["tips", 0, "when", "output_matches"]);
  });
});

describe("levelSchema: fields of the level", () => {
  test("unknown fields are errors, so typos do not go unnoticed", () => {
    expect(problems(level({ tipps: [] }))).toEqual([
      { path: [], message: 'Unrecognized key: "tipps"' },
    ]);
    expect(problems(level({ start: { cdw: "~" } }))).toEqual([
      { path: ["start"], message: 'Unrecognized key: "cdw"' },
    ]);
  });

  test("the format version must be 1", () => {
    expect(problems(level({ format: 2 }))).toEqual([
      { path: ["format"], message: "the level format version must be 1" },
    ]);
    expect(problems(level({ format: undefined }))[0]?.path).toEqual(["format"]);
  });

  test.each(["Printer", "printer_floor2", "printer--floor", "-printer", "printer-", ""])(
    "the level ID %j is not kebab-case",
    (id) => {
      expect(problems(level({ id }))).toEqual([
        {
          path: ["id"],
          message:
            "a level ID must be kebab-case: lowercase letters and digits, separated by single hyphens",
        },
      ]);
    },
  );

  test("the world ID is kebab-case too", () => {
    expect(problems(level({ world: "Office" }))[0]?.path).toEqual(["world"]);
  });

  test("an unknown kind is an error", () => {
    expect(problems(level({ kind: "boss" }))[0]?.path).toEqual(["kind"]);
  });

  test("teaches lists at least one valid command name, each once", () => {
    expect(problems(level({ teaches: [] }))).toEqual([
      { path: ["teaches"], message: "a level teaches or practises at least one command" },
    ]);
    expect(problems(level({ teaches: ["ls", "cat", "ls"] }))).toEqual([
      { path: ["teaches", 2], message: 'the command "ls" is repeated' },
    ]);
    expect(problems(level({ teaches: ["ls -l"] }))).toEqual([
      { path: ["teaches", 0], message: "not a valid command name" },
    ]);
    expect(levelSchema.parse(level({ teaches: ["apt-get", "python3", "g++"] })).teaches).toEqual([
      "apt-get",
      "python3",
      "g++",
    ]);
  });

  test.each([0, -5, 1.5, "100"])("xp %j is not a positive integer", (xp) => {
    expect(problems(level({ xp }))[0]?.path).toEqual(["xp"]);
  });

  test("the start host must be a valid host name", () => {
    expect(problems(level({ start: { host: "Web_01" } }))).toEqual([
      { path: ["start", "host"], message: "not a valid host name" },
    ]);
  });

  test("the start directory follows the path rules of check rules", () => {
    expect(problems(level({ start: { cwd: "tickets" } }))).toEqual([
      {
        path: ["start", "cwd"],
        message: "a path must be absolute or start with ~/ (the player's home)",
      },
    ]);
  });
});

describe("levelSchema: tips and extra goals", () => {
  test("a tip needs a rule and a text key", () => {
    expect(problems(level({ tips: [{ when: { cwd_is: "~" } }] }))[0]?.path).toEqual([
      "tips",
      0,
      "say",
    ]);
    expect(problems(level({ tips: [{ say: "tip" }] }))[0]?.path).toEqual(["tips", 0, "when"]);
  });

  test.each(["Tip", "tip_one", "1-tip", "tip-"])("%j is no valid text key", (say) => {
    expect(problems(level({ tips: [{ when: { cwd_is: "~" }, say }] }))).toEqual([
      {
        path: ["tips", 0, "say"],
        message:
          "a text key must be kebab-case and start with a letter, for example tip-wrong-printer",
      },
    ]);
  });

  test.each(["title", "ticket", "hints", "explanation"])(
    "the catalog's own key %s cannot be used as a text key",
    (say) => {
      expect(problems(level({ tips: [{ when: { cwd_is: "~" }, say }] }))).toEqual([
        {
          path: ["tips", 0, "say"],
          message:
            "a text key must not be one of the catalog's own keys: title, ticket, hints, explanation",
        },
      ]);
    },
  );

  test("extra goal IDs are unique, and extra goals need positive integer xp", () => {
    const goal = { id: "bonus", when: { cwd_is: "~" }, xp: 10 };
    expect(problems(level({ extra_goals: [goal, goal] }))).toEqual([
      { path: ["extra_goals", 1, "id"], message: 'the extra goal ID "bonus" is repeated' },
    ]);
    expect(problems(level({ extra_goals: [{ ...goal, xp: 0 }] }))[0]?.path).toEqual([
      "extra_goals",
      0,
      "xp",
    ]);
    expect(
      problems(level({ extra_goals: [{ id: "bonus", when: { cwd_is: "~" } }] }))[0]?.path,
    ).toEqual(["extra_goals", 0, "xp"]);
  });
});

describe("levelSchema: reference solutions", () => {
  test("a level needs at least one solution with at least one command line", () => {
    expect(problems(level({ solutions: [] }))).toEqual([
      { path: ["solutions"], message: "a level needs at least one reference solution" },
    ]);
    expect(problems(level({ solutions: [["pwd"], []] }))).toEqual([
      { path: ["solutions", 1], message: "a reference solution needs a command" },
    ]);
    expect(problems(level({ solutions: undefined }))[0]?.path).toEqual(["solutions"]);
  });

  test("command lines are not empty and have no line breaks", () => {
    expect(problems(level({ solutions: [["pwd", "  "]] }))).toEqual([
      { path: ["solutions", 0, 1], message: "a command line must not be empty" },
    ]);
    expect(problems(level({ solutions: [["cd /tmp\nls"]] }))).toEqual([
      {
        path: ["solutions", 0, 0],
        message: "a command line must not contain a line break; write one command line per entry",
      },
    ]);
  });
});

describe("levelSchema: start files", () => {
  test("files take literal content, a text key or an object with attributes", () => {
    expect(
      startFiles({
        "~/a.txt": "alpha\n",
        "~/b.txt": { text: "note" },
        "/etc/app.conf": {
          content: "debug=false\n",
          owner: "root",
          group: "adm",
          mode: "rw-r-----",
        },
        "~/empty.txt": { content: "" },
      }),
    ).toEqual([
      { kind: "file", path: "~/a.txt", source: { kind: "content", content: "alpha\n" } },
      { kind: "file", path: "~/b.txt", source: { kind: "text", key: "note" } },
      {
        kind: "file",
        path: "/etc/app.conf",
        source: { kind: "content", content: "debug=false\n" },
        owner: "root",
        group: "adm",
        mode: 0o640,
      },
      { kind: "file", path: "~/empty.txt", source: { kind: "content", content: "" } },
    ]);
  });

  test("a path that ends with a slash is a directory, with or without attributes", () => {
    expect(
      startFiles({ "~/projects/": {}, "/srv/share/": { owner: "anna", mode: "rwxrwx---" } }),
    ).toEqual([
      { kind: "directory", path: "~/projects" },
      { kind: "directory", path: "/srv/share", owner: "anna", mode: 0o770 },
    ]);
  });

  test("a directory takes no content or text", () => {
    const message = 'a directory (path ending with "/") has no content or text';
    expect(problems(level({ start: { files: { "~/docs/": "x" } } }))).toEqual([
      { path: ["start", "files", "~/docs/"], message },
    ]);
    expect(problems(level({ start: { files: { "~/docs/": { text: "note" } } } }))).toEqual([
      { path: ["start", "files", "~/docs/"], message },
    ]);
  });

  test("a file needs content or text, but not both", () => {
    expect(problems(level({ start: { files: { "~/docs": {} } } }))).toEqual([
      {
        path: ["start", "files", "~/docs"],
        message: 'a file needs content or text; end the path with "/" for a directory',
      },
    ]);
    expect(
      problems(level({ start: { files: { "~/a": { content: "x", text: "note" } } } })),
    ).toEqual([
      { path: ["start", "files", "~/a"], message: "a file has either content or text, not both" },
    ]);
  });

  test.each([
    ["tickets/a.txt", 'a start file path must be absolute or start with "~/" (the player\'s home)'],
    ["~", 'a start file path must be absolute or start with "~/" (the player\'s home)'],
    ["~admin/a", 'a start file path must be absolute or start with "~/" (the player\'s home)'],
    ["/", "a start file path must name a file or directory below the root or the home"],
    ["~/", "a start file path must name a file or directory below the root or the home"],
    ["~/a//b", 'a start file path must not contain empty components, "." or ".."'],
    ["~/a/./b", 'a start file path must not contain empty components, "." or ".."'],
    ["/etc/../a", 'a start file path must not contain empty components, "." or ".."'],
    ["~/a//", 'a start file path must not contain empty components, "." or ".."'],
  ])("the start file path %j is invalid", (path, message) => {
    expect(problems(level({ start: { files: { [path]: "x" } } }))).toEqual([
      { path: ["start", "files", path], message },
    ]);
  });

  test("a path is not both a file and a directory", () => {
    expect(problems(level({ start: { files: { "~/a": "x", "~/a/": {} } } }))).toEqual([
      { path: ["start", "files", "~/a/"], message: '"~/a" is both a file and a directory' },
    ]);
  });

  test("nothing lies inside a file", () => {
    expect(problems(level({ start: { files: { "~/a": "x", "~/a/b.txt": "y" } } }))).toEqual([
      { path: ["start", "files", "~/a/b.txt"], message: '"~/a/b.txt" lies inside the file "~/a"' },
    ]);
  });

  test("files inside directories and paths that only share a prefix are fine", () => {
    expect(startFiles({ "~/a/": {}, "~/a/b.txt": "x", "~/ab": "y" })).toHaveLength(3);
  });

  test("owner, group and mode are checked", () => {
    expect(
      problems(level({ start: { files: { "~/a": { content: "", owner: "two words" } } } })),
    ).toEqual([
      {
        path: ["start", "files", "~/a", "owner"],
        message: "a user or group name must not be empty or contain spaces, colons or slashes",
      },
    ]);
    expect(problems(level({ start: { files: { "~/a": { content: "", mode: "0640" } } } }))).toEqual(
      [
        {
          path: ["start", "files", "~/a", "mode"],
          message: 'a mode is written like ls -l shows it, for example "rw-r-----"',
        },
      ],
    );
    expect(
      problems(level({ start: { files: { "~/a": { content: "", user: "root" } } } }))[0]?.path,
    ).toEqual(["start", "files", "~/a"]);
  });

  test("a file is a string or an object", () => {
    expect(problems(level({ start: { files: { "~/a": 42 } } }))[0]?.path).toEqual([
      "start",
      "files",
      "~/a",
    ]);
  });
});

describe("parseMode", () => {
  test.each([
    ["---------", 0],
    ["rw-r--r--", 0o644],
    ["rwxr-xr-x", 0o755],
    ["rw-r-----", 0o640],
    ["rwsr-xr-x", 0o4755],
    ["rwSr--r--", 0o4644],
    ["rwxr-s---", 0o2750],
    ["rw-r-S---", 0o2640],
    ["rwxrwxrwt", 0o1777],
    ["rwxrwxrwT", 0o1776],
    ["rwsrwsrwt", 0o7777],
  ])("%s is %o", (mode, bits) => {
    expect(parseMode(mode)).toBe(bits);
  });
});
