// Guards the packaging decisions of ADR 0002 and ADR 0034. That the installer and the AppImage
// really build and start is shown by `npm run package` and `npm run e2e:packaged` (CI, M0.9).
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import config from "./electron-builder.config";

describe("electron-builder configuration", () => {
  it("keeps the app id that identifies existing installations", () => {
    expect(config.appId).toBe("io.github.rexi255.penguin-ops");
    expect(config.productName).toBe("PenguinOps");
  });

  it("ships only the build output, without source maps, inside app.asar", () => {
    expect(config.files).toEqual(["out/**/*", "!**/*.map"]);
    expect(config.asar).toBe(true);
  });

  it("uses the exact Electron version installed from the lockfile", () => {
    const manifest = createRequire(import.meta.url)("electron/package.json") as {
      version: string;
    };
    expect(config.electronVersion).toBe(manifest.version);
    expect(config.electronVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("never publishes from a local build", () => {
    expect(config.publish).toBeNull();
  });

  it("builds an installer wizard that lets the player choose and keeps save games", () => {
    expect(config.win?.target).toEqual([{ target: "nsis", arch: ["x64"] }]);
    expect(config.nsis).toMatchObject({
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false,
      installerLanguages: ["en_US", "de_DE"],
    });
  });

  it("builds an AppImage for Linux", () => {
    expect(config.linux?.target).toEqual([{ target: "AppImage", arch: ["x64"] }]);
    expect(config.linux?.executableName).toBe("penguin-ops");
  });

  it("names the files as the README tells players to download them", () => {
    expect(config.nsis?.artifactName).toBe("${productName}-Setup-${version}.${ext}");
    expect(config.appImage?.artifactName).toBe("${productName}-${version}.${ext}");
  });
});
