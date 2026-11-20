// Export and import of a save slot as a file (ROADMAP M3.7d, ADR 0013, ADR 0107): the player
// chooses the file in the system's file dialog, the main process writes the save's text there or
// reads a file's text back with the limits of the save store. The renderer passes the texts of
// the dialog in the player's language and the suggested file name; it parses and checks the
// imported text itself (ADR 0105).
import { basename, join } from "node:path";

import type { ExportRequest, FileDialogTexts, ImportedFile } from "@penguin-ops/ui";

import { checkSaveText, readStoredFile, type SaveFileSystem } from "./save-store";

/** The longest dialog title or file type name the main process accepts. */
export const MAX_DIALOG_TEXT_LENGTH = 200;

/**
 * A suggested export file name: lowercase letters, digits and hyphens, ending in `.json`, as the
 * renderer builds it from the slot number and the Linux user name.
 */
const EXPORT_FILE_NAME = /^[a-z0-9][a-z0-9-]{0,99}\.json$/u;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkDialogText(value: unknown, what: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_DIALOG_TEXT_LENGTH) {
    throw new TypeError(
      `The ${what} must be a text of 1 to ${String(MAX_DIALOG_TEXT_LENGTH)} characters.`,
    );
  }
}

/** Throws a TypeError unless `request` holds the texts of a file dialog. */
export function checkFileDialogTexts(request: unknown): asserts request is FileDialogTexts {
  if (!isRecord(request)) {
    throw new TypeError("The file dialog request must be an object.");
  }
  checkDialogText(request["title"], "dialog title");
  checkDialogText(request["fileType"], "file type name");
}

/** Throws a TypeError unless `request` is a valid export request. */
export function checkExportRequest(request: unknown): asserts request is ExportRequest {
  if (!isRecord(request)) {
    throw new TypeError("The export request must be an object.");
  }
  const { fileName, text } = request;
  checkFileDialogTexts(request);
  if (typeof fileName !== "string" || !EXPORT_FILE_NAME.test(fileName)) {
    throw new TypeError("The export file name must be lowercase letters, digits and hyphens.");
  }
  checkSaveText(text);
}

/** The parts of Electron's file dialogs that the transfer uses; tests replace them. */
export interface SaveDialogs {
  /** Asks where to save; `undefined` when the player cancels. */
  readonly chooseExportPath: (options: {
    readonly title: string;
    readonly defaultPath: string;
    readonly fileType: string;
  }) => Promise<string | undefined>;
  /** Asks which file to open; `undefined` when the player cancels. */
  readonly chooseImportPath: (options: {
    readonly title: string;
    readonly fileType: string;
  }) => Promise<string | undefined>;
}

/** Where the transfer looks and writes. */
export interface SaveTransferOptions {
  readonly dialogs: SaveDialogs;
  readonly fileSystem: SaveFileSystem;
  /** The folder the export dialog starts in, such as the player's documents. */
  readonly exportFolder: string;
}

/**
 * Exports a save: asks for the file in the dialog, starting at the suggested name in the export
 * folder, and writes the text there. Returns `canceled` when the player cancels the dialog.
 * Rejects when the request is invalid or the file cannot be written.
 */
export async function exportSave(
  request: unknown,
  options: SaveTransferOptions,
): Promise<"saved" | "canceled"> {
  checkExportRequest(request);
  const path = await options.dialogs.chooseExportPath({
    title: request.title,
    fileType: request.fileType,
    defaultPath: join(options.exportFolder, basename(request.fileName)),
  });
  if (path === undefined) {
    return "canceled";
  }
  await options.fileSystem.writeFile(path, request.text);
  return "saved";
}

/**
 * Imports a save: asks for the file in the dialog and reads its text with the limits of the save
 * store. A file that cannot be read comes back `unreadable`, never as an error.
 */
export async function importSave(
  request: unknown,
  options: SaveTransferOptions,
): Promise<ImportedFile> {
  checkFileDialogTexts(request);
  const path = await options.dialogs.chooseImportPath({
    title: request.title,
    fileType: request.fileType,
  });
  if (path === undefined) {
    return { kind: "canceled" };
  }
  return { kind: "file", file: await readStoredFile(options.fileSystem, path) };
}
