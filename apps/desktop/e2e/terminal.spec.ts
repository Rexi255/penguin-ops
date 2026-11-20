// End-to-end tests of the terminal in the real app (ROADMAP M3.3, ADR 0095): the player types
// commands and sees their output and notices, completes with Tab, interrupts with Ctrl+C, clears
// with Ctrl+L and scrolls back through long output; readline keys that the game does not simulate
// yet (Ctrl+W, Ctrl+R) change nothing; and axe-core finds no accessibility violations with output
// and a notice and the texts of the game commands `help` and `hint` (M3.6b) on the screen.
import type { Page } from "@playwright/test";

import { expect, test } from "./app";
import { axeViolations } from "./axe";

const LANGUAGES = [
  {
    locale: "en-US",
    input: "Command line",
    output: "Terminal output",
    hint: "Hint 1 of 3",
    notice:
      "cat would now wait for you to type something. PenguinOps does not simulate typing into a running command yet, so the input stopped here.",
  },
  {
    locale: "de-DE",
    input: "Befehlszeile",
    output: "Terminalausgabe",
    hint: "Hinweis 1 von 3",
    notice:
      "cat würde jetzt warten, bis du etwas eintippst. Eingaben in einen laufenden Befehl simuliert PenguinOps noch nicht, darum hat die Eingabe hier angehalten.",
  },
] as const;

/** Starts a new game for "Max" with the keyboard and waits until the terminal has the focus. */
async function startGame(page: Page): Promise<void> {
  await expect(page.locator("button:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".save-slot:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".field__input:focus")).toHaveCount(1);
  await page.keyboard.type("Max");
  await page.keyboard.press("Enter");
  await expect(page.locator(".terminal__input:focus")).toHaveCount(1);
}

/** Types a command line and presses Enter. */
async function run(page: Page, line: string): Promise<void> {
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

/** The line with the prompt and the cursor. */
function inputLine(page: Page) {
  return page.locator(".terminal__page > .terminal__line").last();
}

for (const language of LANGUAGES) {
  test.describe(`with the locale ${language.locale}`, () => {
    test.use({ appLocale: language.locale });

    test("runs commands and shows their output and notices", async ({ page }) => {
      await startGame(page);
      await expect(page.getByRole("textbox", { name: language.input })).toBeFocused();
      const log = page.getByRole("log", { name: language.output });
      await expect(inputLine(page)).toHaveText("max@itdesk:~$  ");
      await run(page, "pwd");
      await expect(log).toContainText("max@itdesk:~$ pwd/home/max");
      await run(page, "cat");
      await expect(page.locator(".terminal__notice")).toHaveText(language.notice);
      await run(page, "cd welcome");
      await expect(inputLine(page)).toHaveText("max@itdesk:~/welcome$  ");
    });

    test("has no accessibility violations that axe-core finds", async ({ page }) => {
      await startGame(page);
      await run(page, "ls");
      await run(page, "cat");
      await run(page, "help");
      await run(page, "hint");
      await page.keyboard.type("echo");
      expect(await axeViolations(page)).toEqual([]);
    });

    test("shows the texts of the game commands help and hint", async ({ page }) => {
      await startGame(page);
      await run(page, "help");
      await expect(page.locator(".terminal__commands code").first()).toHaveText("cat");
      await run(page, "hint");
      await expect(page.locator(".terminal__game-label")).toHaveText(language.hint);
      await expect(page.locator(".ticket__hint-label")).toHaveText(language.hint);
    });
  });
}

test("completes with Tab, lists on a second Tab and keeps the focus", async ({ page }) => {
  await startGame(page);
  await page.keyboard.type("cd wel");
  await page.keyboard.press("Tab");
  await expect(inputLine(page)).toHaveText("max@itdesk:~$ cd welcome/ ");
  await expect(page.locator(".terminal__input")).toBeFocused();
  await page.keyboard.press("Control+c");
  await page.keyboard.type("c");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator(".terminal__line").nth(-2)).toHaveText("cat    cd     clear  cp     ");
});

