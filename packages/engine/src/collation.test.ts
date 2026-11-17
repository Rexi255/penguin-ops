import { describe, expect, test } from "vitest";

import { compareNames } from "./collation";

function sorted(names: readonly string[]): readonly string[] {
  return [...names].sort(compareNames);
}

describe("compareNames", () => {
  test("@differential sorts a home directory like ls -a on Debian in en_US.UTF-8", () => {
    expect(
      sorted([
        "Documents",
        ".profile",
        "snap",
        ".bashrc",
        "Desktop",
        ".cache",
        ".bash_logout",
        "Music",
        ".bash_history",
        ".local",
      ]),
    ).toEqual([
      ".bash_history",
      ".bash_logout",
      ".bashrc",
      ".cache",
      "Desktop",
      "Documents",
      ".local",
      "Music",
      ".profile",
      "snap",
    ]);
  });

  test("ignores case on the first level", () => {
    expect(sorted(["c", "B", "a"])).toEqual(["a", "B", "c"]);
  });

  test("puts digits before letters", () => {
    expect(sorted(["b", "2", "a", "10"])).toEqual(["10", "2", "a", "b"]);
  });

  test("puts the lower-case letter first when only the case differs", () => {
    expect(sorted(["A", "a", "Ab", "ab", "aB"])).toEqual(["a", "A", "ab", "aB", "Ab"]);
  });

  test("ignores accents first and puts the letter without accent first on a tie", () => {
    expect(sorted(["ä", "b", "a"])).toEqual(["a", "ä", "b"]);
    expect(sorted(["Äpfel", "Apfel", "apfel"])).toEqual(["apfel", "Apfel", "Äpfel"]);
  });

  test("@differential uses punctuation only when letters and digits are equal", () => {
    expect(sorted(["a_b", "ab", "a-b", "a.c"])).toEqual(["a-b", "a_b", "ab", "a.c"]);
  });

  test("sorts a name before its longer continuation", () => {
    expect(sorted(["notes.txt", "notes"])).toEqual(["notes", "notes.txt"]);
  });

  test("gives 0 only for equal names", () => {
    expect(compareNames("x.log", "x.log")).toBe(0);
    expect(compareNames("x.log", "x_log")).not.toBe(0);
    expect(compareNames("", "")).toBe(0);
    expect(compareNames("", "a")).toBeLessThan(0);
  });
});
