// The save slots as the game shows them (ROADMAP M3.7c, ADR 0013, ADR 0105, ADR 0106). The desktop
// stores each slot's save and backup as texts; this module reads them with the gameplay package
// and decides what a slot holds: nothing, a game, or a save the game cannot play. A save that
// cannot be read falls back to the backup, which is then restored as the save; a save of an older
// format version is written again in the current one.

import type { Content } from "@penguin-ops/content";
import {
  fitSaveToContent,
  parseSave,
  SAVE_FORMAT_VERSION,
  type SaveGame,
  serializeSave,
} from "@penguin-ops/gameplay";

import type { SaveFilesApi, StoredFile, StoredSlot } from "../desktop-api";

/** The number of save slots (ADR 0013); the desktop stores the same number. */
export const SAVE_SLOT_COUNT = 3;

/**
 * Why the game cannot play the save in a slot:
 *
 * - `damaged`: neither the save nor its backup can be read;
 * - `too-new`: a newer version of the game wrote the save; the file is left alone;
 * - `user-name-taken`: the content's worlds now hold an account with the save's user name.
 */
export type SlotLock = "damaged" | "too-new" | "user-name-taken";

/** What a save slot holds. */
export type SlotState =
  | { readonly kind: "empty" }
  | { readonly kind: "game"; readonly save: SaveGame }
  | { readonly kind: "locked"; readonly lock: SlotLock };

/** A slot without a game. */
export const EMPTY_SLOT: SlotState = { kind: "empty" };

/** What reading a slot's files found, and how the files need to be repaired. */
export interface SlotReading {
  readonly state: SlotState;
  /** The save cannot be read but the backup can: the backup becomes the save again. */
  readonly restoreBackup: boolean;
  /** The save was written in an older format version: it is written again in the current one. */
  readonly rewrite: boolean;
}

/** A stored file as the save format reads it. */
type ReadFile =
  | { readonly kind: "missing" }
  | { readonly kind: "broken" }
  | { readonly kind: "too-new" }
  | { readonly kind: "save"; readonly save: SaveGame; readonly fileVersion: number };

function readFile(file: StoredFile): ReadFile {
  switch (file.kind) {
    case "missing":
      return { kind: "missing" };
    case "unreadable":
      return { kind: "broken" };
    case "text": {
      const parsed = parseSave(file.text);
      if (parsed.kind === "save") {
        return { kind: "save", save: parsed.save, fileVersion: parsed.fileVersion };
      }
      return parsed.problem.code === "too-new" ? { kind: "too-new" } : { kind: "broken" };
    }
  }
}

/**
 * What the slot with the files `stored` holds. The save is used when it can be read; a save that
 * a newer game wrote locks the slot, so its backup never replaces it. Otherwise the backup is
 * used if it can be read. The game is fitted to `content` (`fitSaveToContent`), and a game whose
 * user name is in `reservedUserNames` locks the slot.
 */
export function readSlot(
  stored: StoredSlot,
  content: Pick<Content, "chapters" | "levels">,
  reservedUserNames: ReadonlySet<string>,
): SlotReading {
  const locked = (lock: SlotLock): SlotReading => ({
    state: { kind: "locked", lock },
    restoreBackup: false,
    rewrite: false,
  });
  const use = (file: Extract<ReadFile, { kind: "save" }>, fromBackup: boolean): SlotReading => {
    const save = fitSaveToContent(content, file.save);
    if (reservedUserNames.has(save.userName)) {
      return locked("user-name-taken");
    }
    return {
      state: { kind: "game", save },
      restoreBackup: fromBackup,
      rewrite: file.fileVersion < SAVE_FORMAT_VERSION,
    };
  };

  const save = readFile(stored.save);
  switch (save.kind) {
    case "save":
      return use(save, false);
    case "too-new":
      return locked("too-new");
    case "missing":
    case "broken":
      break;
  }
  const backup = readFile(stored.backup);
  switch (backup.kind) {
    case "save":
      return use(backup, true);
    case "too-new":
      return locked("too-new");
    case "missing":
      return save.kind === "missing"
        ? { state: EMPTY_SLOT, restoreBackup: false, rewrite: false }
        : locked("damaged");
    case "broken":
      return locked("damaged");
  }
}

/**
 * Reads every save slot from the desktop and repairs what `read` (`readSlot` by default) found:
 * restores backups and writes migrated saves in the current version. A repair that fails goes to
 * `onError`; the slot still shows the game it read. Rejects if the slots cannot be read at all.
 */
export async function loadSlots(
  files: Pick<SaveFilesApi, "readSlots" | "restoreBackup" | "writeSlot">,
  content: Pick<Content, "chapters" | "levels">,
  reservedUserNames: ReadonlySet<string>,
  onError: (error: unknown) => void,
  read: typeof readSlot = readSlot,
): Promise<readonly SlotState[]> {
  const stored = await files.readSlots();
  if (stored.length !== SAVE_SLOT_COUNT) {
    throw new Error(
      `The desktop has ${String(stored.length)} save slots, the game ${String(SAVE_SLOT_COUNT)}.`,
    );
  }
  return Promise.all(
    stored.map(async (slot, index) => {
      const reading = read(slot, content, reservedUserNames);
      try {
        if (reading.restoreBackup) {
          await files.restoreBackup(index);
        }
        if (reading.rewrite && reading.state.kind === "game") {
          await files.writeSlot(index, serializeSave(reading.state.save));
        }
      } catch (error) {
        onError(error);
      }
      return reading.state;
    }),
  );
}

/** How many tickets of the game are solved. */
export function solvedTicketCount(save: SaveGame): number {
  return save.tickets.filter((ticket) => ticket.solved).length;
}

/**
 * Why a file cannot be imported into a slot (ADR 0107):
 *
 * - `unreadable`: the file cannot be read, or is too large;
 * - `not-a-save`: it is no PenguinOps save;
 * - `damaged`: it is a save that breaks the format;
 * - `too-new`: a newer version of the game wrote it;
 * - `user-name-taken`: the content's worlds hold an account with its user name.
 */
export type ImportProblem = "unreadable" | "not-a-save" | "damaged" | "too-new" | "user-name-taken";

/** The game in a file the player imports, fitted to the content, or why it cannot be imported. */
export type ImportReading =
  | { readonly kind: "save"; readonly save: SaveGame }
  | { readonly kind: "problem"; readonly problem: ImportProblem };

/** Reads a file the player chose to import (`readSlot` reads a slot's files the same way). */
export function readImport(
  file: StoredFile,
  content: Pick<Content, "chapters" | "levels">,
  reservedUserNames: ReadonlySet<string>,
): ImportReading {
  const problem = (code: ImportProblem): ImportReading => ({ kind: "problem", problem: code });
  if (file.kind !== "text") {
    return problem("unreadable");
  }
  const parsed = parseSave(file.text);
  if (parsed.kind === "problem") {
    switch (parsed.problem.code) {
      case "not-json":
      case "not-a-save":
        return problem("not-a-save");
      case "too-new":
        return problem("too-new");
      case "invalid":
        return problem("damaged");
    }
  }
  const save = fitSaveToContent(content, parsed.save);
  return reservedUserNames.has(save.userName) ? problem("user-name-taken") : { kind: "save", save };
}

/**
 * The file name an export suggests for the game `save` of the slot `slot` (counting from 0), such
 * as `penguin-ops-slot-1-ada.json`: the user name holds only lowercase letters, digits and
 * hyphens, which every file system takes.
 */
export function exportFileName(slot: number, save: SaveGame): string {
  return `penguin-ops-slot-${String(slot + 1)}-${save.userName}.json`;
}
