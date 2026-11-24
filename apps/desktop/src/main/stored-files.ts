// Reading and writing the player's files in the per-user data folder (ADR 0105, ADR 0108): the
// save slots and the settings. A file is written to a temporary file first and then renamed over
// the old one, so that a crash or a full disk while writing leaves either the old or the complete
// new file. On Windows a rename that a virus scanner blocks for a moment is tried again.
import * as nodeFs from "node:fs/promises";

import type { StoredFile } from "@penguin-ops/ui";

/** The file system functions the stores use; tests replace single ones to provoke errors. */
export interface StoreFileSystem {
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
export const NODE_FILE_SYSTEM: StoreFileSystem = {
  mkdir: (path, options) => nodeFs.mkdir(path, options),
  readFile: (path, encoding) => nodeFs.readFile(path, encoding),
  stat: (path) => nodeFs.stat(path),
  writeFile: writeFileDurably,
  copyFile: (from, to) => nodeFs.copyFile(from, to),
  rename: (from, to) => nodeFs.rename(from, to),
  rm: (path, options) => nodeFs.rm(path, options),
};

/**
 * How often a rename is tried before a store gives up. On Windows, a virus scanner or the search
 * indexer can hold a file that was just written for a moment, and renaming over it fails with
 * EPERM, EACCES or EBUSY until it lets go.
 */
export const RENAME_ATTEMPTS = 5;

/** The wait before the second rename attempt; it doubles with every further attempt. */
const FIRST_RETRY_DELAY = 20;

const RETRIED_RENAME_ERRORS: ReadonlySet<string> = new Set(["EPERM", "EACCES", "EBUSY"]);

/** The error code of a Node.js file system error, or `undefined` for other errors. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Reads the text file at `path`: `missing` if there is none, `unreadable` if it is no file, is
 * longer than `maxLength` UTF-16 code units or cannot be read.
 */
export async function readStoredFile(
  fs: StoreFileSystem,
  path: string,
  maxLength: number,
): Promise<StoredFile> {
  try {
    const stats = await fs.stat(path);
    // UTF-8 needs at most three bytes for a UTF-16 code unit, so a larger file is too long.
    if (!stats.isFile() || stats.size > maxLength * 3) {
      return { kind: "unreadable" };
    }
    const text = await fs.readFile(path, "utf8");
    return text.length > maxLength ? { kind: "unreadable" } : { kind: "text", text };
  } catch (error) {
    return errorCode(error) === "ENOENT" ? { kind: "missing" } : { kind: "unreadable" };
  }
}

/** Waits `milliseconds` with a real timer. */
export function realWait(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** Writes and copies files so that the target is always either the old or the complete new file. */
export interface AtomicWriter {
  /** Writes `text` to `path` through the temporary file `<path>.tmp`. */
  readonly writeAtomically: (path: string, text: string) => Promise<void>;
  /** Copies `from` to `to` through the temporary file `<to>.tmp`. */
  readonly copyAtomically: (from: string, to: string) => Promise<void>;
}

/**
 * Creates the atomic writer on `fs`; `wait` waits before a rename is tried again (ADR 0105).
 * The writer does not order its calls: a store that writes one file twice at once has to queue
 * them, so that they never share a temporary file.
 */
export function createAtomicWriter(
  fs: StoreFileSystem,
  wait: (milliseconds: number) => Promise<void>,
): AtomicWriter {
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

  return {
    writeAtomically: async (path, text) => {
      const temporary = `${path}.tmp`;
      await fs.writeFile(temporary, text);
      await renameWithRetry(temporary, path);
    },
    copyAtomically: async (from, to) => {
      const temporary = `${to}.tmp`;
      await fs.copyFile(from, temporary);
      await renameWithRetry(temporary, to);
    },
  };
}
