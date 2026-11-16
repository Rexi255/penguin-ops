// The main window with the security baseline of ADR 0014.
import { join } from "node:path";

import { BrowserWindow } from "electron";

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
    webPreferences: secureWebPreferences(join(import.meta.dirname, "../preload/index.cjs")),
  });
  window.once("ready-to-show", () => {
    window.show();
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
