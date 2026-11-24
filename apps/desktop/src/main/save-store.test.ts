import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  checkSaveText,
  checkSlot,
  createSaveStore,
  MAX_SAVE_TEXT_LENGTH,
  SAVE_SLOT_COUNT,
  slotFileNames,
} from "./save-store";
import { NODE_FILE_SYSTEM, RENAME_ATTEMPTS, type StoreFileSystem } from "./stored-files";

let root: string;
let directory: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "penguin-ops-saves-"));
  directory = join(root, "saves");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const MISSING = { kind: "missing" } as const;
const text = (value: string) => ({ kind: "text", text: value }) as const;

/** A file system error with a Node.js error code. */
function fsError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/** Waits without a timer and records the waits. */
function recordingWait(waits: number[]): (milliseconds: number) => Promise<void> {
  return (milliseconds) => {
    waits.push(milliseconds);
    return Promise.resolve();
  };
}

describe("slotFileNames", () => {
  test("names the files of a slot by its number counting from 1", () => {
    expect(slotFileNames(0)).toEqual({ save: "slot-1.json", backup: "slot-1.backup.json" });
    expect(slotFileNames(2)).toEqual({ save: "slot-3.json", backup: "slot-3.backup.json" });
  });
});

describe("checkSlot", () => {
  test.each([0, 1, 2])("accepts the slot %d", (slot) => {
    expect(() => {
      checkSlot(slot);
    }).not.toThrow();
  });

  test.each([-1, SAVE_SLOT_COUNT, 1.5, Number.NaN, "1", undefined, null])("rejects %s", (slot) => {
    expect(() => {
      checkSlot(slot);
    }).toThrow(TypeError);
  });
});

describe("checkSaveText", () => {
  test("accepts a text up to the limit", () => {
    expect(() => {
      checkSaveText("x".repeat(MAX_SAVE_TEXT_LENGTH));
    }).not.toThrow();
  });

  test.each([
    ["a longer text", "x".repeat(MAX_SAVE_TEXT_LENGTH + 1)],
    ["a number", 1],
    ["an object", { text: "{}" }],
    ["undefined", undefined],
  ])("rejects %s", (_name, value) => {
    expect(() => {
      checkSaveText(value);
    }).toThrow(TypeError);
  });
});

