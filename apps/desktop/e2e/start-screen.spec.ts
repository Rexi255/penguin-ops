// End-to-end tests of the start screen (ROADMAP M3.1a): its language follows the system's locale
// (ADR 0012), it works with the keyboard, Quit closes the app, the bundled content loads under
// the strict Content Security Policy and axe-core finds no accessibility violations.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { AxeResults } from "axe-core";

import { expect, test } from "./app";

// The axe-core rule sets that the game must meet: WCAG 2.2 A and AA, and axe's best practices.
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const AXE_SOURCE = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

const LANGUAGES = [
  { locale: "en-US", language: "en", menu: "Main menu", quit: "Quit" },
  { locale: "de-DE", language: "de", menu: "Hauptmenü", quit: "Beenden" },
] as const;

for (const { locale, language, menu, quit } of LANGUAGES) {
  test.describe(`with the locale ${locale}`, () => {
    test.use({ appLocale: locale });

    test(`shows the start screen in the language "${language}"`, async ({ page }) => {
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.getByRole("heading", { level: 1, name: "PenguinOps" })).toBeVisible();
      const nav = page.getByRole("navigation", { name: menu });
      await expect(nav.getByRole("button")).toHaveText([quit]);
      await expect(page.getByRole("contentinfo")).toHaveText(/^Version \d+\.\d+\.\d+/u);
    });

    test("has no accessibility violations that axe-core finds", async ({ page }) => {
      await expect(page.getByRole("navigation", { name: menu })).toBeVisible();
      // Evaluated through the DevTools protocol, which the page's Content Security Policy does
      // not restrict; a script tag would be blocked by it.
      await page.evaluate(AXE_SOURCE);
      const results = await page.evaluate(async (tags): Promise<AxeResults> => {
        const { axe } = globalThis as unknown as { axe: typeof import("axe-core") };
        return axe.run(document, { runOnly: { type: "tag", values: tags } });
      }, AXE_TAGS);
      expect(results.violations.map(({ id, nodes }) => `${id}: ${String(nodes.length)}`)).toEqual(
        [],
      );
    });
  });
}

test("gives the menu the keyboard focus and quits with Enter", async ({ electronApp, page }) => {
  const quit = page.getByRole("button", { name: "Quit" });
  await expect(quit).toBeFocused();
  const closed = electronApp.waitForEvent("close");
  // A button acts on Enter as soon as the key goes down; the app is gone before it comes up.
  // The app can even quit before Playwright gets the answer to the key press, which then fails
  // with "Target page, context or browser has been closed". That is the expected outcome, so only
  // that error is ignored; the close event proves that the app quit.
  const pressed = page.keyboard.down("Enter").catch((error: unknown) => {
    if (!(error instanceof Error && error.message.includes("has been closed"))) {
      throw error;
    }
  });
  await Promise.all([closed, pressed]);
});

test("quits when the player clicks Quit", async ({ electronApp, page }) => {
  const closed = electronApp.waitForEvent("close");
  await page.getByRole("button", { name: "Quit" }).click();
  await closed;
});

test("loads the content without errors in the console", async ({ page }) => {
  // The first load happened before the test could listen, so the page is loaded again.
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Quit" })).toBeVisible();
  expect(errors).toEqual([]);
});
