import { describe, expect, test } from "vitest";

import { isValidEntryName, isValidMode, MAX_MODE } from "./fs-node";

describe("isValidEntryName", () => {
  test.each(["notes.txt", ".bashrc", "...", "a b", "Ärger.txt", "-rf", "\\"])(
    "accepts %j",
    (name) => {
      expect(isValidEntryName(name)).toBe(true);
    },
  );

  test.each(["", ".", "..", "a/b", "/", "a\0b"])("rejects %j", (name) => {
    expect(isValidEntryName(name)).toBe(false);
  });
});

describe("isValidMode", () => {
  test.each([0, 0o644, 0o755, 0o1777, MAX_MODE])("accepts %o", (mode) => {
    expect(isValidMode(mode)).toBe(true);
  });

  test.each([-1, MAX_MODE + 1, 0o100644, 1.5, Number.NaN])("rejects %d", (mode) => {
    expect(isValidMode(mode)).toBe(false);
  });

  test("MAX_MODE includes setuid, setgid and sticky", () => {
    expect(MAX_MODE).toBe(0o7777);
  });
});
