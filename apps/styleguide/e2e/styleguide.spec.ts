// Browser tests of the styleguide page (ROADMAP M3.0c, ADR 0083): it shows every design token with
// the real styles, works with the keyboard and has no accessibility violations that axe-core finds.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import type { AxeResults } from "axe-core";
import { expect, test, type Page } from "@playwright/test";

const TOKENS_CSS = readFileSync(join(import.meta.dirname, "../../ui/src/tokens.css"), "utf8");

/**
 * The custom properties that tokens.css defines with their default values: the declarations of
 * the first `:root` block. Read with a plain pattern on purpose, independent of the page's own
 * reader in apps/ui.
 */
function definedTokens(): Map<string, string> {
  const rootBlock = /:root\s*\{([^}]*)\}/.exec(TOKENS_CSS.replace(/\/\*[\s\S]*?\*\//g, ""));
  const body = rootBlock?.[1] ?? "";
  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
      ([, name = "", value = ""]) => [name, value.trim().replace(/\s+/g, " ")] as const,
    ),
  );
}

/** `#rrggbb` as the `rgb(r, g, b)` that getComputedStyle reports. */
function hexToRgb(hex: string): string {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${channels.join(", ")})`;
}

// The axe-core rule sets that the game must meet: WCAG 2.2 A and AA, and axe's best practices.
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function runAxe(page: Page): Promise<AxeResults> {
  const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async (tags) => {
    const { axe } = globalThis as unknown as { axe: typeof import("axe-core") };
    return axe.run(document, { runOnly: { type: "tag", values: tags } });
  }, AXE_TAGS);
}

async function openStyleguide(page: Page): Promise<void> {
  await page.goto("/styleguide.html");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Styleguide");
}

test("loads without errors in the console", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await openStyleguide(page);
  expect(errors).toEqual([]);
});

test("shows every design token of tokens.css with its value", async ({ page }) => {
  await openStyleguide(page);
  const tokens = definedTokens();
  expect(tokens.size).toBeGreaterThan(0);
  const shown = await page
    .locator("[data-token]")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-token")));
  expect(shown.toSorted()).toEqual([...tokens.keys()].toSorted());
  for (const [name, value] of tokens) {
    await expect(page.locator(`[data-token="${name}"] .sg-token__value`)).toHaveText(value);
  }
  await expect(page.getByRole("heading", { name: "Unsorted tokens" })).toHaveCount(0);
});

test("draws every colour swatch in the token's colour", async ({ page }) => {
  await openStyleguide(page);
  const colors = [...definedTokens()].filter(([name]) => name.startsWith("--color-"));
  expect(colors.length).toBeGreaterThan(0);
  for (const [name, value] of colors) {
    await expect(page.locator(`[data-token="${name}"] .sg-swatch`)).toHaveCSS(
      "background-color",
      hexToRgb(value),
    );
  }
});

test("lists contrast pairs that all pass", async ({ page }) => {
  await openStyleguide(page);
  const results = page.locator("[data-section=contrast] tbody tr td:last-child");
  expect(await results.count()).toBeGreaterThan(0);
  expect(new Set(await results.allTextContents())).toEqual(new Set(["Passes"]));
});

test("measures the spacing tokens in steps of a quarter cell", async ({ page }) => {
  await openStyleguide(page);
  // 1rem is 16 px in the test browser, so one cell height is 24 px.
  await expect(page.locator('[data-token="--space-1"] .sg-measure__pixels')).toHaveText("6 px");
  await expect(page.locator('[data-token="--space-8"] .sg-measure__pixels')).toHaveText("48 px");
  await expect(page.locator('[data-token="--cell-inline"] .sg-measure__pixels')).toHaveText(
    "9.6 px",
  );
});

test("shows the focus ring when a control is reached with the keyboard", async ({ page }) => {
  await openStyleguide(page);
  const button = page.getByRole("button", { name: "Focus me with Tab" });
  for (
    let step = 0;
    step < 20 && !(await button.evaluate((el) => el === document.activeElement));
    step++
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS("outline-style", "solid");
  await expect(button).toHaveCSS("outline-width", "2px");
  await expect(button).toHaveCSS("outline-offset", "2px");
});

test("prints the tape at the print speed, and at once with reduce motion", async ({ page }) => {
  await openStyleguide(page);
  const tape = page.locator(".sg-tape--printing");
  await expect(tape).toHaveCSS("animation-duration", "0.48s");
  await expect(tape).toHaveCSS("animation-timing-function", "linear");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(tape).toHaveCSS("animation-duration", "0s");

  await page.getByRole("button", { name: "Print again" }).click();
  await expect(page.locator(".sg-tape--printing")).toHaveCount(1);
});

test("has no accessibility violations", async ({ page }) => {
  await openStyleguide(page);
  const results = await runAxe(page);
  const violations = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`,
  );
  expect(violations).toEqual([]);
});

test("has no accessibility violations on a narrow window", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openStyleguide(page);
  const results = await runAxe(page);
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
