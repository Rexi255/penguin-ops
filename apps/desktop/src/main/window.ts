// The main window with the security baseline of ADR 0014.
import { join } from "node:path";

import { BrowserWindow } from "electron";

// electron-vite copies the file into the build output and returns its path at run time.
import windowIcon from "../../build/icons/256x256.png?asset";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import { guardClose } from "./close-guard";
import type { AppLocation } from "./security";
import { secureWebPreferences } from "./web-preferences";

/** Same as `--color-background` in apps/ui/src/styles.css; avoids a white flash on start. */
const BACKGROUND_COLOR = "#0d1117";

export async function createMainWindow(location: AppLocation): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: BACKGROUND_COLOR,
    autoHideMenuBar: true,
    // Windows takes the window icon from PenguinOps.exe, which electron-builder gives the app
    // icon. Linux needs it here, for development runs and for desktops that read the icon from
    // the window instead of from the .desktop file.
    ...(process.platform === "linux" ? { icon: windowIcon } : {}),
    webPreferences: secureWebPreferences(join(import.meta.dirname, "../preload/index.cjs")),
  });
  window.once("ready-to-show", () => {
    window.show();
  });
  // The game is saved before the window closes (ADR 0106). The answer comes only from this
  // window's own page.
  guardClose({
    onClose: (listener) => {
      window.on("close", (event) => {
        listener(() => {
          event.preventDefault();
        });
      });
    },
    requestClose: () => {
      window.webContents.send(IPC_CHANNELS.closeRequested);
    },
    onceReady: (listener) => {
      window.webContents.ipc.once(IPC_CHANNELS.closeReady, () => {
        listener();
      });
    },
    close: () => {
      window.close();
    },
  });

  switch (location.kind) {
    case "files":
      await window.loadFile(location.entryFile);
      break;
    case "dev-server":
      await window.loadURL(location.origin);
      break;
  }
  return window;
}
