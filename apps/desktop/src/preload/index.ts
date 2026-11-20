// Preload script: runs in the sandbox before the page and exposes the narrow, typed desktop API
// as `window.penguinOps` (ADR 0014, ADR 0033). Sandboxed preload scripts can only use the
// `electron` module, no other Node.js APIs.
import type {
  AppInfo,
  DesktopApi,
  DesktopApiGlobalName,
  ImportedFile,
  StoredSlot,
} from "@penguin-ops/ui";
import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels";

// What the page does before the window closes (`setCloseHandler`); nothing until it says.
let closeHandler: (() => Promise<void>) | undefined;

ipcRenderer.on(IPC_CHANNELS.closeRequested, () => {
  const ready = () => {
    ipcRenderer.send(IPC_CHANNELS.closeReady);
  };
  if (closeHandler === undefined) {
    ready();
  } else {
    closeHandler().then(ready, ready);
  }
});

const api: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo) as Promise<AppInfo>,
  quit: () => {
    ipcRenderer.send(IPC_CHANNELS.quit);
  },
  setCloseHandler: (handler) => {
    closeHandler = handler;
  },
  saves: {
    readSlots: () => ipcRenderer.invoke(IPC_CHANNELS.readSlots) as Promise<readonly StoredSlot[]>,
    writeSlot: async (slot, text) => {
      await ipcRenderer.invoke(IPC_CHANNELS.writeSlot, slot, text);
    },
    restoreBackup: async (slot) => {
      await ipcRenderer.invoke(IPC_CHANNELS.restoreBackup, slot);
    },
    deleteSlot: async (slot) => {
      await ipcRenderer.invoke(IPC_CHANNELS.deleteSlot, slot);
    },
    exportSave: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.exportSave, request) as Promise<"saved" | "canceled">,
    importSave: (texts) =>
      ipcRenderer.invoke(IPC_CHANNELS.importSave, texts) as Promise<ImportedFile>,
  },
};

const globalName: DesktopApiGlobalName = "penguinOps";
contextBridge.exposeInMainWorld(globalName, api);
