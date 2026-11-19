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

export const BUILD_RESOURCES_DIRECTORY = "build";

/** The bundled fonts of the UI, each in a folder of its own with its license text (ADR 0085). */
export const FONTS_DIRECTORY = "../ui/src/fonts";

/** Where the installed app keeps the font licenses, inside its resources folder. */
export const FONT_LICENSES_RESOURCE = "licenses/fonts";

const config: Configuration = {
  // Identifies the installation on Windows (uninstall entry, upgrades). Never change it after a
  // release, or a new version installs next to the old one instead of updating it (ADR 0021).
  appId: "io.github.rexi255.penguin-ops",
  productName: "PenguinOps",
  copyright: "Copyright © 2026 Rexi255",
  electronVersion: installedElectronVersion(),
  // build/ holds the app icon (assets/brand/README.md): icon.ico for Windows, icons/NxN.png for
  // Linux. It is only read while packaging and not copied into the app.
  directories: { output: OUTPUT_DIRECTORY, buildResources: BUILD_RESOURCES_DIRECTORY },
  // Only the build output is shipped: no sources, tests or source maps. The app has no runtime
  // dependencies, because electron-vite bundles everything into out/.
  files: ["out/**/*", "!**/*.map"],
  asar: true,
  // The SIL OFL 1.1 asks for its text next to every copy of a font. The fonts themselves are
  // inside app.asar (bundled by Vite); their licenses are copied as plain files into
  // resources/licenses/fonts/<family>/ofl.txt, where players can read them.
  extraResources: [{ from: FONTS_DIRECTORY, to: FONT_LICENSES_RESOURCE, filter: ["*/ofl.txt"] }],
  // Releases are published by the release pipeline (ROADMAP M5.3), never by a local build.
  publish: null,

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    // Used for PenguinOps.exe, the shortcuts and the uninstall entry; the installer and
    // uninstaller wizards use it too.
    icon: "build/icon.ico",
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
    // One PNG per size, named NxN.png, for the AppImage's desktop entry and icon theme.
    icon: "build/icons",
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
