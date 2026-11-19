// Guards what the renderer build of the app contains (ADR 0083): only apps/ui/index.html and what
// it imports. The styleguide page next to it (styleguide.html) is never built into the app.
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import config from "./electron.vite.config";

describe("electron-vite configuration", () => {
  it("builds the renderer from apps/ui/index.html alone", () => {
    const uiRoot = resolve(import.meta.dirname, "../ui");
    expect(config.renderer?.root).toBe(uiRoot);
    expect(config.renderer?.build?.rolldownOptions?.input).toBe(resolve(uiRoot, "index.html"));
  });
});
