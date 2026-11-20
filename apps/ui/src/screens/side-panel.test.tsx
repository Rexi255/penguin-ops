// @vitest-environment jsdom
// Tests of the side panel's tabs (ROADMAP M3.4, ADR 0096) in both languages: the WAI-ARIA tabs
// pattern with its names, states and keys, the mouse, and the panels: the ticket the game screen
// gives the tickets panel (ADR 0097) and the empty states of mail and handbook.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { SIDE_PANEL_TABS, SidePanel, tabAfterKey } from "./side-panel";

const { uiCatalogs } = loadBundledContent();

const EXPECTED: Readonly<
  Record<
    MandatoryLanguage,
    {
      tabs: string;
      tickets: string;
      mail: string;
      handbook: string;
      mailEmpty: string;
      handbookEmpty: string;
    }
  >
> = {
  en: {
    tabs: "Panels",
    tickets: "Tickets",
    mail: "Mail",
    handbook: "Handbook",
    mailEmpty: "No mail yet.",
    handbookEmpty: "The commands you learn will appear here.",
  },
  de: {
    tabs: "Bereiche",
    tickets: "Tickets",
    mail: "Mails",
    handbook: "Handbuch",
    mailEmpty: "Noch keine Mails.",
    handbookEmpty: "Hier erscheinen die Befehle, die du lernst.",
  },
};

function renderSidePanel(language: MandatoryLanguage = "en") {
  return render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <SidePanel tickets={<p>The printer on the second floor prints blank pages.</p>} />
    </TextsProvider>,
  );
}

function tab(name: string) {
  return screen.getByRole("tab", { name });
}

/** The visible panel; the hidden ones are not in the accessibility tree. */
function visiblePanel() {
  return screen.getByRole("tabpanel");
}

afterEach(() => {
  cleanup();
});

describe("tabAfterKey", () => {
  test("moves left and right and wraps around at the ends", () => {
    expect(tabAfterKey("ArrowRight", 0)).toBe("mail");
    expect(tabAfterKey("ArrowRight", 1)).toBe("handbook");
    expect(tabAfterKey("ArrowRight", 2)).toBe("tickets");
    expect(tabAfterKey("ArrowLeft", 2)).toBe("mail");
    expect(tabAfterKey("ArrowLeft", 0)).toBe("handbook");
  });

  test("goes to the first tab with Home and the last with End", () => {
    expect(tabAfterKey("Home", 2)).toBe("tickets");
    expect(tabAfterKey("End", 0)).toBe("handbook");
  });

  test("leaves every other key alone", () => {
    for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "Tab", "a", "F1"]) {
      expect(tabAfterKey(key, 1)).toBeUndefined();
    }
  });
});