test("edits the line and walks through the history", async ({ page }) => {
  await startGame(page);
  await run(page, "pwd");
  await page.keyboard.type("lx");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("s");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("x");
  await page.keyboard.press("Control+e");
  await expect(inputLine(page)).toHaveText("max@itdesk:~$ xls ");
  await page.keyboard.press("ArrowUp");
  await expect(inputLine(page)).toHaveText("max@itdesk:~$ pwd ");
  await page.keyboard.press("ArrowDown");
  await expect(inputLine(page)).toHaveText("max@itdesk:~$ xls ");
});

test("interrupts with Ctrl+C and sets the exit status to 130", async ({ page }) => {
  await startGame(page);
  await page.keyboard.type("ls -l");
  await page.keyboard.press("Control+c");
  await expect(page.locator(".terminal__line").first()).toHaveText("max@itdesk:~$ ls -l^C");
  await run(page, "echo $?");
  await expect(page.locator(".terminal__line").nth(-2)).toHaveText("130");
});

test("types the characters that need AltGr on a German keyboard", async ({ page }) => {
  await startGame(page);
  // The text arrives as input, as typed characters do; that Ctrl+Alt (AltGr on Windows) is never
  // taken for a Ctrl key is shown by the unit tests of terminal-keys.ts.
  await page.keyboard.insertText("ls ~ | cat");
  await expect(inputLine(page)).toHaveText("max@itdesk:~$ ls ~ | cat ");
});

test("ignores Ctrl+W and Ctrl+R, which the game does not simulate yet", async ({
  electronApp,
  page,
}) => {
  // Keys sent through the DevTools protocol never reach Electron's menu, so this test cannot
  // show that the menu does not close or reload the window; it shows that the terminal keeps the
  // line and the screen. The owner checked the menu keys by hand on Windows (ADR 0095).
  await startGame(page);
  await run(page, "pwd");
  await page.keyboard.press("Control+w");
  await page.keyboard.press("Control+r");
  await page.keyboard.type("x");
  await expect(inputLine(page)).toHaveText("max@itdesk:~$ x ");
  await expect(page.getByRole("log")).toContainText("/home/max");
  expect(electronApp.windows()).toHaveLength(1);
});

test("clears with Ctrl+L and scrolls back with Shift+PageUp", async ({ page }) => {
  await startGame(page);
  const log = page.getByRole("log");
  for (let index = 0; index < 30; index += 1) {
    await run(page, `echo line ${String(index)}`);
  }
  // The newest line is in view: the terminal scrolls to the bottom.
  await expect(inputLine(page)).toBeInViewport();
  const bottom = await log.evaluate((element) => element.scrollTop);
  expect(bottom).toBeGreaterThan(0);
  await page.keyboard.press("Shift+PageUp");
  expect(await log.evaluate((element) => element.scrollTop)).toBeLessThan(bottom);
  await page.keyboard.press("Shift+PageDown");
  expect(await log.evaluate((element) => element.scrollTop)).toBe(bottom);

  await page.keyboard.type("ls");
  await page.keyboard.press("Control+l");
  // The prompt is at the top of the terminal, and the lines before stay in the scrollback.
  const top = await log.evaluate((element) => element.getBoundingClientRect().top);
  const line = await inputLine(page).evaluate((element) => element.getBoundingClientRect().top);
  expect(line - top).toBeLessThan(30);
  await expect(page.locator(".terminal__page")).toHaveText("max@itdesk:~$ ls ");
  await expect(log).toContainText("line 0");
});

test("puts the focus back into the input line on a click", async ({ page }) => {
  await startGame(page);
  await page.getByRole("button", { name: "Esc Menu" }).focus();
  await page.getByRole("log").click({ position: { x: 300, y: 300 } });
  await expect(page.locator(".terminal__input")).toBeFocused();
});
