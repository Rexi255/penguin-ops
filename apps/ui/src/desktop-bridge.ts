// Access to the desktop API that the preload script exposes (ADR 0014, ADR 0033).
import type { DesktopApi, DesktopApiGlobalName } from "./desktop-api";

declare global {
  interface Window {
    /** Set by the Electron preload script; missing when the UI runs in a plain browser. */
    readonly penguinOps?: DesktopApi;
  }
}

const GLOBAL_NAME: DesktopApiGlobalName = "penguinOps";

/** Returns the desktop API, or throws if the UI does not run inside the desktop app. */
export function getDesktopApi(): DesktopApi {
  const api = window[GLOBAL_NAME];
  if (api === undefined) {
    throw new Error(`window.${GLOBAL_NAME} is missing: the UI must run inside the desktop app.`);
  }
  return api;
}
