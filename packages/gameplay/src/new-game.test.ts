import { describe, expect, test } from "vitest";

import {
  checkPlayerName,
  GAME_MODES,
  GAME_START_TIME,
  normalizePlayerName,
  PLAYER_NAME_MAX_LENGTH,
  type PlayerNameProblem,
  startingLevelId,
} from "./new-game";

describe("GAME_MODES", () => {
  test("are Story and Sandbox (ADR 0017)", () => {
    expect(GAME_MODES).toEqual(["story", "sandbox"]);
  });
});

describe("normalizePlayerName", () => {
  test.each([
    ["Jörg Müller", "Jörg Müller"],
    ["  Anna   Lena  ", "Anna Lena"],
    ["Anna\tLena\n", "Anna Lena"],
    [" Zoë ", "Zoë"],
    ["", ""],
    ["   ", ""],
  ])("turns %j into %j", (name, normalized) => {
    expect(normalizePlayerName(name)).toBe(normalized);
  });

  test("composes a decomposed umlaut", () => {
    expect(normalizePlayerName("Jörg")).toBe("Jörg");
  });
});

describe("checkPlayerName", () => {
  test.each<[string, PlayerNameProblem | undefined]>([
    ["Jörg Müller", undefined],
    ["李", undefined],
    ["", "empty"],
    ["  \t ", "empty"],
    ["a".repeat(PLAYER_NAME_MAX_LENGTH), undefined],
    ["a".repeat(PLAYER_NAME_MAX_LENGTH + 1), "too-long"],
    [`  ${"a".repeat(PLAYER_NAME_MAX_LENGTH)}  `, undefined],
  ])("finds %j to have the problem %j", (name, problem) => {
    expect(checkPlayerName(name)).toBe(problem);
  });

  test("counts characters, not UTF-16 code units", () => {
    // Each of these characters takes two UTF-16 code units.
    expect(checkPlayerName("𝔄".repeat(PLAYER_NAME_MAX_LENGTH))).toBeUndefined();
    expect(checkPlayerName("𝔄".repeat(PLAYER_NAME_MAX_LENGTH + 1))).toBe("too-long");
  });

  test("counts a decomposed umlaut as one character", () => {
    expect(checkPlayerName("ö".repeat(PLAYER_NAME_MAX_LENGTH))).toBeUndefined();
  });
});

describe("GAME_START_TIME", () => {
  test("is Monday, 2026-01-05, 08:00 UTC", () => {
    const start = new Date(GAME_START_TIME);
    expect(start.toISOString()).toBe("2026-01-05T08:00:00.000Z");
    expect(start.getUTCDay()).toBe(1);
  });
});

describe("startingLevelId", () => {
  test("is the first level of the first chapter", () => {
    const chapters = [
      { id: "one", levels: ["a", "b"] },
      { id: "two", levels: ["c"] },
    ];
    expect(startingLevelId({ chapters })).toBe("a");
  });

  test("throws for content without a chapter", () => {
    expect(() => startingLevelId({ chapters: [] })).toThrow(/no chapter with a level/u);
  });
});
