// Security decisions of the main process as pure functions, so they can be unit-tested without
// Electron (ADR 0014, ADR 0033).
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Where the renderer is loaded from. */
export type AppLocation =
  /** Built files on disk (production build, end-to-end tests, installed app). */
  | { readonly kind: "files"; readonly rendererDir: string; readonly entryFile: string }
  /** The Vite development server (`npm run dev`), for example "http://localhost:5173". */
  | { readonly kind: "dev-server"; readonly origin: string };

function parseUrl(url: string): URL | undefined {
  return URL.canParse(url) ? new URL(url) : undefined;
}

/** Returns whether `path` is `directory` itself or lies inside it. */
function isInside(directory: string, path: string): boolean {
  const difference = relative(directory, path);
  return difference !== ".." && !difference.startsWith(".." + sep) && !isAbsolute(difference);
}

function filePath(url: URL): string | undefined {
  try {
    return fileURLToPath(url);
  } catch {
    return undefined; // For example a file URL with a host name on Linux.
  }
}

/**
 * Decides whether the renderer may load a URL. Only the app's own files (or the development
 * server) and in-memory data are allowed; every network request is blocked, because the game
 * works fully offline (ADR 0014).
 */
export function isAllowedRequest(url: string, location: AppLocation): boolean {
  const parsed = parseUrl(url);
  if (parsed === undefined) {
    return false;
  }
  switch (parsed.protocol) {
    case "data:":
    case "blob:":
    case "devtools:":
      return true;
    case "file:": {
      if (location.kind !== "files") {
        return false;
      }
      const path = filePath(parsed);
      return path !== undefined && isInside(location.rendererDir, path);
    }
    case "http:":
    case "ws:":
      return location.kind === "dev-server" && parsed.host === new URL(location.origin).host;
    default:
      return false;
  }
}

/** Decides whether an IPC message comes from the app's own page and may be answered. */
export function isTrustedSender(frameUrl: string, location: AppLocation): boolean {
  const parsed = parseUrl(frameUrl);
  if (parsed === undefined) {
    return false;
  }
  switch (location.kind) {
    case "files": {
      if (parsed.protocol !== "file:") {
        return false;
      }
      const path = filePath(parsed);
      return path !== undefined && relative(location.entryFile, path) === "";
    }
    case "dev-server":
      return parsed.origin === location.origin;
  }
}
