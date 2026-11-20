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

/** The texts of a file dialog in the player's language. */
export interface FileDialogTexts {
  /** The dialog's title. */
  readonly title: string;
  /** The name of the file type in the dialog's filter, such as "PenguinOps save". */
  readonly fileType: string;
}

/** What `exportSave` writes, and where the dialog suggests to write it. */
export interface ExportRequest extends FileDialogTexts {
  /** The save's text. */
  readonly text: string;
  /** The suggested file name: lowercase letters, digits and hyphens, ending in `.json`. */
  readonly fileName: string;
}

/** The file the player chose to import, or that they canceled the dialog. */
export type ImportedFile =
  { readonly kind: "canceled" } | { readonly kind: "file"; readonly file: StoredFile };

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
  /**
   * Asks the player in the system's file dialog where to export a save and writes it there
   * (ADR 0107); `canceled` when the player cancels the dialog.
   */
  readonly exportSave: (request: ExportRequest) => Promise<"saved" | "canceled">;
  /** Asks the player in the system's file dialog which file to import and reads its text. */
  readonly importSave: (texts: FileDialogTexts) => Promise<ImportedFile>;
}

/** Functions the desktop shell offers to the renderer. */
export interface DesktopApi {
  /** Returns the product name and version of the running app. */
  readonly getAppInfo: () => Promise<AppInfo>;
  /** Closes the game. */
  readonly quit: () => void;
  /**
   * Sets what the page does before the window closes, for its close button as for `quit`: the
   * window waits until the promise settles, at most a few seconds (ADR 0106).
   */
  readonly setCloseHandler: (handler: () => Promise<void>) => void;
  /** The save slot files. */
  readonly saves: SaveFilesApi;
}

/** The name of the global under which the preload script exposes the `DesktopApi`. */
export type DesktopApiGlobalName = "penguinOps";
