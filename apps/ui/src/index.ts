// Public API of the UI package for other workspaces. The renderer itself starts from
// `src/main.tsx` (loaded by `index.html`). Only types are exported here: apps/desktop may import
// them to implement the preload contract (ADR 0033).
export type { AppInfo, DesktopApi, DesktopApiGlobalName } from "./desktop-api";
