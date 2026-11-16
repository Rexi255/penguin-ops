import { describe, expect, test } from "vitest";

import { secureWebPreferences } from "./web-preferences";

describe("secureWebPreferences (ADR 0014)", () => {
  test("isolates and sandboxes the renderer without Node.js", () => {
    expect(secureWebPreferences("/app/preload/index.cjs")).toEqual({
      preload: "/app/preload/index.cjs",
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
    });
  });
});
