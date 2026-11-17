import { describe, expect, test } from "vitest";

import {
  type OptionError,
  optionErrorMessage,
  type OptionSpec,
  parseOptions,
  tryHelpMessage,
  validateOptionSpecs,
} from "./options";

/** A part of the option table of GNU `ls` and `head`, in the order of their `long_options`. */
const specs: readonly OptionSpec[] = [
  { id: "all", short: "a", long: "all", argument: "none" },
  { id: "almost-all", short: "A", long: "almost-all", argument: "none" },
  { id: "long", short: "l", argument: "none" },
  { id: "one-per-line", short: "1", argument: "none" },
  { id: "color", long: "color", argument: "optional" },
  { id: "color", long: "colour", argument: "optional" },
  { id: "context", short: "Z", long: "context", argument: "none" },
  { id: "lines", short: "n", long: "lines", argument: "required" },
  { id: "format", long: "format", argument: "required" },
  { id: "time-style", short: "T", long: "time-style", argument: "optional" },
  { id: "verbose", short: "v", long: "verbose", argument: "none" },
  { id: "version", long: "version", argument: "none" },
];

function parsed(args: readonly string[], order: "permute" | "require-order" = "permute") {
  const result = parseOptions(args, specs, order);
  if (!result.ok) {
    throw new Error(`expected options, got ${JSON.stringify(result.error)}`);
  }
  return result;
}

function failure(args: readonly string[]): OptionError {
  const result = parseOptions(args, specs);
  if (result.ok) {
    throw new Error("expected an error");
  }
  return result.error;
}

