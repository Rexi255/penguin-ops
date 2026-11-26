// The main window with the security baseline of ADR 0014. It starts hidden and appears in the
// mode of the fullscreen setting once the renderer has read it (ADR 0109).
import { join } from "node:path";

import { BrowserWindow } from "electron";

// electron-vite copies the file into the build output and returns its path at run time.
import windowIcon from "../../build/icons/256x256.png?asset";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import { guardClose } from "./close-guard";
import { checkFullscreen, controlDisplay, fullscreenKeyAction } from "./fullscreen";
import { type AppLocation, isTrustedSender } from "./security";
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
  // F11 and the fullscreen setting (ADR 0020, ADR 0109).
  const display = controlDisplay({
    setFullScreen: (on) => {
      window.setFullScreen(on);
    },
    show: () => {
      window.show();
    },
    onceReadyToShow: (listener) => {
      window.once("ready-to-show", listener);
    },
    onFullScreenChange: (listener) => {
      window.on("enter-full-screen", () => {
        listener(true);
      });
      window.on("leave-full-screen", () => {
        listener(false);
      });
    },
    onToggleKey: (listener) => {
      // Before the page and the application menu, whose View menu would toggle on F11 as well.
      window.webContents.on("before-input-event", (event, input) => {
        const action = fullscreenKeyAction(input);
        if (action !== "pass") {
          event.preventDefault();
        }
        if (action === "toggle") {
          listener();
        }
      });
    },
    reportFullScreen: (on) => {
      window.webContents.send(IPC_CHANNELS.fullscreenChanged, on);
    },
  });
  // Only this window's own page sets its display; it validates what it gets (ADR 0014).
  window.webContents.ipc.handle(IPC_CHANNELS.setFullscreen, (event, on: unknown) => {
    const frameUrl = event.senderFrame?.url;
    if (frameUrl === undefined || !isTrustedSender(frameUrl, location)) {
      throw new Error(`Rejected ${IPC_CHANNELS.setFullscreen} from an untrusted sender.`);
    }
    checkFullscreen(on);
    display.setFullscreen(on);
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
