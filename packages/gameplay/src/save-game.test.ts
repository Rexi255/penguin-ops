import { describe, expect, test } from "vitest";

import { GAME_START_TIME, type NewGame } from "./new-game";
import {
  HINT_COUNT,
  migrateSave,
  newSaveGame,
  parseSave,
  SAVE_FORMAT_NAME,
  SAVE_FORMAT_VERSION,
  SAVE_MIGRATIONS,
  type SaveGame,
  type SaveMigration,
  type SaveParseResult,
  type SaveProblem,
  serializeSave,
} from "./save-game";

/** The stored example saves of every format version, by file name (`v1.json`, …). */
const FIXTURES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../save-fixtures/*.json", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ).map(([path, text]) => [path.replace("../save-fixtures/", ""), text]),
);

const GAME: NewGame = { playerName: "Zoë Müller", userName: "zoe", mode: "story" };

/** A real time in milliseconds: 2026-11-20, 10:00 UTC. */
const PLAYED_AT = 1_795_168_800_000;

/** A save with progress in several tickets. */
const SAVE: SaveGame = {
  ...GAME,
  gameTime: GAME_START_TIME + 7_380_000,
  playTime: 2_400_000,
  lastPlayed: PLAYED_AT,
  currentTicket: "project-folders",
  tickets: [
    { level: "first-steps", solved: true, hintsShown: HINT_COUNT, reachedExtraGoals: [] },
    {
      level: "project-folders",
      solved: false,
      checkpoint: "folders",
      hintsShown: 1,
      reachedExtraGoals: ["readme"],
    },
  ],
};

/** The save file of `SAVE` as a JSON object, to break one field at a time. */
function saveFile(): Record<string, unknown> {
  return JSON.parse(serializeSave(SAVE)) as Record<string, unknown>;
}

/** `saveFile()` with the first ticket's fields replaced by `fields`. */
function withFirstTicket(fields: Record<string, unknown>): Record<string, unknown> {
  const file = saveFile();
  const tickets = file["tickets"] as Record<string, unknown>[];
  return { ...file, tickets: [{ ...tickets[0], ...fields }, ...tickets.slice(1)] };
}

/** The problem of parsing `value` as JSON; fails the test if it parses. */
function problemOf(value: unknown): SaveProblem {
  const result = parseSave(JSON.stringify(value));
  if (result.kind !== "problem") {
    throw new Error("the save parsed without a problem");
  }
  return result.problem;
}

function expectSave(result: SaveParseResult): SaveGame {
  if (result.kind !== "save") {
    throw new Error(`the save did not parse: ${JSON.stringify(result.problem)}`);
  }
  return result.save;
}

describe("newSaveGame", () => {
  test("starts at the game's start time with the first ticket opened", () => {
    expect(newSaveGame(GAME, "first-steps", PLAYED_AT)).toEqual({
      playerName: "Zoë Müller",
      userName: "zoe",
      mode: "story",
      gameTime: GAME_START_TIME,
      playTime: 0,
      lastPlayed: PLAYED_AT,
      currentTicket: "first-steps",
      tickets: [{ level: "first-steps", solved: false, hintsShown: 0, reachedExtraGoals: [] }],
    });
  });

  test("keeps the mode of a Sandbox game", () => {
    expect(newSaveGame({ ...GAME, mode: "sandbox" }, "disk-full", PLAYED_AT).mode).toBe("sandbox");
  });
});

