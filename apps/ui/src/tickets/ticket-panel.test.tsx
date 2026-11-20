// @vitest-environment jsdom
// Tests of the ticket panel (ADR 0097) in both languages: the title that names the ticket, the
// state row with its tape segments, the ticket's text, and the messages with their labels.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { TicketPanel } from "./ticket-panel";
import { TICKET_START, type TicketProgress } from "./ticket-progress";
import { ticketTexts } from "./ticket-texts";

const content = loadBundledContent();

const LABELS: Readonly<Record<MandatoryLanguage, { stepDone: string; tip: string }>> = {
  en: { stepDone: "Step done", tip: "Tip" },
  de: { stepDone: "Schritt erledigt", tip: "Tipp" },
};

function renderPanel(
  progress: TicketProgress,
  levelId = "switch-backup",
  language: MandatoryLanguage = "en",
) {
  const stepCount = content.levels.get(levelId)?.steps?.length ?? 0;
  return render(
    <TextsProvider texts={createTexts(content.uiCatalogs, language)}>
      <TicketPanel
        texts={ticketTexts(content, levelId, language)}
        stepCount={stepCount}
        progress={progress}
      />
    </TextsProvider>,
  );
}

function segments(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".ticket__segment")].map((segment) =>
    segment.className.replace("ticket__segment ticket__segment--", ""),
  );
}

beforeAll(() => {
  // jsdom lays nothing out, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn<Element["scrollIntoView"]>();
});

afterEach(() => {
  cleanup();
});

describe("TicketPanel", () => {
  test("names the ticket by its title", () => {
    renderPanel(TICKET_START);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Backup before the switch update");
    expect(screen.getByRole("article", { name: "Backup before the switch update" })).toBeDefined();
  });

  test("draws the ticket's paragraphs and list with code", () => {
    renderPanel(TICKET_START);
    const text = screen.getByRole("article").querySelector(".ticket__text");
    expect(text?.querySelectorAll("p")).toHaveLength(2);
    expect(text?.querySelectorAll("li")).toHaveLength(2);
    expect(text?.querySelector("li code")?.textContent).toBe("~/network/switch-floor2.conf");
  });

  test("shows no state and no segments for a ticket with a single goal", () => {
    const { container } = renderPanel(TICKET_START, "first-steps");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(segments(container)).toEqual([]);
  });

  test("hides the segments from screen readers, which read the step's text", () => {
    const { container } = renderPanel({ ...TICKET_START, completedSteps: 1 });
    expect(segments(container)).toEqual(["done", "current"]);
    const row = container.querySelector(".ticket__segments");
    expect(row?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Step 2 of 2");
  });

  test("shows a solved ticket with every segment printed", () => {
    const { container } = renderPanel({ completedSteps: 2, solved: true, messages: [] });
    expect(segments(container)).toEqual(["done", "done"]);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Solved");
    expect(status.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  test("shows no messages before the game says something", () => {
    renderPanel(TICKET_START);
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(document.querySelector(".ticket__messages")).toBeNull();
  });

  test.each(MANDATORY_LANGUAGES)(
    "labels every message with its kind for screen readers in %s",
    (language) => {
      const { container } = renderPanel(
        {
          completedSteps: 1,
          solved: false,
          messages: [
            { kind: "tip", say: "tip-moved-config" },
            { kind: "step", say: "step-backup" },
          ],
        },
        "switch-backup",
        language,
      );
      const items = [...container.querySelectorAll(".ticket__message")];
      expect(items.map((item) => item.querySelector(".visually-hidden")?.textContent)).toEqual([
        LABELS[language].tip,
        LABELS[language].stepDone,
      ]);
      expect(items.map((item) => item.classList.contains("ticket__message--tip"))).toEqual([
        true,
        false,
      ]);
      for (const item of items) {
        expect(item.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
        expect(item.querySelector(".ticket__message-text p")).not.toBeNull();
      }
    },
  );

  test("scrolls the newest message into view", () => {
    const scroll = vi.fn<Element["scrollIntoView"]>();
    Element.prototype.scrollIntoView = scroll;
    const view = renderPanel(TICKET_START);
    expect(scroll).not.toHaveBeenCalled();
    view.rerender(
      <TextsProvider texts={createTexts(content.uiCatalogs, "en")}>
        <TicketPanel
          texts={ticketTexts(content, "switch-backup", "en")}
          stepCount={2}
          progress={{ ...TICKET_START, messages: [{ kind: "tip", say: "tip-moved-config" }] }}
        />
      </TextsProvider>,
    );
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest" });
    expect(scroll.mock.contexts[0]).toBe(
      view.container.querySelector(".ticket__message:last-child"),
    );
  });
});
