import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MAX_SAVE_TEXT_LENGTH, NODE_FILE_SYSTEM } from "./save-store";
import {
  checkExportRequest,
  checkFileDialogTexts,
  exportSave,
  importSave,
  MAX_DIALOG_TEXT_LENGTH,
  type SaveDialogs,
  type SaveTransferOptions,
} from "./save-transfer";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "penguin-ops-transfer-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const TEXTS = { title: "Export slot 1", fileType: "PenguinOps save" };
const REQUEST = {
  ...TEXTS,
  text: '{"format": "penguin-ops-save"}\n',
  fileName: "penguin-ops-ada.json",
};

/** Dialogs that answer with `path`, or cancel when it is `undefined`. */
function dialogs(path: string | undefined) {
  return {
    chooseExportPath: vi.fn<SaveDialogs["chooseExportPath"]>(() => Promise.resolve(path)),
    chooseImportPath: vi.fn<SaveDialogs["chooseImportPath"]>(() => Promise.resolve(path)),
  };
}

function options(answer: ReturnType<typeof dialogs>): SaveTransferOptions {
  return { dialogs: answer, fileSystem: NODE_FILE_SYSTEM, exportFolder: join(folder, "documents") };
}

describe("checkFileDialogTexts", () => {
  test("accepts a title and a file type name", () => {
    expect(() => {
      checkFileDialogTexts(TEXTS);
    }).not.toThrow();
  });

  test.each([
    ["no object", "texts"],
    ["an array", [TEXTS]],
    ["no title", { fileType: "x" }],
    ["an empty title", { ...TEXTS, title: "" }],
    ["a too long title", { ...TEXTS, title: "x".repeat(MAX_DIALOG_TEXT_LENGTH + 1) }],
    ["a file type that is no text", { ...TEXTS, fileType: 1 }],
  ])("rejects %s", (_name, request) => {
    expect(() => {
      checkFileDialogTexts(request);
    }).toThrow(TypeError);
  });
});

describe("checkExportRequest", () => {
  test("accepts a request with texts, a save and a file name", () => {
    expect(() => {
      checkExportRequest(REQUEST);
    }).not.toThrow();
  });

  test.each([
    ["no object", null],
    ["no file name", { ...REQUEST, fileName: undefined }],
    ["a file name with a path", { ...REQUEST, fileName: "../ada.json" }],
    ["a file name with a backslash", { ...REQUEST, fileName: "..\\ada.json" }],
    ["a file name in capitals", { ...REQUEST, fileName: "Ada.json" }],
    ["a file name without .json", { ...REQUEST, fileName: "ada.exe" }],
    ["a file name starting with a hyphen", { ...REQUEST, fileName: "-ada.json" }],
    ["a too long text", { ...REQUEST, text: "x".repeat(MAX_SAVE_TEXT_LENGTH + 1) }],
    ["no text", { ...REQUEST, text: 3 }],
    ["no title", { ...REQUEST, title: undefined }],
  ])("rejects %s", (_name, request) => {
    expect(() => {
      checkExportRequest(request);
    }).toThrow(TypeError);
  });
});

describe("exportSave", () => {
  test("suggests the file name in the export folder and writes the save there", async () => {
    const target = join(folder, "chosen.json");
    const answer = dialogs(target);
    await expect(exportSave(REQUEST, options(answer))).resolves.toBe("saved");
    expect(answer.chooseExportPath).toHaveBeenCalledExactlyOnceWith({
      title: "Export slot 1",
      fileType: "PenguinOps save",
      defaultPath: join(folder, "documents", "penguin-ops-ada.json"),
    });
    expect(await readFile(target, "utf8")).toBe(REQUEST.text);
  });

  test("writes nothing when the player cancels", async () => {
    await expect(exportSave(REQUEST, options(dialogs(undefined)))).resolves.toBe("canceled");
  });

  test("rejects an invalid request before it shows a dialog", async () => {
    const answer = dialogs(join(folder, "x.json"));
    await expect(exportSave({ ...REQUEST, fileName: "x" }, options(answer))).rejects.toThrow(
      TypeError,
    );
    expect(answer.chooseExportPath).not.toHaveBeenCalled();
  });

  test("rejects when the file cannot be written", async () => {
    const answer = dialogs(join(folder, "missing", "folder", "x.json"));
    await expect(exportSave(REQUEST, options(answer))).rejects.toThrow();
  });
});

describe("importSave", () => {
  test("reads the chosen file's text", async () => {
    const source = join(folder, "save.json");
    await writeFile(source, "saved text");
    const answer = dialogs(source);
    await expect(importSave(TEXTS, options(answer))).resolves.toEqual({
      kind: "file",
      file: { kind: "text", text: "saved text" },
    });
    expect(answer.chooseImportPath).toHaveBeenCalledExactlyOnceWith(TEXTS);
  });

  test("reads a folder or a too large file as unreadable", async () => {
    const tooLarge = join(folder, "large.json");
    await writeFile(tooLarge, "x".repeat(MAX_SAVE_TEXT_LENGTH + 1));
    await expect(importSave(TEXTS, options(dialogs(tooLarge)))).resolves.toEqual({
      kind: "file",
      file: { kind: "unreadable" },
    });
    const directory = join(folder, "folder.json");
    await mkdir(directory);
    await expect(importSave(TEXTS, options(dialogs(directory)))).resolves.toEqual({
      kind: "file",
      file: { kind: "unreadable" },
    });
  });

  test("tells a canceled dialog", async () => {
    await expect(importSave(TEXTS, options(dialogs(undefined)))).resolves.toEqual({
      kind: "canceled",
    });
  });

  test("rejects invalid texts before it shows a dialog", async () => {
    const answer = dialogs(undefined);
    await expect(importSave({ title: "" }, options(answer))).rejects.toThrow(TypeError);
    expect(answer.chooseImportPath).not.toHaveBeenCalled();
  });
});
