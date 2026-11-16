import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

import { isAllowedRequest, isTrustedSender, type AppLocation } from "./security";

const rendererDir = join(import.meta.dirname, "app", "out", "renderer");
const entryFile = join(rendererDir, "index.html");
const files: AppLocation = { kind: "files", rendererDir, entryFile };
const devServer: AppLocation = { kind: "dev-server", origin: "http://localhost:5173" };

const fileUrl = (...parts: string[]) => pathToFileURL(join(rendererDir, ...parts)).href;

describe("isAllowedRequest", () => {
  test.each([
    fileUrl("index.html"),
    fileUrl("assets", "index-abc.js"),
    "data:image/png;base64,AAAA",
    "blob:file:///0a1b2c",
    "devtools://devtools/bundled/inspector.html",
  ])("allows %s when the app runs from files", (url) => {
    expect(isAllowedRequest(url, files)).toBe(true);
  });

  test.each([
    [
      "a file outside the renderer folder",
      pathToFileURL(join(rendererDir, "..", "main", "index.js")).href,
    ],
    [
      "a sibling folder with the same prefix",
      pathToFileURL(join(`${rendererDir}-evil`, "x.js")).href,
    ],
    ["the parent folder", pathToFileURL(join(rendererDir, "..")).href],
    ["HTTPS", "https://example.com/"],
    ["HTTP", "http://localhost:5173/"],
    ["a WebSocket", "ws://localhost:5173/"],
    ["FTP", "ftp://example.com/file"],
    ["an invalid URL", "not a url"],
  ])("blocks %s when the app runs from files", (_name, url) => {
    expect(isAllowedRequest(url, files)).toBe(false);
  });

  test.each([
    "http://localhost:5173/",
    "http://localhost:5173/src/main.tsx",
    "ws://localhost:5173/?token=x",
  ])("allows %s from the development server", (url) => {
    expect(isAllowedRequest(url, devServer)).toBe(true);
  });

  test.each([
    "http://localhost:5174/",
    "http://127.0.0.1:5173/",
    "https://localhost:5173/",
    "https://example.com/",
    fileUrl("index.html"),
  ])("blocks %s during development", (url) => {
    expect(isAllowedRequest(url, devServer)).toBe(false);
  });
});

describe("isTrustedSender", () => {
  test("trusts only the app's entry page when it runs from files", () => {
    expect(isTrustedSender(fileUrl("index.html"), files)).toBe(true);
    expect(isTrustedSender(`${fileUrl("index.html")}#start`, files)).toBe(true);
    expect(isTrustedSender(fileUrl("other.html"), files)).toBe(false);
    expect(isTrustedSender("https://example.com/", files)).toBe(false);
    expect(isTrustedSender("", files)).toBe(false);
  });

  test("trusts only the development server's origin during development", () => {
    expect(isTrustedSender("http://localhost:5173/", devServer)).toBe(true);
    expect(isTrustedSender("http://localhost:5174/", devServer)).toBe(false);
    expect(isTrustedSender(fileUrl("index.html"), devServer)).toBe(false);
    expect(isTrustedSender("about:blank", devServer)).toBe(false);
  });
});
