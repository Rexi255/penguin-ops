// The save slot files in the per-user data folder (ROADMAP M3.7b, ADR 0013, ADR 0105). The main
// process stores the text of each slot's save file without reading it: the save format, its
// migrations and the decision which file of a slot to use belong to the renderer's gameplay code
// (ADR 0006, ADR 0104). The store guarantees that a crash or a full disk while saving never
// destroys a slot: every file is written to a temporary file first and then renamed over the old
// one, and the file a save replaces is kept as the slot's backup.
import * as nodeFs from "node:fs/promises";
import { join } from "node:path";

import type { StoredFile, StoredSlot } from "@penguin-ops/ui";

/** The number of save slots (ADR 0013); the UI's slot screen shows the same number. */
export const SAVE_SLOT_COUNT = 3;

/**
 * The largest save file the store reads or writes, in UTF-16 code units of its text. A save of a
 * game with every ticket opened is a few kilobytes; the limit keeps a wrong file from filling the
 * memory.
 */
export const MAX_SAVE_TEXT_LENGTH = 1024 * 1024;

/** The file system functions the store uses; tests replace single ones to provoke errors. */
export interface SaveFileSystem {
  readonly mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  readonly readFile: (path: string, encoding: "utf8") => Promise<string>;
  readonly stat: (path: string) => Promise<{ readonly size: number; isFile(): boolean }>;
  readonly writeFile: (path: string, text: string) => Promise<void>;
  readonly copyFile: (from: string, to: string) => Promise<void>;
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly rm: (path: string, options: { force: true }) => Promise<void>;
}

/** Writes a file and flushes it to the disk before it is closed. */
async function writeFileDurably(path: string, text: string): Promise<void> {
  const handle = await nodeFs.open(path, "w");
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** The real file system of Node.js. */
export const NODE_FILE_SYSTEM: SaveFileSystem = {
  mkdir: (path, options) => nodeFs.mkdir(path, options),
  readFile: (path, encoding) => nodeFs.readFile(path, encoding),
  stat: (path) => nodeFs.stat(path),
  writeFile: writeFileDurably,
  copyFile: (from, to) => nodeFs.copyFile(from, to),
  rename: (from, to) => nodeFs.rename(from, to),
  rm: (path, options) => nodeFs.rm(path, options),
};

/** What the store can do with the save slots; a slot is an index counting from 0. */
export interface SaveStore {
  /** Reads the save and the backup of every slot, `SAVE_SLOT_COUNT` entries. */
  readonly readSlots: () => Promise<readonly StoredSlot[]>;
  /** Saves `text` as the slot's save; the save it replaces becomes the slot's backup. */
  readonly writeSlot: (slot: number, text: string) => Promise<void>;
  /**
   * Makes the slot's backup its save again, for a save file that cannot be read; the backup
   * stays. Throws if the slot has no backup.
   */
  readonly restoreBackup: (slot: number) => Promise<void>;
  /** Removes the slot's save and backup; an empty slot stays empty. */
  readonly deleteSlot: (slot: number) => Promise<void>;
}

/** Options of `createSaveStore`. */
export interface SaveStoreOptions {
  /** The file system; the real one by default. */
  readonly fileSystem?: SaveFileSystem;
  /** Waits `milliseconds` before a rename is tried again; a real timer by default. */
  readonly wait?: (milliseconds: number) => Promise<void>;
}

/**
 * How often a rename is tried before the store gives up. On Windows, a virus scanner or the
 * search indexer can hold a file that was just written for a moment, and renaming over it fails
 * with EPERM, EACCES or EBUSY until it lets go.
 */
export const RENAME_ATTEMPTS = 5;

/** The wait before the second rename attempt; it doubles with every further attempt. */
const FIRST_RETRY_DELAY = 20;

const RETRIED_RENAME_ERRORS: ReadonlySet<string> = new Set(["EPERM", "EACCES", "EBUSY"]);

/** The error code of a Node.js file system error, or `undefined` for other errors. */
function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** Throws a TypeError unless `slot` is the index of a save slot. */
export function checkSlot(slot: unknown): asserts slot is number {
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot >= SAVE_SLOT_COUNT) {
    throw new TypeError(
      `The save slot must be a whole number from 0 to ${String(SAVE_SLOT_COUNT - 1)}.`,
    );
  }
}

