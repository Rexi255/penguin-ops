// Entry point of the renderer, loaded by index.html. It loads the bundled content, picks the
// language from the operating system's locale (ADR 0012), reads the save slots and renders the
// app.
import { reservedUserNames } from "@penguin-ops/gameplay";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { loadBundledContent } from "./content/bundled-content";
import { getDesktopApi } from "./desktop-bridge";
import "./fonts/fonts.css";
import { loadSlots, SAVE_SLOT_COUNT, type SlotState } from "./saves/save-slots";
import { languageForLocale } from "./texts/language";
import { createTexts } from "./texts/ui-texts";
import "./tokens.css";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error('index.html has no element with the id "root".');
}

const content = loadBundledContent();
// Electron sets the renderer's language to the app's locale, which follows the system.
const language = languageForLocale(navigator.language);
document.documentElement.lang = language;
const texts = createTexts(content.uiCatalogs, language);

const reserved = reservedUserNames([...content.worlds.values()]);

const desktop = getDesktopApi();
const info = await desktop.getAppInfo();

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
      texts={texts}
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