describe("parseOptions", () => {
  test("returns no options and no operands for no arguments", () => {
    expect(parsed([])).toEqual({ ok: true, options: [], operands: [] });
  });

  test("returns short and long options in the order written", () => {
    expect(parsed(["-l", "--all", "-a"]).options).toEqual([
      { id: "long", name: "-l", argument: undefined },
      { id: "all", name: "--all", argument: undefined },
      { id: "all", name: "-a", argument: undefined },
    ]);
  });

  test("splits a cluster of short options", () => {
    expect(parsed(["-la1"]).options.map((option) => option.name)).toEqual(["-l", "-a", "-1"]);
  });

  test("keeps operands between options in their order (permute)", () => {
    const result = parsed(["docs", "-l", "notes.txt", "-a"]);
    expect(result.options.map((option) => option.id)).toEqual(["long", "all"]);
    expect(result.operands).toEqual(["docs", "notes.txt"]);
  });

  test("stops at the first operand with require-order", () => {
    const result = parsed(["-l", "docs", "-a", "--", "x"], "require-order");
    expect(result.options.map((option) => option.id)).toEqual(["long"]);
    expect(result.operands).toEqual(["docs", "-a", "--", "x"]);
  });

  test("ends the options at --, which is not an operand", () => {
    const result = parsed(["a", "--", "-l", "--all", "--", "-"]);
    expect(result.options).toEqual([]);
    expect(result.operands).toEqual(["a", "-l", "--all", "--", "-"]);
  });

  test("ends the options at -- also with require-order", () => {
    const result = parsed(["-a", "--", "-l"], "require-order");
    expect(result.options.map((option) => option.id)).toEqual(["all"]);
    expect(result.operands).toEqual(["-l"]);
  });

  test("treats - alone as an operand and keeps parsing after it", () => {
    const result = parsed(["-", "-l"]);
    expect(result.options.map((option) => option.id)).toEqual(["long"]);
    expect(result.operands).toEqual(["-"]);
  });

  test("treats an empty argument as an operand", () => {
    expect(parsed(["", "-a"]).operands).toEqual([""]);
  });

  describe("required arguments", () => {
    test("takes the rest of a cluster", () => {
      expect(parsed(["-n5"]).options).toEqual([{ id: "lines", name: "-n", argument: "5" }]);
    });

    test("takes the rest of a cluster after other options", () => {
      expect(parsed(["-an5a"]).options).toEqual([
        { id: "all", name: "-a", argument: undefined },
        { id: "lines", name: "-n", argument: "5a" },
      ]);
    });

    test("takes the next argument when the cluster ends", () => {
      const result = parsed(["-n", "5", "file"]);
      expect(result.options).toEqual([{ id: "lines", name: "-n", argument: "5" }]);
      expect(result.operands).toEqual(["file"]);
    });

    test("takes the next argument even if it starts with a dash", () => {
      expect(parsed(["-n", "-5"]).options).toEqual([{ id: "lines", name: "-n", argument: "-5" }]);
      expect(parsed(["-n", "--"]).options).toEqual([{ id: "lines", name: "-n", argument: "--" }]);
    });

    test("takes the text after = of a long option, also when empty", () => {
      expect(parsed(["--lines=5"]).options).toEqual([
        { id: "lines", name: "--lines", argument: "5" },
      ]);
      expect(parsed(["--lines="]).options).toEqual([
        { id: "lines", name: "--lines", argument: "" },
      ]);
      expect(parsed(["--lines=a=b"]).options).toEqual([
        { id: "lines", name: "--lines", argument: "a=b" },
      ]);
    });

    test("takes the next argument after a long option", () => {
      const result = parsed(["--lines", "-3", "file"]);
      expect(result.options).toEqual([{ id: "lines", name: "--lines", argument: "-3" }]);
      expect(result.operands).toEqual(["file"]);
    });
  });

  describe("optional arguments", () => {
    test("takes an attached argument of a short option", () => {
      expect(parsed(["-Tiso"]).options).toEqual([
        { id: "time-style", name: "-T", argument: "iso" },
      ]);
    });

    test("never takes the next argument", () => {
      const short = parsed(["-T", "iso"]);
      expect(short.options).toEqual([{ id: "time-style", name: "-T", argument: undefined }]);
      expect(short.operands).toEqual(["iso"]);
      const long = parsed(["--color", "always"]);
      expect(long.options).toEqual([{ id: "color", name: "--color", argument: undefined }]);
      expect(long.operands).toEqual(["always"]);
    });

    test("takes the text after = of a long option", () => {
      expect(parsed(["--color=always"]).options).toEqual([
        { id: "color", name: "--color", argument: "always" },
      ]);
    });
  });

  describe("abbreviated long options", () => {
    test("accept an unambiguous abbreviation and return the full name", () => {
      expect(parsed(["--alm"]).options).toEqual([
        { id: "almost-all", name: "--almost-all", argument: undefined },
      ]);
      expect(parsed(["--li=7"]).options).toEqual([{ id: "lines", name: "--lines", argument: "7" }]);
    });

    test("prefer an exact name over longer names it abbreviates", () => {
      expect(parsed(["--color"]).options).toEqual([
        { id: "color", name: "--color", argument: undefined },
      ]);
    });

    test("are not ambiguous when all matches are the same option", () => {
      expect(parsed(["--colo=never"]).options).toEqual([
        { id: "color", name: "--color", argument: "never" },
      ]);
    });

    test("@differential are ambiguous when matches differ, listing them in declaration order", () => {
      expect(failure(["--al"])).toEqual({
        kind: "ambiguous-option",
        arg: "--al",
        possibilities: ["all", "almost-all"],
      });
      expect(failure(["--c=x"])).toEqual({
        kind: "ambiguous-option",
        arg: "--c=x",
        possibilities: ["color", "context"],
      });
    });

    test("are ambiguous when matches differ only in the argument kind", () => {
      const result = parseOptions(
        ["--ver"],
        [
          { id: "verbose", long: "verbose", argument: "none" },
          { id: "verbose", long: "verbosity", argument: "required" },
        ],
      );
      expect(result).toEqual({
        ok: false,
        error: { kind: "ambiguous-option", arg: "--ver", possibilities: ["verbose", "verbosity"] },
        options: [],
      });
    });

    test("@differential list later matches that equal another later one but differ from the first", () => {
      const result = parseOptions(
        ["--co"],
        [
          { id: "color", long: "color", argument: "optional" },
          { id: "context", long: "context", argument: "none" },
          { id: "context", long: "context-all", argument: "none" },
          { id: "color", long: "colour", argument: "optional" },
        ],
      );
      expect(result).toEqual({
        ok: false,
        error: {
          kind: "ambiguous-option",
          arg: "--co",
          possibilities: ["color", "context", "context-all"],
        },
        options: [],
      });
    });
  });

  describe("errors", () => {
    test("report an unknown short option", () => {
      expect(failure(["-x"])).toEqual({ kind: "invalid-option", option: "x" });
    });

    test("report the first unknown option of a cluster", () => {
      expect(failure(["-laxy"])).toEqual({ kind: "invalid-option", option: "x" });
    });

    test("report a dash inside a cluster as an unknown option", () => {
      expect(failure(["-a-"])).toEqual({ kind: "invalid-option", option: "-" });
    });

    test("@differential reports a non-ASCII character as one option, where glibc reports its first byte", () => {
      expect(failure(["-ä"])).toEqual({ kind: "invalid-option", option: "ä" });
    });

    test("report the first error and ignore later arguments", () => {
      expect(failure(["--nope", "-x"])).toEqual({ kind: "unrecognized-option", arg: "--nope" });
    });

    test("@differential report an unknown long option with its argument as written", () => {
      expect(failure(["--nope=1"])).toEqual({ kind: "unrecognized-option", arg: "--nope=1" });
      expect(failure(["---all"])).toEqual({ kind: "unrecognized-option", arg: "---all" });
    });

    test("report a missing argument of a short option", () => {
      expect(failure(["-a", "-n"])).toEqual({ kind: "missing-argument", name: "-n" });
    });

    test("report a missing argument of a long option by its full name", () => {
      expect(failure(["--li"])).toEqual({ kind: "missing-argument", name: "--lines" });
    });

    test("report an argument for a long option without one by its full name", () => {
      expect(failure(["--alm=yes"])).toEqual({
        kind: "unexpected-argument",
        name: "--almost-all",
      });
      expect(failure(["--all="])).toEqual({ kind: "unexpected-argument", name: "--all" });
    });

    test("report options after operands (permute)", () => {
      expect(failure(["file", "-x"])).toEqual({ kind: "invalid-option", option: "x" });
    });

    test("keep the options before the error, also from the same cluster", () => {
      const result = parseOptions(["-l", "file", "--all", "-1ax"], specs);
      expect(result).toEqual({
        ok: false,
        error: { kind: "invalid-option", option: "x" },
        options: [
          { id: "long", name: "-l", argument: undefined },
          { id: "all", name: "--all", argument: undefined },
          { id: "one-per-line", name: "-1", argument: undefined },
          { id: "all", name: "-a", argument: undefined },
        ],
      });
    });

    test("keep the options before a missing argument at the end of a cluster", () => {
      const result = parseOptions(["-an"], specs);
      expect(result).toEqual({
        ok: false,
        error: { kind: "missing-argument", name: "-n" },
        options: [{ id: "all", name: "-a", argument: undefined }],
      });
    });

    test("keep no options when the first argument fails", () => {
      const result = parseOptions(["--nope", "-a"], specs);
      expect(result).toEqual({
        ok: false,
        error: { kind: "unrecognized-option", arg: "--nope" },
        options: [],
      });
    });

    test("report nothing for options after -- or after an operand with require-order", () => {
      expect(parseOptions(["--", "-x"], specs).ok).toBe(true);
      expect(parseOptions(["file", "-x"], specs, "require-order").ok).toBe(true);
    });
  });

  describe("invalid specs", () => {
    test.each<[string, readonly OptionSpec[]]>([
      ["neither name", [{ id: "a", argument: "none" }]],
      ["two characters", [{ id: "a", short: "ab", argument: "none" }]],
      ["empty short name", [{ id: "a", short: "", argument: "none" }]],
      ["dash as short name", [{ id: "a", short: "-", argument: "none" }]],
      ["empty long name", [{ id: "a", long: "", argument: "none" }]],
      ["= in a long name", [{ id: "a", long: "a=b", argument: "none" }]],
      [
        "short name twice",
        [
          { id: "a", short: "a", argument: "none" },
          { id: "b", short: "a", argument: "none" },
        ],
      ],
      [
        "long name twice",
        [
          { id: "a", long: "all", argument: "none" },
          { id: "b", long: "all", argument: "none" },
        ],
      ],
    ])("throw for %s", (_, invalid) => {
      expect(() => parseOptions([], invalid)).toThrow(Error);
      expect(() => {
        validateOptionSpecs(invalid);
      }).toThrow(Error);
    });

    test("accept a valid table", () => {
      expect(() => {
        validateOptionSpecs(specs);
      }).not.toThrow();
    });

    test("accept a non-ASCII character as a short name", () => {
      expect(parseOptions(["-ä"], [{ id: "a", short: "ä", argument: "none" }]).ok).toBe(true);
    });
  });
});

describe("optionErrorMessage", () => {
  test.each<[OptionError, string]>([
    [{ kind: "invalid-option", option: "x" }, "ls: invalid option -- 'x'\n"],
    [{ kind: "unrecognized-option", arg: "--nope=1" }, "ls: unrecognized option '--nope=1'\n"],
    [
      { kind: "ambiguous-option", arg: "--a", possibilities: ["all", "almost-all"] },
      "ls: option '--a' is ambiguous; possibilities: '--all' '--almost-all'\n",
    ],
    [{ kind: "missing-argument", name: "-n" }, "ls: option requires an argument -- 'n'\n"],
    [{ kind: "missing-argument", name: "--lines" }, "ls: option '--lines' requires an argument\n"],
    [
      { kind: "unexpected-argument", name: "--all" },
      "ls: option '--all' doesn't allow an argument\n",
    ],
  ])("writes glibc's message for %j", (error, message) => {
    expect(optionErrorMessage("ls", error)).toBe(message);
  });
});

describe("tryHelpMessage", () => {
  test("writes the coreutils hint with the command name", () => {
    expect(tryHelpMessage("head")).toBe("Try 'head --help' for more information.\n");
  });
});