/** Throws a TypeError unless `text` is a string the store accepts as a save. */
export function checkSaveText(text: unknown): asserts text is string {
  if (typeof text !== "string") {
    throw new TypeError("A save must be a text.");
  }
  if (text.length > MAX_SAVE_TEXT_LENGTH) {
    throw new TypeError(
      `A save must not be longer than ${String(MAX_SAVE_TEXT_LENGTH)} characters.`,
    );
  }
}

/** The file names of a slot inside the saves folder. */
export function slotFileNames(slot: number): {
  readonly save: string;
  readonly backup: string;
} {
  const base = `slot-${String(slot + 1)}`;
  return { save: `${base}.json`, backup: `${base}.backup.json` };
}

/** Creates the store of the save slots in `directory`, which it creates when it first writes. */
export function createSaveStore(directory: string, options: SaveStoreOptions = {}): SaveStore {
  const fs = options.fileSystem ?? NODE_FILE_SYSTEM;
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      }));
  // The operations on a slot run one after the other, so that two saves never share a temporary
  // file and a backup is never taken of a half-renamed save.
  const queues = new Map<number, Promise<unknown>>();

  function queued<T>(slot: number, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(slot) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    queues.set(
      slot,
      result.catch(() => undefined),
    );
    return result;
  }

  function paths(slot: number): { readonly save: string; readonly backup: string } {
    const names = slotFileNames(slot);
    return { save: join(directory, names.save), backup: join(directory, names.backup) };
  }

  async function renameWithRetry(from: string, to: string): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await fs.rename(from, to);
        return;
      } catch (error) {
        const code = errorCode(error);
        if (attempt >= RENAME_ATTEMPTS || code === undefined || !RETRIED_RENAME_ERRORS.has(code)) {
          throw error;
        }
        await wait(FIRST_RETRY_DELAY * 2 ** (attempt - 1));
      }
    }
  }

  async function readStoredFile(path: string): Promise<StoredFile> {
    try {
      const stats = await fs.stat(path);
      // A UTF-8 file has at least as many bytes as its text has UTF-16 code units.
      if (!stats.isFile() || stats.size > MAX_SAVE_TEXT_LENGTH * 3) {
        return { kind: "unreadable" };
      }
      const text = await fs.readFile(path, "utf8");
      return text.length > MAX_SAVE_TEXT_LENGTH ? { kind: "unreadable" } : { kind: "text", text };
    } catch (error) {
      return errorCode(error) === "ENOENT" ? { kind: "missing" } : { kind: "unreadable" };
    }
  }

  async function exists(path: string): Promise<boolean> {
    try {
      await fs.stat(path);
      return true;
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  /** Copies `from` to `to` so that `to` is always either the old or the complete new file. */
  async function copyAtomically(from: string, to: string): Promise<void> {
    const temporary = `${to}.tmp`;
    await fs.copyFile(from, temporary);
    await renameWithRetry(temporary, to);
  }

  async function writeAtomically(path: string, text: string): Promise<void> {
    const temporary = `${path}.tmp`;
    await fs.writeFile(temporary, text);
    await renameWithRetry(temporary, path);
  }

  return {
    readSlots: () =>
      Promise.all(
        Array.from({ length: SAVE_SLOT_COUNT }, (_, slot) =>
          queued(slot, async (): Promise<StoredSlot> => {
            const { save, backup } = paths(slot);
            return { save: await readStoredFile(save), backup: await readStoredFile(backup) };
          }),
        ),
      ),
    writeSlot: (slot, text) => {
      checkSlot(slot);
      checkSaveText(text);
      return queued(slot, async () => {
        const { save, backup } = paths(slot);
        await fs.mkdir(directory, { recursive: true });
        if (await exists(save)) {
          await copyAtomically(save, backup);
        }
        await writeAtomically(save, text);
      });
    },
    restoreBackup: (slot) => {
      checkSlot(slot);
      return queued(slot, async () => {
        const { save, backup } = paths(slot);
        await copyAtomically(backup, save);
      });
    },
    deleteSlot: (slot) => {
      checkSlot(slot);
      return queued(slot, async () => {
        const { save, backup } = paths(slot);
        // The save goes first: a slot whose deletion stops halfway shows its backup, never a
        // save without the backup the player expects to be gone too.
        for (const path of [save, `${save}.tmp`, backup, `${backup}.tmp`]) {
          await fs.rm(path, { force: true });
        }
      });
    },
  };
}
