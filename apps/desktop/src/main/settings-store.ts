// The settings file in the per-user data folder (ROADMAP M3.8a, ADR 0013, ADR 0108). Like the save
// slots (ADR 0105), the main process stores the text of the file without reading it: the
// settings format and what to do with a broken file belong to the renderer's gameplay code. Every
// write is atomic, so that a crash while writing leaves either the old or the new settings. There
// is no backup: a settings file that cannot be read gives the default settings, and the player
// loses no progress.
import { join } from "node:path";

import type { StoredFile } from "@penguin-ops/ui";

import {
  createAtomicWriter,
  NODE_FILE_SYSTEM,
  readStoredFile,
  realWait,
  type StoreFileSystem,
} from "./stored-files";

/** The name of the settings file in the per-user data folder. */
export const SETTINGS_FILE_NAME = "settings.json";

/**
 * The longest settings file the store reads or writes, in UTF-16 code units of its text. The
 * settings are a few hundred characters; the limit keeps a wrong file from filling the memory.
 */
export const MAX_SETTINGS_TEXT_LENGTH = 64 * 1024;

/** What the store can do with the settings file. */
export interface SettingsStore {
  /** Reads the settings file. */
  readonly read: () => Promise<StoredFile>;
  /** Writes `text` as the settings file, replacing the one before. */
  readonly write: (text: string) => Promise<void>;
}

/** Options of `createSettingsStore`. */
export interface SettingsStoreOptions {
  /** The file system; the real one by default. */
  readonly fileSystem?: StoreFileSystem;
  /** Waits `milliseconds` before a rename is tried again; a real timer by default. */
  readonly wait?: (milliseconds: number) => Promise<void>;
}

/** Throws a TypeError unless `text` is a string the store accepts as settings. */
export function checkSettingsText(text: unknown): asserts text is string {
  if (typeof text !== "string") {
    throw new TypeError("The settings must be a text.");
  }
  if (text.length > MAX_SETTINGS_TEXT_LENGTH) {
    throw new TypeError(
      `The settings must not be longer than ${String(MAX_SETTINGS_TEXT_LENGTH)} characters.`,
    );
  }
}

/**
 * Creates the store of the settings file `SETTINGS_FILE_NAME` in `directory`, which it creates
 * when it first writes.
 */
export function createSettingsStore(
  directory: string,
  options: SettingsStoreOptions = {},
): SettingsStore {
  const fs = options.fileSystem ?? NODE_FILE_SYSTEM;
  const { writeAtomically } = createAtomicWriter(fs, options.wait ?? realWait);
  const path = join(directory, SETTINGS_FILE_NAME);
  // Reads and writes run one after the other, so that two writes never share a temporary file
  // and a read never sees the settings before a write that was asked for earlier.
  let queue: Promise<unknown> = Promise.resolve();

  function queued<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  }

  return {
    read: () => queued(() => readStoredFile(fs, path, MAX_SETTINGS_TEXT_LENGTH)),
    write: (text) => {
      checkSettingsText(text);
      return queued(async () => {
        await fs.mkdir(directory, { recursive: true });
        await writeAtomically(path, text);
      });
    },
  };
}
