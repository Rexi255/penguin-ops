// The settings that act on the whole page (ROADMAP M3.8c, ADR 0110): the font size scales the
// root font size, on which every size of the design's type scale and spacing is built (rem), so
// the whole interface grows with it, the terminal's character cell included. "Reduce motion" is
// an attribute of the root element that tokens.css reads: `on` and `off` override the system's
// setting (`prefers-reduced-motion`), `system` follows it.

import type { Settings } from "@penguin-ops/gameplay";

/** Applies the font size and "reduce motion" of `settings` to the page's root element `root`. */
export function applyDocumentSettings(
  root: HTMLElement,
  settings: Pick<Settings, "fontSize" | "reduceMotion">,
): void {
  // The browser's default root size is the design's 100 percent (16 px, ADR 0085).
  root.style.fontSize = settings.fontSize === 100 ? "" : `${String(settings.fontSize)}%`;
  root.dataset["reduceMotion"] = settings.reduceMotion;
}