describe("createSaveStore", () => {
  test("reads every slot as missing while the folder does not exist", async () => {
    const store = createSaveStore(directory);
    const slots = await store.readSlots();
    expect(slots).toHaveLength(SAVE_SLOT_COUNT);
    expect(slots).toEqual(
      Array.from({ length: SAVE_SLOT_COUNT }, () => ({ save: MISSING, backup: MISSING })),
    );
  });

  test("creates the folder with the first save and reads the save back", async () => {
    const store = createSaveStore(directory);
    await store.writeSlot(1, "first\n");
    expect(await readFile(join(directory, "slot-2.json"), "utf8")).toBe("first\n");
    expect(await store.readSlots()).toEqual([
      { save: MISSING, backup: MISSING },
      { save: text("first\n"), backup: MISSING },
      { save: MISSING, backup: MISSING },
    ]);
  });

  test("keeps the save it replaces as the backup and leaves no temporary file", async () => {
    const store = createSaveStore(directory);
    await store.writeSlot(0, "first");
    await store.writeSlot(0, "second");
    await store.writeSlot(0, "third");
    const [slot] = await store.readSlots();
    expect(slot).toEqual({ save: text("third"), backup: text("second") });
    expect((await readdir(directory)).sort()).toEqual(["slot-1.backup.json", "slot-1.json"]);
  });

  test("writes text with characters outside ASCII unchanged", async () => {
    const store = createSaveStore(directory);
    await store.writeSlot(0, '{"playerName": "Jörg Müller 🐧"}');
    const [slot] = await store.readSlots();
    expect(slot?.save).toEqual(text('{"playerName": "Jörg Müller 🐧"}'));
  });

  test("runs the saves of a slot one after the other in the order asked", async () => {
    const store = createSaveStore(directory);
    await Promise.all([
      store.writeSlot(0, "first"),
      store.writeSlot(0, "second"),
      store.writeSlot(0, "third"),
    ]);
    const [slot] = await store.readSlots();
    expect(slot).toEqual({ save: text("third"), backup: text("second") });
  });

  test("rejects a wrong slot or text before it touches a file", async () => {
    const store = createSaveStore(directory);
    expect(() => store.writeSlot(3, "x")).toThrow(TypeError);
    expect(() => store.writeSlot(0, "x".repeat(MAX_SAVE_TEXT_LENGTH + 1))).toThrow(TypeError);
    expect(() => store.restoreBackup(-1)).toThrow(TypeError);
    expect(() => store.deleteSlot(0.5)).toThrow(TypeError);
    await expect(readdir(root)).resolves.toEqual([]);
  });

  test("reads a folder or a too large file in a slot's place as unreadable", async () => {
    await mkdir(join(directory, "slot-1.json"), { recursive: true });
    await writeFile(join(directory, "slot-2.json"), "x".repeat(MAX_SAVE_TEXT_LENGTH + 1));
    await writeFile(join(directory, "slot-2.backup.json"), "é".repeat(MAX_SAVE_TEXT_LENGTH * 2));
    const [first, second] = await createSaveStore(directory).readSlots();
    expect(first).toEqual({ save: { kind: "unreadable" }, backup: MISSING });
    expect(second).toEqual({ save: { kind: "unreadable" }, backup: { kind: "unreadable" } });
  });

  test("reads a file that cannot be read for another reason as unreadable", async () => {
    const fileSystem: StoreFileSystem = {
      ...NODE_FILE_SYSTEM,
      readFile: () => Promise.reject(fsError("EACCES")),
    };
    await mkdir(directory);
    await writeFile(join(directory, "slot-1.json"), "locked");
    const [slot] = await createSaveStore(directory, { fileSystem }).readSlots();
    expect(slot).toEqual({ save: { kind: "unreadable" }, backup: MISSING });
  });

  test("keeps the old save and backup when writing the new save fails", async () => {
    const store = createSaveStore(directory);
    await store.writeSlot(0, "first");
    await store.writeSlot(0, "second");
    const failing = createSaveStore(directory, {
      fileSystem: { ...NODE_FILE_SYSTEM, writeFile: () => Promise.reject(fsError("ENOSPC")) },
    });
    await expect(failing.writeSlot(0, "third")).rejects.toThrow("ENOSPC");
    const [slot] = await store.readSlots();
    // The backup now holds the save that was current when the failed save began.
    expect(slot).toEqual({ save: text("second"), backup: text("second") });
  });

  test("goes on with the next save of a slot after one failed", async () => {
    let failures = 1;
    const fileSystem: StoreFileSystem = {
      ...NODE_FILE_SYSTEM,
      writeFile: (path, value) => {
        if (failures > 0) {
          failures -= 1;
          return Promise.reject(fsError("EIO"));
        }
        return NODE_FILE_SYSTEM.writeFile(path, value);
      },
    };
    const store = createSaveStore(directory, { fileSystem });
    const first = store.writeSlot(0, "first");
    const second = store.writeSlot(0, "second");
    await expect(first).rejects.toThrow("EIO");
    await expect(second).resolves.toBeUndefined();
    const [slot] = await store.readSlots();
    expect(slot?.save).toEqual(text("second"));
  });

  test("tries a rename again while Windows holds the file and doubles the wait", async () => {
    let failures = 2;
    const waits: number[] = [];
    const fileSystem: StoreFileSystem = {
      ...NODE_FILE_SYSTEM,
      rename: (from, to) => {
        if (failures > 0) {
          failures -= 1;
          return Promise.reject(fsError(failures === 1 ? "EPERM" : "EBUSY"));
        }
        return NODE_FILE_SYSTEM.rename(from, to);
      },
    };
    const store = createSaveStore(directory, { fileSystem, wait: recordingWait(waits) });
    await store.writeSlot(0, "saved");
    expect(waits).toEqual([20, 40]);
    const [slot] = await store.readSlots();
    expect(slot?.save).toEqual(text("saved"));
  });

  test(`gives up after ${String(RENAME_ATTEMPTS)} attempts`, async () => {
    const waits: number[] = [];
    let attempts = 0;
    const fileSystem: StoreFileSystem = {
      ...NODE_FILE_SYSTEM,
      rename: () => {
        attempts += 1;
        return Promise.reject(fsError("EACCES"));
      },
    };
    const store = createSaveStore(directory, { fileSystem, wait: recordingWait(waits) });
    await expect(store.writeSlot(0, "saved")).rejects.toThrow("EACCES");
    expect(attempts).toBe(RENAME_ATTEMPTS);
    expect(waits).toEqual([20, 40, 80, 160]);
  });

  test("does not try a rename again after another error", async () => {
    const waits: number[] = [];
    const fileSystem: StoreFileSystem = {
      ...NODE_FILE_SYSTEM,
      rename: () => Promise.reject(new Error("no code")),
    };
    const store = createSaveStore(directory, { fileSystem, wait: recordingWait(waits) });
    await expect(store.writeSlot(0, "saved")).rejects.toThrow("no code");
    expect(waits).toEqual([]);
  });

  test("waits with a real timer by default", async () => {
    let failures = 1;
    const fileSystem: StoreFileSystem = {
      ...NODE_FILE_SYSTEM,
      rename: (from, to) => {
        if (failures > 0) {
          failures -= 1;
          return Promise.reject(fsError("EBUSY"));
        }
        return NODE_FILE_SYSTEM.rename(from, to);
      },
    };
    await createSaveStore(directory, { fileSystem }).writeSlot(0, "saved");
    expect(await readFile(join(directory, "slot-1.json"), "utf8")).toBe("saved");
  });

  test("passes on an error other than a missing save while it checks for one", async () => {
    const fileSystem: StoreFileSystem = {
      ...NODE_FILE_SYSTEM,
      stat: () => Promise.reject(fsError("EACCES")),
    };
    await expect(createSaveStore(directory, { fileSystem }).writeSlot(0, "x")).rejects.toThrow(
      "EACCES",
    );
  });

  test("restores the backup as the save and keeps the backup", async () => {
    const store = createSaveStore(directory);
    await store.writeSlot(2, "good");
    await store.writeSlot(2, "next");
    await writeFile(join(directory, "slot-3.json"), "{ broken");
    await store.restoreBackup(2);
    const [, , slot] = await store.readSlots();
    expect(slot).toEqual({ save: text("good"), backup: text("good") });
  });

  test("fails to restore a slot without a backup and leaves its save alone", async () => {
    const store = createSaveStore(directory);
    await store.writeSlot(0, "only");
    await expect(store.restoreBackup(0)).rejects.toThrow();
    const [slot] = await store.readSlots();
    expect(slot).toEqual({ save: text("only"), backup: MISSING });
  });

  test("deletes a slot's save, backup and temporary files and no other slot", async () => {
    const store = createSaveStore(directory);
    await store.writeSlot(0, "first");
    await store.writeSlot(0, "second");
    await store.writeSlot(1, "other");
    await writeFile(join(directory, "slot-1.json.tmp"), "left over");
    await store.deleteSlot(0);
    expect(await store.readSlots()).toEqual([
      { save: MISSING, backup: MISSING },
      { save: text("other"), backup: MISSING },
      { save: MISSING, backup: MISSING },
    ]);
    expect(await readdir(directory)).toEqual(["slot-2.json"]);
  });

  test("deletes an empty slot without an error", async () => {
    await expect(createSaveStore(directory).deleteSlot(1)).resolves.toBeUndefined();
  });
});