describe("SidePanel", () => {
  test.each(MANDATORY_LANGUAGES)("shows the three tabs in a named tab list in %s", (language) => {
    renderSidePanel(language);
    const expected = EXPECTED[language];
    const tabList = screen.getByRole("tablist", { name: expected.tabs });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((element) => element.textContent)).toEqual([
      expected.tickets,
      expected.mail,
      expected.handbook,
    ]);
    for (const element of tabs) {
      expect(tabList.contains(element)).toBe(true);
      // Each tab shows its icon next to its label; the icon is hidden from screen readers.
      expect(element.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  test.each(MANDATORY_LANGUAGES)(
    "shows the empty states of mail and handbook in %s",
    async (language) => {
      renderSidePanel(language);
      const expected = EXPECTED[language];
      await userEvent.click(tab(expected.mail));
      expect(visiblePanel().textContent).toBe(expected.mailEmpty);
      await userEvent.click(tab(expected.handbook));
      expect(visiblePanel().textContent).toBe(expected.handbookEmpty);
    },
  );

  test("starts with the tickets tab chosen and shows the tickets it gets", () => {
    renderSidePanel();
    expect(tab("Tickets").getAttribute("aria-selected")).toBe("true");
    expect(tab("Mail").getAttribute("aria-selected")).toBe("false");
    expect(tab("Handbook").getAttribute("aria-selected")).toBe("false");
    const panel = visiblePanel();
    expect(panel.textContent).toBe("The printer on the second floor prints blank pages.");
    // A panel with text takes the focus, so the keyboard reaches its text.
    expect(panel.tabIndex).toBe(0);
  });

  test("links every tab with its panel", () => {
    const { container } = renderSidePanel();
    const panels = container.querySelectorAll('[role="tabpanel"]');
    expect(panels).toHaveLength(SIDE_PANEL_TABS.length);
    for (const element of screen.getAllByRole("tab")) {
      const panel = document.getElementById(element.getAttribute("aria-controls") ?? "");
      expect(panel?.getAttribute("role")).toBe("tabpanel");
      expect(panel?.getAttribute("aria-labelledby")).toBe(element.id);
    }
  });

  test("keeps only the chosen tab in the tab order", async () => {
    renderSidePanel();
    expect(screen.getAllByRole("tab").map((element) => element.tabIndex)).toEqual([0, -1, -1]);
    await userEvent.click(tab("Handbook"));
    expect(screen.getAllByRole("tab").map((element) => element.tabIndex)).toEqual([-1, -1, 0]);
  });

  test("chooses a tab and shows only its panel when the player clicks it", async () => {
    const { container } = renderSidePanel();
    await userEvent.click(tab("Mail"));
    expect(tab("Mail").getAttribute("aria-selected")).toBe("true");
    expect(tab("Tickets").getAttribute("aria-selected")).toBe("false");
    const shown = [...container.querySelectorAll('[role="tabpanel"]')].filter(
      (panel) => !panel.hasAttribute("hidden"),
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]?.getAttribute("aria-labelledby")).toBe(tab("Mail").id);
  });

  test("moves the focus and the choice with the arrow keys, Home and End", async () => {
    renderSidePanel();
    tab("Tickets").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(tab("Mail")).toBe(document.activeElement);
    expect(tab("Mail").getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(tab("Tickets")).toBe(document.activeElement);
    await userEvent.keyboard("{ArrowLeft}");
    expect(tab("Handbook")).toBe(document.activeElement);
    expect(visiblePanel().textContent).toBe("The commands you learn will appear here.");
    await userEvent.keyboard("{Home}");
    expect(tab("Tickets")).toBe(document.activeElement);
    await userEvent.keyboard("{End}");
    expect(tab("Handbook")).toBe(document.activeElement);
  });

  test("ignores the arrow keys together with a modifier", async () => {
    renderSidePanel();
    tab("Tickets").focus();
    await userEvent.keyboard("{Control>}{ArrowRight}{/Control}{Shift>}{ArrowRight}{/Shift}");
    await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(tab("Tickets")).toBe(document.activeElement);
    expect(tab("Tickets").getAttribute("aria-selected")).toBe("true");
  });

  test("ignores other keys on a tab", async () => {
    renderSidePanel();
    tab("Tickets").focus();
    await userEvent.keyboard("{ArrowDown}{ArrowUp}m");
    expect(tab("Tickets")).toBe(document.activeElement);
    expect(tab("Tickets").getAttribute("aria-selected")).toBe("true");
  });

  test.each(SIDE_PANEL_TABS)(
    "goes from the chosen tab to its panel with Tab when %s is chosen",
    async (chosen) => {
      renderSidePanel();
      const names = { tickets: "Tickets", mail: "Mail", handbook: "Handbook" } as const;
      await userEvent.click(tab(names[chosen]));
      await userEvent.tab();
      expect(visiblePanel()).toBe(document.activeElement);
    },
  );

  test("marks every tab with the cable colour of its kind of work", () => {
    renderSidePanel();
    expect(tab("Tickets").classList.contains("side-panel__tab--ticket")).toBe(true);
    expect(tab("Mail").classList.contains("side-panel__tab--mail")).toBe(true);
    expect(tab("Handbook").classList.contains("side-panel__tab--handbook")).toBe(true);
  });
});
