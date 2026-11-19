// Entry point of the renderer, loaded by index.html. It loads the bundled content, picks the
// language from the operating system's locale (ADR 0012) and renders the app.
import { reservedUserNames } from "@penguin-ops/gameplay";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { loadBundledContent } from "./content/bundled-content";
import { getDesktopApi } from "./desktop-bridge";
import "./fonts/fonts.css";
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

createRoot(container).render(
  <StrictMode>
    <App info={info} texts={texts} reservedUserNames={reserved} onQuit={desktop.quit} />
  </StrictMode>,
);
