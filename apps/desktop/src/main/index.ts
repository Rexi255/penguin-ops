// Entry point of the Electron main process. It owns the window and the files of the player (the
// save slots and the settings); the game itself runs in the renderer (docs/ARCHITECTURE.md).
import { join } from "node:path";

import type { AppInfo } from "@penguin-ops/ui";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  session,
} from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import { checkSaveText, checkSlot, createSaveStore, type SaveStore } from "./save-store";
import {
  exportSave,
  importSave,
  type SaveDialogs,
  type SaveTransferOptions,
} from "./save-transfer";
import { isAllowedRequest, isTrustedSender, type AppLocation } from "./security";
import { checkSettingsText, createSettingsStore, type SettingsStore } from "./settings-store";
import { NODE_FILE_SYSTEM } from "./stored-files";
import { createMainWindow } from "./window";

/** The development server URL is only trusted in a development build, never when installed. */
function resolveAppLocation(): AppLocation {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServerUrl !== undefined) {
    return { kind: "dev-server", origin: new URL(devServerUrl).origin };
  }
  const rendererDir = join(import.meta.dirname, "../renderer");
  return { kind: "files", rendererDir, entryFile: join(rendererDir, "index.html") };
}

const location = resolveAppLocation();

// Every renderer runs in Chromium's sandbox (ADR 0014).
app.enableSandbox();

// Applies to every web page Electron creates, including ones created later.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
});

function hardenSession(): void {
  const { defaultSession } = session;
  defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  defaultSession.setPermissionCheckHandler(() => false);
  defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedRequest(details.url, location) });
  });
}

/** Whether an IPC message comes from the app's own page (ADR 0014). */
function isFromApp(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const frameUrl = event.senderFrame?.url;
  return frameUrl !== undefined && isTrustedSender(frameUrl, location);
}

/**
 * Answers `channel` with `handler` for the app's own page only. The handler gets the arguments
 * as `unknown`: it validates every one before it uses it (ADR 0014).
 */
function handleFromApp(
  channel: string,
  handler: (argument: unknown, second: unknown, event: IpcMainInvokeEvent) => unknown,
): void {
  ipcMain.handle(channel, (event, argument: unknown, second: unknown) => {
    if (!isFromApp(event)) {
      throw new Error(`Rejected ${channel} from an untrusted sender.`);
    }
    return handler(argument, second, event);
  });
}

/** The system's file dialogs for export and import, modal to the window that asked. */
function saveDialogs(event: IpcMainInvokeEvent): SaveDialogs {
  return {
    chooseExportPath: async ({ title, defaultPath, fileType }) => {
      const options = { title, defaultPath, filters: [{ name: fileType, extensions: ["json"] }] };
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = await (window === null
        ? dialog.showSaveDialog(options)
        : dialog.showSaveDialog(window, options));
      return result.canceled || result.filePath === "" ? undefined : result.filePath;
    },
    chooseImportPath: async ({ title, fileType }) => {
      const options = {
        title,
        filters: [{ name: fileType, extensions: ["json"] }],
        properties: ["openFile" as const],
      };
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = await (window === null
        ? dialog.showOpenDialog(options)
        : dialog.showOpenDialog(window, options));
      return result.canceled ? undefined : result.filePaths[0];
    },
  };
}

function transferOptions(event: IpcMainInvokeEvent): SaveTransferOptions {
  return {
    dialogs: saveDialogs(event),
    fileSystem: NODE_FILE_SYSTEM,
    exportFolder: app.getPath("documents"),
  };
}

function registerIpcHandlers(saves: SaveStore, settings: SettingsStore): void {
  handleFromApp(IPC_CHANNELS.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
  }));
  handleFromApp(IPC_CHANNELS.readSlots, () => saves.readSlots());
  handleFromApp(IPC_CHANNELS.writeSlot, (slot, text) => {
    checkSlot(slot);
    checkSaveText(text);
    return saves.writeSlot(slot, text);
  });
  handleFromApp(IPC_CHANNELS.restoreBackup, (slot) => {
    checkSlot(slot);
    return saves.restoreBackup(slot);
  });
  handleFromApp(IPC_CHANNELS.deleteSlot, (slot) => {
    checkSlot(slot);
    return saves.deleteSlot(slot);
  });
  // The transfer checks the request before it shows a dialog.
  handleFromApp(IPC_CHANNELS.exportSave, (request, _second, event) =>
    exportSave(request, transferOptions(event)),
  );
  handleFromApp(IPC_CHANNELS.importSave, (request, _second, event) =>
    importSave(request, transferOptions(event)),
  );
  handleFromApp(IPC_CHANNELS.readSettings, () => settings.read());
  handleFromApp(IPC_CHANNELS.writeSettings, (text) => {
    checkSettingsText(text);
    return settings.write(text);
  });
  // A one-way message: the renderer does not wait for an answer while the app closes.
  ipcMain.on(IPC_CHANNELS.quit, (event) => {
    if (!isFromApp(event)) {
      console.error(`Rejected ${IPC_CHANNELS.quit} from an untrusted sender.`);
      return;
    }
    app.quit();
  });
}

function fail(error: unknown): void {
  console.error("PenguinOps could not start:", error);
  app.exit(1);
}

async function start(): Promise<void> {
  await app.whenReady();
  hardenSession();
  // The saves and the settings live in Electron's per-user data folder, on Windows under %APPDATA%
  // (ADR 0013, ADR 0108).
  const userData = app.getPath("userData");
  registerIpcHandlers(createSaveStore(join(userData, "saves")), createSettingsStore(userData));
  await createMainWindow(location);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(location).catch(fail);
    }
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

start().catch(fail);