describe("serializeSave", () => {
  test("writes the format name and the current version first", () => {
    expect(saveFile()).toMatchObject({ format: SAVE_FORMAT_NAME, version: SAVE_FORMAT_VERSION });
    expect(Object.keys(saveFile()).slice(0, 2)).toEqual(["format", "version"]);
  });

  test("writes JSON indented by two spaces with a final line break", () => {
    const text = serializeSave(SAVE);
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), undefined, 2)}\n`);
  });

  test("leaves out the checkpoint of a ticket without one", () => {
    const tickets = saveFile()["tickets"] as Record<string, unknown>[];
    expect(tickets[0]).not.toHaveProperty("checkpoint");
    expect(tickets[1]).toHaveProperty("checkpoint", "folders");
  });

  test("gives the same text for saves with fields in another order", () => {
    const reordered: SaveGame = {
      tickets: SAVE.tickets,
      currentTicket: SAVE.currentTicket,
      lastPlayed: SAVE.lastPlayed,
      playTime: SAVE.playTime,
      gameTime: SAVE.gameTime,
      mode: SAVE.mode,
      userName: SAVE.userName,
      playerName: SAVE.playerName,
    };
    expect(serializeSave(reordered)).toBe(serializeSave(SAVE));
  });
});

describe("parseSave", () => {
  test("reads back what serializeSave wrote", () => {
    const result = parseSave(serializeSave(SAVE));
    expect(result).toEqual({ kind: "save", save: SAVE, fileVersion: SAVE_FORMAT_VERSION });
  });

  test("reads back a new game", () => {
    const save = newSaveGame({ ...GAME, mode: "sandbox" }, "disk-full", PLAYED_AT);
    expect(expectSave(parseSave(serializeSave(save)))).toEqual(save);
  });

  test("accepts a file without its final line break", () => {
    expect(expectSave(parseSave(serializeSave(SAVE).trimEnd()))).toEqual(SAVE);
  });

  test.each(["", "{", "not a save", "{'format': 'penguin-ops-save'}"])(
    "reports %j as not JSON",
    (text) => {
      expect(parseSave(text)).toEqual({ kind: "problem", problem: { code: "not-json" } });
    },
  );

  test.each([
    ["null", null],
    ["a number", 1],
    ["a list", [saveFile()]],
    ["an object without a format", { version: 1 }],
    ["another format", { ...saveFile(), format: "penguin-ops-settings" }],
  ])("reports %s as not a save", (_name, value) => {
    expect(problemOf(value)).toEqual({ code: "not-a-save" });
  });

  test("reports a file of a newer version as too new", () => {
    expect(problemOf({ ...saveFile(), version: SAVE_FORMAT_VERSION + 1 })).toEqual({
      code: "too-new",
      version: SAVE_FORMAT_VERSION + 1,
    });
  });

  test.each([
    ["no version", undefined],
    ["version 0", 0],
    ["a negative version", -1],
    ["a fractional version", 1.5],
    ["a version as text", "1"],
  ])("reports %s as invalid", (_name, version) => {
    expect(problemOf({ ...saveFile(), version })).toEqual({
      code: "invalid",
      path: "version",
      message: "the version must be a whole number from 1",
    });
  });

  test.each<[string, Record<string, unknown>, string]>([
    ["an unknown field", { ...saveFile(), xp: 20 }, ""],
    ["a missing player name", { ...saveFile(), playerName: undefined }, "playerName"],
    ["an empty player name", { ...saveFile(), playerName: "  " }, "playerName"],
    ["a too long player name", { ...saveFile(), playerName: "a".repeat(41) }, "playerName"],
    ["a player name that is not normalized", { ...saveFile(), playerName: " Zoë" }, "playerName"],
    ["a user name with capitals", { ...saveFile(), userName: "Zoe" }, "userName"],
    ["an empty user name", { ...saveFile(), userName: "" }, "userName"],
    ["an unknown mode", { ...saveFile(), mode: "career" }, "mode"],
    ["a game time before the start", { ...saveFile(), gameTime: GAME_START_TIME - 1 }, "gameTime"],
    ["a fractional game time", { ...saveFile(), gameTime: GAME_START_TIME + 0.5 }, "gameTime"],
    ["a negative play time", { ...saveFile(), playTime: -1 }, "playTime"],
    ["a play time as text", { ...saveFile(), playTime: "40 min" }, "playTime"],
    [
      "a last played time beyond safe integers",
      { ...saveFile(), lastPlayed: 2 ** 53 },
      "lastPlayed",
    ],
    [
      "a current ticket that is not opened",
      { ...saveFile(), currentTicket: "disk-full" },
      "currentTicket",
    ],
    [
      "a current ticket that is no ID",
      { ...saveFile(), currentTicket: "Disk Full" },
      "currentTicket",
    ],
    ["no ticket list", { ...saveFile(), tickets: undefined }, "tickets"],
    ["no opened ticket", { ...saveFile(), tickets: [] }, "currentTicket"],
    ["a level ID that is no ID", withFirstTicket({ level: "first_steps" }), "tickets.0.level"],
    ["a solved state as text", withFirstTicket({ solved: "yes" }), "tickets.0.solved"],
    ["a checkpoint that is no ID", withFirstTicket({ checkpoint: "" }), "tickets.0.checkpoint"],
    ["negative hints", withFirstTicket({ hintsShown: -1 }), "tickets.0.hintsShown"],
    ["too many hints", withFirstTicket({ hintsShown: HINT_COUNT + 1 }), "tickets.0.hintsShown"],
    ["fractional hints", withFirstTicket({ hintsShown: 1.5 }), "tickets.0.hintsShown"],
    ["an unknown ticket field", withFirstTicket({ xp: 100 }), "tickets.0"],
    [
      "an extra goal reached twice",
      withFirstTicket({ reachedExtraGoals: ["careful", "careful"] }),
      "tickets.0.reachedExtraGoals.1",
    ],
  ])("reports %s as invalid at its path", (_name, value, path) => {
    expect(problemOf(value)).toMatchObject({ code: "invalid", path });
  });

  test("reports a ticket opened twice at its second entry", () => {
    const file = saveFile();
    const tickets = file["tickets"] as unknown[];
    expect(problemOf({ ...file, tickets: [...tickets, tickets[0]] })).toEqual({
      code: "invalid",
      path: "tickets.2.level",
      message: 'the ticket "first-steps" is listed twice',
    });
  });

  test("names the problem in English for logs", () => {
    expect(problemOf({ ...saveFile(), currentTicket: "disk-full" })).toEqual({
      code: "invalid",
      path: "currentTicket",
      message: 'the current ticket "disk-full" is not among the opened tickets',
    });
  });

  test("accepts a user name that only the content reserves", () => {
    // Reserved names depend on the content's worlds; the game checks them when it resumes.
    expect(expectSave(parseSave(serializeSave({ ...SAVE, userName: "root" }))).userName).toBe(
      "root",
    );
  });
});

describe("migrateSave", () => {
  const migrations: readonly SaveMigration[] = [
    { from: 2, migrate: (save) => ({ ...save, renamed: save["old"], old: undefined }) },
    { from: 1, migrate: (save) => ({ ...save, old: "from v1" }) },
  ];

  test("applies the migrations in version order and sets each new version", () => {
    expect(migrateSave({ format: SAVE_FORMAT_NAME, version: 1 }, 1, 3, migrations)).toEqual({
      format: SAVE_FORMAT_NAME,
      version: 3,
      old: undefined,
      renamed: "from v1",
    });
  });

  test("starts at the file's version", () => {
    expect(migrateSave({ version: 2, old: "kept" }, 2, 3, migrations)).toEqual({
      version: 3,
      old: undefined,
      renamed: "kept",
    });
  });

  test("leaves a file of the target version as it is", () => {
    const file = { version: 3 };
    expect(migrateSave(file, 3, 3, migrations)).toBe(file);
  });

  test("does not change the file it gets", () => {
    const file = { version: 1 };
    migrateSave(file, 1, 3, migrations);
    expect(file).toEqual({ version: 1 });
  });

  test("throws if a migration on the way is missing", () => {
    expect(() => migrateSave({ version: 1 }, 1, 4, migrations)).toThrow(
      "There is no save migration from version 3.",
    );
  });
});

describe("the save format's history (ADR 0013)", () => {
  test("has one migration for every version before the current one, in order", () => {
    expect(SAVE_MIGRATIONS.map((migration) => migration.from)).toEqual(
      Array.from({ length: SAVE_FORMAT_VERSION - 1 }, (_, index) => index + 1),
    );
  });

  test("has a stored example save of every version", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(
      Array.from({ length: SAVE_FORMAT_VERSION }, (_, index) => `v${String(index + 1)}.json`),
    );
  });

  test.each(Object.entries(FIXTURES))("reads the stored example save %s", (name, text) => {
    const result = parseSave(text);
    expect(result).toMatchObject({ kind: "save", fileVersion: Number(name.slice(1, -5)) });
  });

  test("writes the example save of the current version byte for byte as it is stored", () => {
    const text = FIXTURES[`v${String(SAVE_FORMAT_VERSION)}.json`] ?? "";
    expect(serializeSave(expectSave(parseSave(text)))).toBe(text);
  });
});
