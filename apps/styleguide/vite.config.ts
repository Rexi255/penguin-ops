// Development server of the styleguide page (ROADMAP M3.0c, ADR 0083). The page and its code live
// in apps/ui (styleguide.html, src/styleguide/); this workspace only serves them and tests them in
// a browser. Nothing here is part of the desktop app: its build (apps/desktop) reads only
// apps/ui/index.html.
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** The port of the styleguide server; the browser tests use it, too. */
export const STYLEGUIDE_PORT = 5190;

export default defineConfig({
  root: resolve(import.meta.dirname, "../ui"),
  plugins: [react()],
  server: {
    port: STYLEGUIDE_PORT,
    strictPort: true,
  },
  // Keep Vite's dependency cache out of apps/ui, next to this configuration.
  cacheDir: resolve(import.meta.dirname, "node_modules/.vite"),
});
