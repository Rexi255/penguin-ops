// Runs axe-core in the app window and returns the violations it finds, one line per rule with the
// number of elements that break it, so that a failing test names them.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { Page } from "@playwright/test";
import type { AxeResults } from "axe-core";

// The axe-core rule sets that the game must meet: WCAG 2.2 A and AA, and axe's best practices.
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const AXE_SOURCE = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

/** The accessibility violations of the page as it is now. */
export async function axeViolations(page: Page): Promise<string[]> {
  // Evaluated through the DevTools protocol, which the page's Content Security Policy does not
  // restrict; a script tag would be blocked by it.
  await page.evaluate(AXE_SOURCE);
  const results = await page.evaluate(async (tags): Promise<AxeResults> => {
    const { axe } = globalThis as unknown as { axe: typeof import("axe-core") };
    return axe.run(document, { runOnly: { type: "tag", values: tags } });
  }, AXE_TAGS);
  return results.violations.map(({ id, nodes }) => `${id}: ${String(nodes.length)}`);
}
