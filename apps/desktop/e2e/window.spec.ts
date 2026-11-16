// Desktop smoke tests: the app starts, shows the placeholder screen and keeps the security
// baseline of ADR 0014.
import { expect, test } from "./app";

test("opens the window with the placeholder screen", async ({ page }) => {
  await expect(page).toHaveTitle("PenguinOps");
  await expect(page.getByRole("heading", { level: 1, name: "PenguinOps" })).toBeVisible();
  await expect(page.getByTestId("app-version")).toHaveText(/^\d+\.\d+\.\d+$/);
});

test("shows the version of the desktop package", async ({ electronApp, page }) => {
  const version = await electronApp.evaluate(({ app }) => app.getVersion());
  await expect(page.getByTestId("app-version")).toHaveText(version);
});

test("runs the renderer without Node.js and exposes only the desktop API", async ({ page }) => {
  const globals = await page.evaluate(() => {
    const scope = globalThis as Record<string, unknown>;
    const desktopApi = scope["penguinOps"];
    return {
      require: typeof scope["require"],
      process: typeof scope["process"],
      desktopApi:
        typeof desktopApi === "object" && desktopApi !== null ? Object.keys(desktopApi) : [],
    };
  });
  expect(globals).toEqual({
    require: "undefined",
    process: "undefined",
    desktopApi: ["getAppInfo"],
  });
});

test("blocks network requests, new windows and navigation", async ({ electronApp, page }) => {
  const fetchResult = await page.evaluate(async () => {
    try {
      await fetch("https://example.com/");
      return "loaded";
    } catch {
      return "blocked";
    }
  });
  expect(fetchResult).toBe("blocked");

  const opened = await page.evaluate(() => window.open("https://example.com/") === null);
  expect(opened).toBe(true);

  const startUrl = page.url();
  await page.evaluate(() => {
    window.location.href = "https://example.com/";
  });
  // Give a navigation the chance to start; it must be cancelled by the main process.
  await page.waitForTimeout(500);
  expect(page.url()).toBe(startUrl);
  expect(electronApp.windows()).toHaveLength(1);
});

test("blocks requests to the network in the main process as well", async ({ electronApp }) => {
  // A request from the main process's session goes through the same webRequest filter as the
  // renderer, but not through the page's Content Security Policy.
  const result = await electronApp.evaluate(async ({ session }) => {
    try {
      await session.defaultSession.fetch("https://example.com/");
      return "loaded";
    } catch {
      return "blocked";
    }
  });
  expect(result).toBe("blocked");
});
