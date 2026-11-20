// Entry point of the Electron main process. It owns the window and the files of the player (the
// save slots); the game itself runs in the renderer (docs/ARCHITECTURE.md).
import { join } from "node:path";

import type { AppInfo } from "@penguin-ops/ui";
import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  session,
} from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import { checkSaveText, checkSlot, createSaveStore, type SaveStore } from "./save-store";
import { isAllowedRequest, isTrustedSender, type AppLocation } from "./security";
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
function handleFromApp(channel: string, handler: (...args: readonly unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (!isFromApp(event)) {
      throw new Error(`Rejected ${channel} from an untrusted sender.`);
    }
    return handler(...args);
  });
}

function registerIpcHandlers(saves: SaveStore): void {
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
  // The saves live in Electron's per-user data folder, on Windows under %APPDATA% (ADR 0013).
  registerIpcHandlers(createSaveStore(join(app.getPath("userData"), "saves")));
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
