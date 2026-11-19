// Preload script: runs in the sandbox before the page and exposes the narrow, typed desktop API
// as `window.penguinOps` (ADR 0014, ADR 0033). Sandboxed preload scripts can only use the
// `electron` module, no other Node.js APIs.
import type { AppInfo, DesktopApi, DesktopApiGlobalName } from "@penguin-ops/ui";
import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels";

const api: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo) as Promise<AppInfo>,
  quit: () => {
    ipcRenderer.send(IPC_CHANNELS.quit);
  },
};

const globalName: DesktopApiGlobalName = "penguinOps";
contextBridge.exposeInMainWorld(globalName, api);
