import { type BaseWorld, baseWorldSchema } from "@penguin-ops/content";
import { describe, expect, test } from "vitest";

import { isValidPlayerName } from "./level-world";
import {
  checkUserName,
  deriveUserName,
  reservedUserNames,
  USER_NAME_MAX_LENGTH,
  type UserNameProblem,
} from "./user-name";

describe("deriveUserName", () => {
  test.each([
    ["Jörg", "joerg"],
    ["Jörg Müller", "joerg-mueller"],
    ["ÄÖÜ", "aeoeue"],
    ["Strauß", "strauss"],
    ["STRAUẞ", "strauss"],
    ["Zoë", "zoe"],
    ["José Ángel", "jose-angel"],
    ["François", "francois"],
    ["Søren Kierkegaard", "soren-kierkegaard"],
    ["Łukasz", "lukasz"],
    ["Ægir", "aegir"],
    ["O'Brien", "obrien"],
    ["D’Angelo", "dangelo"],
    ["Anna-Lena", "anna-lena"],
    ["  Anna   Lena  ", "anna-lena"],
    ["Anna_Lena.Weber", "anna-lena-weber"],
    ["R2D2", "r2d2"],
    ["007 Bond", "bond"],
    ["-x-", "x"],
    ["Max!!!", "max"],
  ])("derives %j as %j", (playerName, userName) => {
    expect(deriveUserName(playerName)).toBe(userName);
  });

  test("treats a decomposed umlaut like a composed one", () => {
    expect(deriveUserName("Jörg")).toBe("joerg");
  });

  test.each(["", "   ", "李", "Владимир", "123", "!!!", "🐧"])(
    "derives an empty name from %j, which has no Latin letter",
    (playerName) => {
      expect(deriveUserName(playerName)).toBe("");
    },
  );

  test("cuts a long name to the maximum length", () => {
    const userName = deriveUserName("a".repeat(40));
    expect(userName).toBe("a".repeat(USER_NAME_MAX_LENGTH));
  });

  test("leaves no hyphen at the end when the cut falls on a hyphen", () => {
    const playerName = `${"a".repeat(USER_NAME_MAX_LENGTH - 1)} Weber`;
    expect(deriveUserName(playerName)).toBe("a".repeat(USER_NAME_MAX_LENGTH - 1));
  });

  test.each(["Jörg Müller", "Zoë", "007 Bond", "O'Brien", "a".repeat(40), "Ægir Ørsted"])(
    "derives a valid user name from %j",
    (playerName) => {
      expect(checkUserName(deriveUserName(playerName))).toBeUndefined();
    },
  );

  test("does not avoid reserved names", () => {
    expect(deriveUserName("Root")).toBe("root");
  });
});

describe("checkUserName", () => {
  test.each([
    "a",
    "alice",
    "joerg-mueller",
    "r2d2",
    "a-",
    "a--b",
    "a".repeat(USER_NAME_MAX_LENGTH),
  ])("accepts %j", (name) => {
    expect(checkUserName(name)).toBeUndefined();
  });

  test.each<[string, UserNameProblem]>([
    ["", "empty"],
    ["a".repeat(USER_NAME_MAX_LENGTH + 1), "too-long"],
    ["Alice", "uppercase"],
    ["aLICE", "uppercase"],
    ["jörg", "invalid-character"],
    ["anna lena", "invalid-character"],
    ["anna_lena", "invalid-character"],
    ["anna.lena", "invalid-character"],
    [" alice", "invalid-character"],
    ["1alice", "invalid-start"],
    ["-alice", "invalid-start"],
  ])("rejects %j as %j", (name, problem) => {
    expect(checkUserName(name)).toBe(problem);
  });

  test("reports the first problem in the order of the checks", () => {
    expect(checkUserName(`1A${"ö".repeat(USER_NAME_MAX_LENGTH)}`)).toBe("too-long");
    expect(checkUserName("1Ab")).toBe("uppercase");
    expect(checkUserName("1ö")).toBe("invalid-character");
  });

  test("rejects a reserved name only when it is in the reserved set", () => {
    const reserved = new Set(["root", "anna"]);
    expect(checkUserName("root", reserved)).toBe("reserved");
    expect(checkUserName("anna", reserved)).toBe("reserved");
    expect(checkUserName("anna2", reserved)).toBeUndefined();
    expect(checkUserName("root")).toBeUndefined();
  });

  test("agrees with isValidPlayerName, which the level world uses", () => {
    for (const name of ["alice", "", "Alice", "1a", "a b", "a".repeat(33), "joerg-2"]) {
      expect(isValidPlayerName(name)).toBe(checkUserName(name) === undefined);
    }
  });
});

describe("reservedUserNames", () => {
  const world = (id: string, hosts: unknown[]): BaseWorld =>
    baseWorldSchema.parse({ format: 1, id, hosts });

  test("holds every user and group of every host of every world", () => {
    const office = world("office", [
      {
        name: "desk",
        groups: [
          { name: "root", gid: 0 },
          { name: "helpdesk", gid: 2000 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "bernd", uid: 1001, group: "helpdesk" },
        ],
        files: {},
      },
      {
        name: "server",
        groups: [
          { name: "root", gid: 0 },
          { name: "backupops", gid: 3000 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "svc-backup", uid: 3000, group: "backupops" },
        ],
        files: {},
      },
    ]);
    const lab = world("lab", [
      {
        name: "lab",
        groups: [
          { name: "root", gid: 0 },
          { name: "lab", gid: 4000 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "gerda", uid: 4000, group: "lab" },
        ],
        files: {},
      },
    ]);
    const reserved = reservedUserNames([office, lab]);
    for (const name of ["root", "helpdesk", "bernd", "backupops", "svc-backup", "lab", "gerda"]) {
      expect(reserved.has(name)).toBe(true);
    }
    expect(reserved.has("anna")).toBe(false);
  });

  test("reserves Debian's base-passwd accounts without any world @differential", () => {
    const reserved = reservedUserNames([]);
    for (const name of ["root", "daemon", "bin", "sys", "www-data", "nobody", "sudo", "users"]) {
      expect(checkUserName(name, reserved)).toBe("reserved");
    }
  });
});
