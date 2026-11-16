// Entry point of the Electron main process. It owns the window and, later, the files of the
// player; the game itself runs in the renderer (docs/ARCHITECTURE.md).
import { join } from "node:path";

import type { AppInfo } from "@penguin-ops/ui";
import { app, BrowserWindow, ipcMain, session } from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import { isAllowedRequest, isTrustedSender, type AppLocation } from "./security";
import { createMainWindow } from "./window";

/** The development server URL is only trusted in a development build, never when installed. */
function resolveAppLocation(): AppLocation {
  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
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

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.getAppInfo, (event): AppInfo => {
    const frameUrl = event.senderFrame?.url;
    if (frameUrl === undefined || !isTrustedSender(frameUrl, location)) {
      throw new Error(`Rejected ${IPC_CHANNELS.getAppInfo} from an untrusted sender.`);
    }
    return { name: app.getName(), version: app.getVersion() };
  });
}

function fail(error: unknown): void {
  console.error("PenguinOps could not start:", error);
  app.exit(1);
}

async function start(): Promise<void> {
  await app.whenReady();
  hardenSession();
  registerIpcHandlers();
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
