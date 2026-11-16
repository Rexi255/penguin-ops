// The contract between the renderer and the Electron preload script (ADR 0014, ADR 0033). The
// preload script in apps/desktop implements this interface and exposes it as
// `window.penguinOps`; the UI only talks to the desktop through it. Keep it small: every
// function is a native capability whose inputs the main process validates.

/** Basic facts about the running app. */
export interface AppInfo {
  /** The product name, for example "PenguinOps". */
  readonly name: string;
  /** The app version from the desktop package, for example "0.1.0". */
  readonly version: string;
}

/** Functions the desktop shell offers to the renderer. */
export interface DesktopApi {
  /** Returns the product name and version of the running app. */
  readonly getAppInfo: () => Promise<AppInfo>;
}

/** The name of the global under which the preload script exposes the `DesktopApi`. */
export type DesktopApiGlobalName = "penguinOps";
