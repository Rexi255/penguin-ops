// Build configuration of the desktop app (ADR 0003, ADR 0033): the main process and the preload
// script come from apps/desktop/src, the renderer is apps/ui. Output goes to apps/desktop/out.
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

const uiRoot = resolve(import.meta.dirname, "../ui");

/**
 * Directives of the strict Content Security Policy in apps/ui/index.html that the Vite
 * development server cannot work with, and their development replacements: Vite injects CSS as
 * inline `<style>` elements and reloads the page through a WebSocket to itself. Production
 * builds keep the strict policy unchanged.
 */
const DEV_SERVER_CSP_CHANGES: readonly (readonly [strict: string, development: string])[] = [
  ["style-src 'self'", "style-src 'self' 'unsafe-inline'"],
  ["connect-src 'none'", "connect-src 'self'"],
];

function relaxContentSecurityPolicyForDevServer(): Plugin {
  return {
    name: "penguin-ops:dev-server-csp",
    apply: "serve",
    transformIndexHtml(html) {
      let result = html;
      for (const [strict, development] of DEV_SERVER_CSP_CHANGES) {
        if (!result.includes(strict)) {
          throw new Error(`apps/ui/index.html: the CSP no longer contains "${strict}".`);
        }
        result = result.replace(strict, development);
      }
      return result;
    },
  };
}

export default defineConfig({
  main: {},
  preload: {
    build: {
      rolldownOptions: {
        // Sandboxed preload scripts must be CommonJS (ADR 0014).
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: uiRoot,
    plugins: [react(), relaxContentSecurityPolicyForDevServer()],
    build: {
      outDir: resolve(import.meta.dirname, "out/renderer"),
      rolldownOptions: { input: resolve(uiRoot, "index.html") },
    },
  },
});
