import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import { expandPathname, type PatternChar } from "./glob";
import { createSession } from "./session";
import { buildWorld } from "./world-builder";
import { findHost } from "./world";

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [{ name: "root", gid: 0 }],
        users: [{ name: "root", uid: 0 }],
        files: {
          "/files/a": "",
          "/files/b": "",
          "/files/c": "",
          "/files/-": "",
          "/files/]": "",
          "/files/!": "",
          "/files/^": "",
          "/files/x1": "",
          "/files/x_": "",
          "/files/xA": "",
          "/files/é": "",
          "/files/ab": "",
          "/files/abc": "",
          "/files/aXbXc": "",
        },
      },
    ],
  },
  createGameClock(0),
);

const root = findHost(world, "ws01")?.root;
const session = createSession(world, "ws01", "root");

/** Turns `pattern` into pattern characters; characters between `«` and `»` are quoted. */
function chars(pattern: string): readonly PatternChar[] {
  const result: PatternChar[] = [];
  let quoted = false;
  for (const c of Array.from(pattern)) {
    if (c === "«" || c === "»") {
      quoted = c === "«";
    } else {
      result.push({ c, quoted });
    }
  }
  return result;
}

function glob(pattern: string): readonly string[] {
  if (root === undefined) {
    throw new Error("no host ws01");
  }
  return expandPathname(chars(`/files/${pattern}`), root, session.credentials, "/").map((path) =>
    path.slice("/files/".length),
  );
}

describe("expandPathname", () => {
  test("gives nothing for a word without a pattern", () => {
    expect(glob("a")).toEqual([]);
  });

  test("negates a bracket expression with ! or ^", () => {
    expect(glob("[!a-b]")).toEqual(["!", "-", "]", "^", "c", "é"]);
    expect(glob("[^a-b]")).toEqual(glob("[!a-b]"));
  });

  test("treats ] right after [ or [! as a member", () => {
    expect(glob("[]a]")).toEqual(["]", "a"]);
    expect(glob("[!]a]")).toEqual(["!", "-", "^", "b", "c", "é"]);
  });

  test("treats - at the start or end and a quoted - as a member", () => {
    expect(glob("[-a]")).toEqual(["-", "a"]);
    expect(glob("[a-]")).toEqual(["-", "a"]);
    expect(glob("[a«-»c]")).toEqual(["-", "a", "c"]);
  });

  test("treats a quoted ! as a member", () => {
    expect(glob("[«!»a]")).toEqual(["!", "a"]);
  });

  test("matches no character with a reversed range", () => {
    expect(glob("[c-a]")).toEqual([]);
  });

  test("compares ranges by code point like globasciiranges", () => {
    expect(glob("x[A-Z]")).toEqual(["xA"]);
    expect(glob("x[a-z]")).toEqual([]);
  });

  test("supports character classes, equivalence classes and collating symbols", () => {
    expect(glob("x[[:digit:]]")).toEqual(["x1"]);
    expect(glob("x[[:punct:]]")).toEqual(["x_"]);
    expect(glob("x[[:alnum:]]")).toEqual(["x1", "xA"]);
    expect(glob("[[:alpha:]]")).toEqual(["a", "b", "c", "é"]);
    expect(glob("[[=b=][.c.]]")).toEqual(["b", "c"]);
    expect(glob("[![:ascii:]]")).toEqual(["é"]);
  });

  test("supports every POSIX character class", () => {
    expect(glob("x[[:upper:]]")).toEqual(["xA"]);
    expect(glob("x[[:lower:][:blank:][:space:][:cntrl:]]")).toEqual([]);
    expect(glob("x[[:word:]]")).toEqual(["x_", "x1", "xA"]);
    expect(glob("x[[:xdigit:]]")).toEqual(["x1", "xA"]);
    expect(glob("x[[:graph:]]")).toEqual(glob("x[[:print:]]"));
    expect(glob("x[[:graph:]]")).toEqual(["x_", "x1", "xA"]);
  });

  test("matches nothing with an unknown character class", () => {
    expect(glob("[[:vowel:]]")).toEqual([]);
  });

  test("treats [: without :] as ordinary members", () => {
    expect(glob("[[:a]")).toEqual(["a"]);
  });

  test("lets * match any number of characters and backtracks", () => {
    expect(glob("a*c")).toEqual(["abc", "aXbXc"]);
    expect(glob("a*b*")).toEqual(["ab", "abc", "aXbXc"]);
    expect(glob("**c")).toEqual(["abc", "aXbXc", "c"]);
  });

  test("lets ? match one character, also outside ASCII", () => {
    expect(glob("?")).toEqual(["!", "-", "]", "^", "a", "b", "c", "é"]);
  });

  test("does not use a quoted pattern character as a pattern", () => {
    expect(glob("«*»")).toEqual([]);
    expect(glob("a«*»")).toEqual([]);
  });
});
