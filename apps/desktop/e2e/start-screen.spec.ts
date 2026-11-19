// End-to-end tests of the start screen (ROADMAP M3.1a, M3.1b): its language follows the system's locale
// (ADR 0012), it works with the keyboard, Quit closes the app, the bundled content loads under
// the strict Content Security Policy and axe-core finds no accessibility violations.
import { expect, test } from "./app";
import { axeViolations } from "./axe";

const LANGUAGES = [
  { locale: "en-US", language: "en", menu: "Main menu", play: "Play", quit: "Quit" },
  { locale: "de-DE", language: "de", menu: "Hauptmenü", play: "Spielen", quit: "Beenden" },
] as const;

for (const { locale, language, menu, play, quit } of LANGUAGES) {
  test.describe(`with the locale ${locale}`, () => {
    test.use({ appLocale: locale });

    test(`shows the start screen in the language "${language}"`, async ({ page }) => {
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.getByRole("heading", { level: 1, name: "PenguinOps" })).toBeVisible();
      const nav = page.getByRole("navigation", { name: menu });
      await expect(nav.getByRole("button")).toHaveText([play, quit]);
      await expect(page.getByRole("contentinfo")).toHaveText(/^Version \d+\.\d+\.\d+/u);
    });

    test("has no accessibility violations that axe-core finds", async ({ page }) => {
      await expect(page.getByRole("navigation", { name: menu })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  });
}

/**
 * Waits for an action that quits the app. The app can quit before Playwright gets the answer to
 * the action, which then fails with "Target page, context or browser has been closed". That is
 * the expected outcome, so only that error is ignored; the test's close event proves that the app
 * quit.
 */
async function allowAppToQuit(action: Promise<void>): Promise<void> {
  try {
    await action;
  } catch (error: unknown) {
    if (!(error instanceof Error && error.message.includes("has been closed"))) {
      throw error;
    }
  }
}

test("gives Play the keyboard focus and quits with Tab and Enter", async ({
  electronApp,
  page,
}) => {
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Quit" })).toBeFocused();
  const closed = electronApp.waitForEvent("close");
  // A button acts on Enter as soon as the key goes down; the app is gone before it comes up.
  await Promise.all([closed, allowAppToQuit(page.keyboard.down("Enter"))]);
});

test("quits when the player clicks Quit", async ({ electronApp, page }) => {
  const closed = electronApp.waitForEvent("close");
  await Promise.all([closed, allowAppToQuit(page.getByRole("button", { name: "Quit" }).click())]);
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
