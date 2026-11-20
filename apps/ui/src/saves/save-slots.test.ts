// Tests of the save slots as the game reads them (ADR 0105, ADR 0106): save or backup, locked
// slots, the repairs and the slot count.
import {
  GAME_START_TIME,
  newSaveGame,
  SAVE_FORMAT_NAME,
  type SaveGame,
  serializeSave,
} from "@penguin-ops/gameplay";
import { describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import type { SaveFilesApi, StoredFile, StoredSlot } from "../desktop-api";
import {
  EMPTY_SLOT,
  exportFileName,
  loadSlots,
  readImport,
  readSlot,
  SAVE_SLOT_COUNT,
  type SlotLock,
  type SlotReading,
  solvedTicketCount,
} from "./save-slots";

const content = loadBundledContent();
const NO_NAMES: ReadonlySet<string> = new Set();

const GAME: SaveGame = {
  ...newSaveGame({ playerName: "Ada", userName: "ada", mode: "story" }, "first-steps", 1000),
  gameTime: GAME_START_TIME + 60_000,
};
const OLDER: SaveGame = { ...GAME, playerName: "Ada Older" };

const MISSING: StoredFile = { kind: "missing" };
const UNREADABLE: StoredFile = { kind: "unreadable" };
const text = (value: string): StoredFile => ({ kind: "text", text: value });
const saved = (save: SaveGame): StoredFile => text(serializeSave(save));
const TOO_NEW = text(JSON.stringify({ format: SAVE_FORMAT_NAME, version: 999 }));
const BROKEN = text("{ not json");

const slot = (save: StoredFile, backup: StoredFile = MISSING): StoredSlot => ({ save, backup });
const read = (stored: StoredSlot, reserved = NO_NAMES) => readSlot(stored, content, reserved);
const game = (save: SaveGame, restoreBackup = false): SlotReading => ({
  state: { kind: "game", save },
  restoreBackup,
  rewrite: false,
});
const locked = (lock: SlotLock): SlotReading => ({
  state: { kind: "locked", lock },
  restoreBackup: false,
  rewrite: false,
});

describe("readSlot", () => {
  test("reads a slot without files as empty", () => {
    expect(read(slot(MISSING))).toEqual({
      state: EMPTY_SLOT,
      restoreBackup: false,
      rewrite: false,
    });
  });

  test("uses the save and leaves the backup alone", () => {
    expect(read(slot(saved(GAME), saved(OLDER)))).toEqual(game(GAME));
  });

  test.each([
    ["broken", BROKEN],
    ["not a save", text('{"format": "other"}')],
    ["invalid", text(serializeSave(GAME).replace('"ada"', '"Ada!"'))],
    ["unreadable", UNREADABLE],
    ["missing", MISSING],
  ])("restores the backup when the save is %s", (_name, file) => {
    expect(read(slot(file, saved(OLDER)))).toEqual(game(OLDER, true));
  });

  test("locks a slot whose save a newer game wrote, whatever the backup holds", () => {
    expect(read(slot(TOO_NEW, saved(OLDER)))).toEqual(locked("too-new"));
  });

  test("locks a slot whose readable file is the backup of a newer game", () => {
    expect(read(slot(BROKEN, TOO_NEW))).toEqual(locked("too-new"));
  });

  test.each([
    ["a broken save without backup", slot(BROKEN)],
    ["a broken save and backup", slot(BROKEN, UNREADABLE)],
    ["only a broken backup", slot(MISSING, BROKEN)],
  ])("locks %s as damaged", (_name, stored) => {
    expect(read(stored)).toEqual(locked("damaged"));
  });

  test("locks a game whose user name the content's worlds now hold", () => {
    expect(read(slot(saved(GAME)), new Set(["ada"]))).toEqual(locked("user-name-taken"));
  });

  test("fits the game to the content", () => {
    const withRemovedLevel: SaveGame = {
      ...GAME,
      tickets: [
        ...GAME.tickets,
        { level: "removed", solved: true, hintsShown: 0, reachedExtraGoals: [] },
      ],
    };
    expect(read(slot(saved(withRemovedLevel)))).toEqual(game(GAME));
  });
});

/** A fake of the desktop's save files with the stored slots `stored`. */
function fakeFiles(stored: readonly StoredSlot[]) {
  return {
    readSlots: vi.fn<SaveFilesApi["readSlots"]>(() => Promise.resolve(stored)),
    restoreBackup: vi.fn<SaveFilesApi["restoreBackup"]>(() => Promise.resolve()),
    writeSlot: vi.fn<SaveFilesApi["writeSlot"]>(() => Promise.resolve()),
  };
}

describe("loadSlots", () => {
  test("reads every slot and repairs nothing that is fine", async () => {
    const files = fakeFiles([slot(saved(GAME)), slot(MISSING), slot(BROKEN)]);
    const onError = vi.fn();
    const slots = await loadSlots(files, content, NO_NAMES, onError);
    expect(slots).toEqual([
      { kind: "game", save: GAME },
      EMPTY_SLOT,
      { kind: "locked", lock: "damaged" },
    ]);
    expect(files.restoreBackup).not.toHaveBeenCalled();
    expect(files.writeSlot).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test("restores the backup of a slot whose save cannot be read", async () => {
    const files = fakeFiles([slot(MISSING), slot(BROKEN, saved(OLDER)), slot(MISSING)]);
    const slots = await loadSlots(files, content, NO_NAMES, vi.fn());
    expect(slots[1]).toEqual({ kind: "game", save: OLDER });
    expect(files.restoreBackup).toHaveBeenCalledExactlyOnceWith(1);
  });

  test("writes a migrated game again in the current version", async () => {
    const files = fakeFiles([slot(MISSING), slot(MISSING), slot(saved(GAME))]);
    const migrated = (stored: StoredSlot): SlotReading =>
      stored.save.kind === "text" ? { ...game(GAME), rewrite: true } : read(stored);
    await loadSlots(files, content, NO_NAMES, vi.fn(), migrated);
    expect(files.writeSlot).toHaveBeenCalledExactlyOnceWith(2, serializeSave(GAME));
  });

  test("passes a failed repair on and still shows the game", async () => {
    const files = fakeFiles([slot(BROKEN, saved(OLDER)), slot(MISSING), slot(MISSING)]);
    files.restoreBackup.mockRejectedValue(new Error("disk full"));
    const onError = vi.fn();
    const slots = await loadSlots(files, content, NO_NAMES, onError);
    expect(slots[0]).toEqual({ kind: "game", save: OLDER });
    expect(onError).toHaveBeenCalledExactlyOnceWith(new Error("disk full"));
  });

  test("rejects when the desktop has another number of slots", async () => {
    const files = fakeFiles([slot(MISSING)]);
    await expect(loadSlots(files, content, NO_NAMES, vi.fn())).rejects.toThrow(
      `The desktop has 1 save slots, the game ${String(SAVE_SLOT_COUNT)}.`,
    );
  });
});

describe("solvedTicketCount", () => {
  test("counts the solved tickets", () => {
    expect(solvedTicketCount(GAME)).toBe(0);
    expect(
      solvedTicketCount({
        ...GAME,
        tickets: [
          { level: "first-steps", solved: true, hintsShown: 0, reachedExtraGoals: [] },
          { level: "printer-floor2", solved: false, hintsShown: 0, reachedExtraGoals: [] },
        ],
      }),
    ).toBe(1);
  });
});

describe("readImport", () => {
  const readFile = (file: StoredFile, reserved = NO_NAMES) => readImport(file, content, reserved);

  test("reads a save and fits it to the content", () => {
    expect(readFile(saved(GAME))).toEqual({ kind: "save", save: GAME });
  });

  test.each([
    ["unreadable", UNREADABLE, "unreadable"],
    ["missing", MISSING, "unreadable"],
    ["not JSON", BROKEN, "not-a-save"],
    ["another JSON file", text('{"name": "package"}'), "not-a-save"],
    ["invalid", text(serializeSave(GAME).replace('"ada"', '"Ada!"')), "damaged"],
    ["too new", TOO_NEW, "too-new"],
  ] as const)("refuses a file that is %s", (_name, file, problem) => {
    expect(readFile(file)).toEqual({ kind: "problem", problem });
  });

  test("refuses a game whose user name is taken", () => {
    expect(readFile(saved(GAME), new Set(["ada"]))).toEqual({
      kind: "problem",
      problem: "user-name-taken",
    });
  });
});

describe("exportFileName", () => {
  test("names the slot and the user name", () => {
    expect(exportFileName(0, GAME)).toBe("penguin-ops-slot-1-ada.json");
    expect(exportFileName(2, { ...GAME, userName: "joerg-mueller" })).toBe(
      "penguin-ops-slot-3-joerg-mueller.json",
    );
  });
});
