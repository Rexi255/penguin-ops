// The contract between the renderer and the Electron preload script (ADR 0014, ADR 0033). The
// preload script in apps/desktop implements this interface and exposes it as
// `window.penguinOps`; the UI only talks to the desktop through it. Keep it small: every
// function is a native capability whose inputs the main process validates.

/** Basic facts about the running app. */
export interface AppInfo {
  /** The product name, for example "PenguinOps". */
  readonly name: string;
  /** The app version from the desktop package, for example "0.1.0". */
  readonly version: string;
}

/** A file of a save slot as the desktop read it. */
export type StoredFile =
  | { readonly kind: "missing" }
  /** The file exists but could not be read: it is too large, a folder, or not accessible. */
  | { readonly kind: "unreadable" }
  | { readonly kind: "text"; readonly text: string };

/** The files of a save slot: the save itself and the backup of the save before it. */
export interface StoredSlot {
  readonly save: StoredFile;
  readonly backup: StoredFile;
}

/**
 * The save slot files in the per-user data folder (ADR 0013, ADR 0105). The desktop stores the
 * texts without reading them; the UI parses and migrates them with the gameplay package. A slot
 * is an index counting from 0. Every write is atomic, and the save it replaces becomes the slot's
 * backup. The promises reject when a file cannot be written.
 */
export interface SaveFilesApi {
  /** Reads the save and the backup of every slot, one entry per slot. */
  readonly readSlots: () => Promise<readonly StoredSlot[]>;
  /** Saves `text` as the slot's save. */
  readonly writeSlot: (slot: number, text: string) => Promise<void>;
  /** Makes the slot's backup its save again, for a save that cannot be read. */
  readonly restoreBackup: (slot: number) => Promise<void>;
  /** Removes the slot's save and backup. */
  readonly deleteSlot: (slot: number) => Promise<void>;
}

/** Functions the desktop shell offers to the renderer. */
export interface DesktopApi {
  /** Returns the product name and version of the running app. */
  readonly getAppInfo: () => Promise<AppInfo>;
  /** Closes the game. */
  readonly quit: () => void;
  /** The save slot files. */
  readonly saves: SaveFilesApi;
}

/** The name of the global under which the preload script exposes the `DesktopApi`. */
export type DesktopApiGlobalName = "penguinOps";
