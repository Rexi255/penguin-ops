// Packaging configuration (ADR 0002, ADR 0034): electron-builder turns the built app in out/ into
// an NSIS installer for Windows and an AppImage for Linux, written to release/. `npm run package`
// builds for the platform it runs on. electron-builder loads this file itself.
import { createRequire } from "node:module";

import type { Configuration } from "electron-builder";

/**
 * The Electron version installed from the lockfile. electron-builder needs the exact version to
 * download the matching binaries, and cannot find it itself because npm hoists `electron` to the
 * workspace root.
 */
function installedElectronVersion(): string {
  const manifest: unknown = createRequire(import.meta.url)("electron/package.json");
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("version" in manifest) ||
    typeof manifest.version !== "string"
  ) {
    throw new Error("electron/package.json has no version.");
  }
  return manifest.version;
}

/** Name of the Linux executable; the Windows one is `PenguinOps.exe` (from the product name). */
export const LINUX_EXECUTABLE_NAME = "penguin-ops";

export const OUTPUT_DIRECTORY = "release";

const config: Configuration = {
  // Identifies the installation on Windows (uninstall entry, upgrades). Never change it after a
  // release, or a new version installs next to the old one instead of updating it (ADR 0021).
  appId: "io.github.rexi255.penguin-ops",
  productName: "PenguinOps",
  copyright: "Copyright © 2026 Rexi255",
  electronVersion: installedElectronVersion(),
  directories: { output: OUTPUT_DIRECTORY },
  // Only the build output is shipped: no sources, tests or source maps. The app has no runtime
  // dependencies, because electron-vite bundles everything into out/.
  files: ["out/**/*", "!**/*.map"],
  asar: true,
  // Releases are published by the release pipeline (ROADMAP M5.3), never by a local build.
  publish: null,

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    // An installer wizard instead of a one-click installer: the player chooses the folder.
    oneClick: false,
    // The wizard asks whether to install for the current user (no administrator rights) or for
    // all users.
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "PenguinOps",
    runAfterFinish: true,
    // Save games and settings live in the per-user data folder and survive an uninstall
    // (ADR 0013).
    deleteAppDataOnUninstall: false,
    // The installer follows the Windows display language: German or English, like the game.
    installerLanguages: ["en_US", "de_DE"],
    artifactName: "${productName}-Setup-${version}.${ext}",
  },

  linux: {
    target: [{ target: "AppImage", arch: ["x64"] }],
    executableName: LINUX_EXECUTABLE_NAME,
    category: "Game",
    // Shown by application menus; the description in package.json is meant for developers.
    synopsis: "A relaxed learning game for Linux commands.",
    description: "A relaxed learning game for Linux commands.",
  },
  appImage: {
    artifactName: "${productName}-${version}.${ext}",
  },
};

export default config;
