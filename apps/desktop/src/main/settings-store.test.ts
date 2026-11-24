import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  checkSettingsText,
  createSettingsStore,
  MAX_SETTINGS_TEXT_LENGTH,
  SETTINGS_FILE_NAME,
} from "./settings-store";
import { NODE_FILE_SYSTEM, type StoreFileSystem } from "./stored-files";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "penguin-ops-settings-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A file system error with a Node.js error code. */
function fsError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe("checkSettingsText", () => {
  test("accepts a text up to the limit", () => {
    expect(() => {
      checkSettingsText("x".repeat(MAX_SETTINGS_TEXT_LENGTH));
    }).not.toThrow();
  });

  test.each([
    ["a longer text", "x".repeat(MAX_SETTINGS_TEXT_LENGTH + 1)],
    ["a number", 1],
    ["an object", { language: "de" }],
    ["undefined", undefined],
  ])("rejects %s", (_name, value) => {
    expect(() => {
      checkSettingsText(value);
    }).toThrow(TypeError);
  });
});

describe("createSettingsStore", () => {
  test("reads a missing settings file as missing and creates no folder", async () => {
    const directory = join(root, "data");
    await expect(createSettingsStore(directory).read()).resolves.toEqual({ kind: "missing" });
    await expect(readdir(root)).resolves.toEqual([]);
  });

  test("writes the settings file in a folder it creates and reads it back", async () => {
    const directory = join(root, "data");
    const store = createSettingsStore(directory);
    await store.write('{ "language": "de" }\n');
    expect(await readFile(join(directory, SETTINGS_FILE_NAME), "utf8")).toBe(
      '{ "language": "de" }\n',
    );
    await expect(store.read()).resolves.toEqual({ kind: "text", text: '{ "language": "de" }\n' });
  });

  test("replaces the settings file and leaves no temporary file and no backup", async () => {
    const store = createSettingsStore(root);
    await store.write("first");
    await store.write("second");
    expect(await readdir(root)).toEqual([SETTINGS_FILE_NAME]);
    await expect(store.read()).resolves.toEqual({ kind: "text", text: "second" });
  });

  test("runs reads and writes in the order they were asked for", async () => {
    const store = createSettingsStore(root);
    const writes = [store.write("first"), store.write("second")];
    const read = store.read();
    await Promise.all(writes);
    await expect(read).resolves.toEqual({ kind: "text", text: "second" });
  });

  test("reads a folder or a too large file in the settings file's place as unreadable", async () => {
    await mkdir(join(root, "folder", SETTINGS_FILE_NAME), { recursive: true });
    await expect(createSettingsStore(join(root, "folder")).read()).resolves.toEqual({
      kind: "unreadable",
    });
    await writeFile(join(root, SETTINGS_FILE_NAME), "x".repeat(MAX_SETTINGS_TEXT_LENGTH + 1));
    await expect(createSettingsStore(root).read()).resolves.toEqual({ kind: "unreadable" });
  });

  test("reads a file that cannot be read for another reason as unreadable", async () => {
    const fileSystem: StoreFileSystem = {
      ...NODE_FILE_SYSTEM,
      readFile: () => Promise.reject(fsError("EACCES")),
    };
    await writeFile(join(root, SETTINGS_FILE_NAME), "locked");
    await expect(createSettingsStore(root, { fileSystem }).read()).resolves.toEqual({
      kind: "unreadable",
    });
  });

  test("keeps the old settings when writing the new ones fails", async () => {
    await createSettingsStore(root).write("old");
    const failing = createSettingsStore(root, {
      fileSystem: { ...NODE_FILE_SYSTEM, writeFile: () => Promise.reject(fsError("ENOSPC")) },
    });
    await expect(failing.write("new")).rejects.toThrow("ENOSPC");
    await expect(createSettingsStore(root).read()).resolves.toEqual({ kind: "text", text: "old" });
  });

  test("goes on with the next write after one failed", async () => {
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
    const store = createSettingsStore(root, { fileSystem });
    const first = store.write("first");
    const second = store.write("second");
    await expect(first).rejects.toThrow("EIO");
    await expect(second).resolves.toBeUndefined();
    await expect(store.read()).resolves.toEqual({ kind: "text", text: "second" });
  });

  test("tries a rename again while Windows holds the file", async () => {
    let failures = 1;
    const waits: number[] = [];
    const fileSystem: StoreFileSystem = {
      ...NODE_FILE_SYSTEM,
      rename: (from, to) => {
        if (failures > 0) {
          failures -= 1;
          return Promise.reject(fsError("EPERM"));
        }
        return NODE_FILE_SYSTEM.rename(from, to);
      },
    };
    const store = createSettingsStore(root, {
      fileSystem,
      wait: (milliseconds) => {
        waits.push(milliseconds);
        return Promise.resolve();
      },
    });
    await store.write("saved");
    expect(waits).toEqual([20]);
    await expect(store.read()).resolves.toEqual({ kind: "text", text: "saved" });
  });

  test("rejects a wrong text before it touches the disk", async () => {
    const directory = join(root, "data");
    expect(() => createSettingsStore(directory).write(42 as unknown as string)).toThrow(
      "The settings must be a text.",
    );
    await expect(readdir(root)).resolves.toEqual([]);
  });
});
