// Entry point of the renderer, loaded by index.html. It loads the bundled content, reads the
// settings (ADR 0108), takes the language from them or from the operating system's locale
// (ADR 0012), reads the save slots and renders the app. The app keeps the settings from there on
// and shows the window in the mode of the fullscreen setting (ADR 0109).
import { reservedUserNames } from "@penguin-ops/gameplay";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { loadBundledContent } from "./content/bundled-content";
import { getDesktopApi } from "./desktop-bridge";
import "./fonts/fonts.css";
import { loadSlots, SAVE_SLOT_COUNT, type SlotState } from "./saves/save-slots";
import { loadSettings } from "./settings/settings-file";
import "./tokens.css";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error('index.html has no element with the id "root".');
}

const content = loadBundledContent();
const desktop = getDesktopApi();
const info = await desktop.getAppInfo();

// The global settings (ADR 0013, ADR 0108). Whatever is wrong with the file, the game starts with
// the default for every setting it cannot read.
const settings = await loadSettings(desktop.settings, (message, detail) => {
  console.warn(message, ...(detail === undefined ? [] : [detail]));
});
const reserved = reservedUserNames([...content.worlds.values()]);

function logSettingsError(error: unknown): void {
  console.error("PenguinOps could not save the settings:", error);
}

function logSaveError(error: unknown): void {
  console.error("PenguinOps could not save:", error);
}

// The save slots (ADR 0106). If they cannot be read at all, every slot shows a damaged save and
// stays locked, so that no new game is written over a save that may still be fine.
const slots = await loadSlots(desktop.saves, content, reserved, logSaveError).catch(
  (error: unknown): readonly SlotState[] => {
    console.error("PenguinOps could not read the save slots:", error);
    return Array.from({ length: SAVE_SLOT_COUNT }, () => ({ kind: "locked", lock: "damaged" }));
  },
);

createRoot(container).render(
  <StrictMode>
    <App
      info={info}
      content={content}
      // Electron sets the renderer's language to the app's locale, which follows the system.
      locale={navigator.language}
      settings={settings}
      settingsFile={desktop.settings}
      display={desktop.display}
      onSettingsError={logSettingsError}
      reservedUserNames={reserved}
      slots={slots}
      saveFiles={desktop.saves}
      now={Date.now}
      setCloseHandler={desktop.setCloseHandler}
      onSaveError={logSaveError}
      onQuit={desktop.quit}
    />
  </StrictMode>,
);
