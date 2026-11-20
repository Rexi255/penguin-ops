// @vitest-environment jsdom
// Tests of the ticket panel (ADR 0097, ADR 0098, ADR 0100) in both languages: the title that names
// the ticket, the state row with its tape segments, the ticket's text, the extra goals with their
// states, the messages with their labels, the hints the player asked for and the explanation after
// solving.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { TicketPanel } from "./ticket-panel";
import { TICKET_START, type TicketProgress } from "./ticket-progress";
import { ticketTexts } from "./ticket-texts";

const content = loadBundledContent();

const LABELS: Readonly<
  Record<
    MandatoryLanguage,
    {
      stepDone: string;
      tip: string;
      hints: string;
      hint: (number: number) => string;
      solution: string;
      explanation: string;
      explanationStart: string;
      variants: string;
      variantText: string;
      example: string;
      extraGoals: string;
      floor1: string;
      open: string;
      reached: string;
      extraGoalDone: string;
    }
  >
> = {
  en: {
    stepDone: "Step done",
    tip: "Tip",
    hints: "Hints",
    hint: (number) => `Hint ${String(number)} of 3`,
    solution: "Type cd welcome.",
    explanation: "What you learned",
    explanationStart: "pwd (print working directory) shows where you are",
    variants: "Useful variants",
    variantText: "Go to the parent directory.",
    example: "Try it: cd ~/welcome",
    extraGoals: "Extra goals",
    floor1: "The switch on the first floor is next. Back up its configuration too.",
    open: "Open",
    reached: "Reached",
    extraGoalDone: "Extra goal reached",
  },
  de: {
    stepDone: "Schritt erledigt",
    tip: "Tipp",
    hints: "Hinweise",
    hint: (number) => `Hinweis ${String(number)} von 3`,
    solution: "Tippe cd welcome.",
    explanation: "Was du gelernt hast",
    explanationStart: "pwd (print working directory) zeigt, wo du bist",
    variants: "Nützliche Varianten",
    variantText: "Wechselt in das übergeordnete Verzeichnis.",
    example: "Probier es aus: cd ~/welcome",
    extraGoals: "Extraziele",
    floor1: "Als Nächstes ist der Switch im ersten Stock dran. Sichere auch seine Konfiguration.",
    open: "Offen",
    reached: "Erreicht",
    extraGoalDone: "Extraziel erreicht",
  },
};

/** The hints the panel shows, each as its label and its text. */
function shownHints(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".ticket__message--hint")].map((item) => item.textContent);
}

function renderPanel(
  progress: TicketProgress,
  levelId = "switch-backup",
  language: MandatoryLanguage = "en",
) {
  const level = content.levels.get(levelId);
  return render(
    <TextsProvider texts={createTexts(content.uiCatalogs, language)}>
      <TicketPanel
        texts={ticketTexts(content, levelId, language)}
        stepCount={level?.steps?.length ?? 0}
        extraGoals={level?.extraGoals ?? []}
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
    const { container } = renderPanel({ ...TICKET_START, completedSteps: 2, solved: true });
    expect(segments(container)).toEqual(["done", "done"]);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Solved");
    expect(status.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  test("shows no messages before the game says something", () => {
    renderPanel(TICKET_START, "first-steps");
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(document.querySelector(".ticket__messages")).toBeNull();
  });

  test.each(MANDATORY_LANGUAGES)(
    "labels every message with its kind for screen readers in %s",
    (language) => {
      const { container } = renderPanel(
        {
          ...TICKET_START,
          completedSteps: 1,
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

  test("shows no extra goals for a ticket without any", () => {
    const { container } = renderPanel(TICKET_START, "first-steps");
    expect(screen.queryByRole("heading", { name: "Extra goals" })).toBeNull();
    expect(container.querySelector(".ticket__goal")).toBeNull();
  });

  test.each(MANDATORY_LANGUAGES)(
    "lists the extra goals with their bonus XP as open from the start in %s",
    (language) => {
      const labels = LABELS[language];
      renderPanel(TICKET_START, "switch-backup", language);
      const heading = screen.getByRole("heading", { level: 3, name: labels.extraGoals });
      const items = within(heading.closest("section") ?? document.body).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual([
        `${labels.floor1}+20 XP${labels.open}`,
      ]);
      expect(items[0]?.querySelector("svg")).toBeNull();
      // The extra goals come right after the ticket's text, before the hints and messages.
      expect(heading.closest("section")?.previousElementSibling?.className).toBe("ticket__text");
    },
  );

  test.each(MANDATORY_LANGUAGES)(
    "marks a reached extra goal in words and with the icon of success in %s",
    (language) => {
      const labels = LABELS[language];
      const { container } = renderPanel(
        { ...TICKET_START, reachedExtraGoals: ["floor1"] },
        "switch-backup",
        language,
      );
      const goal = container.querySelector(".ticket__goal");
      expect(goal?.classList.contains("ticket__goal--reached")).toBe(true);
      expect(goal?.querySelector(".ticket__goal-state")?.textContent).toBe(labels.reached);
      expect(goal?.querySelector(".ticket__goal-state svg")?.getAttribute("aria-hidden")).toBe(
        "true",
      );
    },
  );

  test("draws the code in an extra goal's description", () => {
    const { container } = renderPanel(TICKET_START, "project-folders");
    expect(container.querySelector(".ticket__goal code")?.textContent).toBe("README.txt");
    expect(container.querySelector(".ticket__goal")?.getAttribute("data-extra-goal")).toBe(
      "readme",
    );
  });

  test.each(MANDATORY_LANGUAGES)(
    "announces a reached extra goal with a visible label and its bonus XP in %s",
    (language) => {
      const labels = LABELS[language];
      const { container } = renderPanel(
        {
          ...TICKET_START,
          reachedExtraGoals: ["floor1"],
          messages: [{ kind: "extra-goal", id: "floor1", xp: 20 }],
        },
        "switch-backup",
        language,
      );
      const regions = [...container.querySelectorAll("[aria-live]")];
      const message = regions[1]?.querySelector(".ticket__message--extra-goal");
      expect(message?.querySelector(".ticket__message-label")?.textContent).toBe(
        `${labels.extraGoalDone}+20 XP`,
      );
      expect(message?.querySelector(".ticket__message-text")?.textContent).toBe(
        `${labels.extraGoalDone}+20 XP${labels.floor1}`,
      );
      expect(message?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      // The list of extra goals is not a live region, so the goal is announced once.
      expect(container.querySelector(".ticket__goal")?.closest("[aria-live]")).toBeNull();
    },
  );

  test("shows no hints before the player asks for one", () => {
    const { container } = renderPanel(TICKET_START, "first-steps");
    expect(shownHints(container)).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Hints" })).toBeNull();
  });

  test.each(MANDATORY_LANGUAGES)(
    "shows the hints the player asked for in their order in %s",
    (language) => {
      const labels = LABELS[language];
      const { container } = renderPanel(
        { ...TICKET_START, hintsShown: 2 },
        "first-steps",
        language,
      );
      expect(screen.getByRole("heading", { level: 3, name: labels.hints })).toBeDefined();
      const hints = shownHints(container);
      expect(hints).toHaveLength(2);
      expect(hints[0]?.startsWith(labels.hint(1))).toBe(true);
      expect(hints[1]?.startsWith(labels.hint(2))).toBe(true);
      for (const item of container.querySelectorAll(".ticket__message--hint")) {
        expect(item.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      }
    },
  );

  test.each(MANDATORY_LANGUAGES)("shows the solution as the third hint in %s", (language) => {
    const labels = LABELS[language];
    const { container } = renderPanel({ ...TICKET_START, hintsShown: 3 }, "first-steps", language);
    const third = container.querySelectorAll(".ticket__message--hint")[2];
    expect(third?.textContent).toBe(`${labels.hint(3)}${labels.solution}`);
    expect(third?.querySelector("code")?.textContent).toBe("cd welcome");
  });

  test("announces the hints politely in a region apart from the messages", () => {
    const { container } = renderPanel({ ...TICKET_START, hintsShown: 1 }, "first-steps");
    const regions = [...container.querySelectorAll("[aria-live]")];
    expect(regions.map((region) => region.getAttribute("aria-live"))).toEqual(["polite", "polite"]);
    expect(regions[0]?.textContent).toContain("Hint 1 of 3");
    expect(regions[1]?.textContent).toBe("");
  });

  test("shows no explanation before the ticket is solved", () => {
    renderPanel({ ...TICKET_START, hintsShown: 3 }, "first-steps");
    expect(screen.queryByRole("heading", { name: "What you learned" })).toBeNull();
    expect(screen.queryByRole("term")).toBeNull();
  });

  test.each(MANDATORY_LANGUAGES)(
    "shows the explanation with its variants and example once solved in %s",
    (language) => {
      const labels = LABELS[language];
      renderPanel({ ...TICKET_START, solved: true }, "first-steps", language);
      const heading = screen.getByRole("heading", { level: 3, name: labels.explanation });
      const section = heading.closest("section");
      expect(section?.textContent).toContain(labels.explanationStart);
      const variants = screen.getByRole("heading", { level: 4, name: labels.variants });
      expect(section?.contains(variants)).toBe(true);
      // The definition list of the variants is named by their heading.
      const list = section?.querySelector("dl");
      expect(list?.getAttribute("aria-labelledby")).toBe(variants.id);
    },
  );

  test("shows the variants as commands with what they do", () => {
    const { container } = renderPanel({ ...TICKET_START, solved: true }, "first-steps", "de");
    const list = container.querySelector("dl");
    expect(screen.getAllByRole("term")).toHaveLength(2);
    expect([...(list?.querySelectorAll("dt code") ?? [])].map((code) => code.textContent)).toEqual([
      "cd ..",
      "cd ~",
    ]);
    expect(list?.querySelector("dd")?.textContent).toBe(LABELS.de.variantText);
  });

  test.each(MANDATORY_LANGUAGES)("shows the command to try as code in %s", (language) => {
    const { container } = renderPanel({ ...TICKET_START, solved: true }, "first-steps", language);
    const example = container.querySelector(".ticket__example");
    expect(example?.textContent).toBe(LABELS[language].example);
    expect(example?.querySelector("code")?.textContent).toBe("cd ~/welcome");
  });

  test("leaves out the variants and the example that a level does not have", () => {
    const texts = ticketTexts(content, "first-steps", "en");
    const { container } = render(
      <TextsProvider texts={createTexts(content.uiCatalogs, "en")}>
        <TicketPanel
          texts={{ ...texts, explanation: { text: texts.explanation.text, options: [] } }}
          stepCount={0}
          extraGoals={[]}
          progress={{ ...TICKET_START, solved: true }}
        />
      </TextsProvider>,
    );
    expect(screen.getByRole("heading", { name: "What you learned" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Useful variants" })).toBeNull();
    expect(container.querySelector("dl")).toBeNull();
    expect(container.querySelector(".ticket__example")).toBeNull();
  });

  test("scrolls a new hint into view, and the explanation from its heading once solved", () => {
    const scroll = vi.fn<Element["scrollIntoView"]>();
    Element.prototype.scrollIntoView = scroll;
    const texts = ticketTexts(content, "first-steps", "en");
    const panel = (progress: TicketProgress) => (
      <TextsProvider texts={createTexts(content.uiCatalogs, "en")}>
        <TicketPanel texts={texts} stepCount={0} extraGoals={[]} progress={progress} />
      </TextsProvider>
    );
    const view = render(panel(TICKET_START));
    expect(scroll).not.toHaveBeenCalled();
    view.rerender(panel({ ...TICKET_START, hintsShown: 1 }));
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest" });
    expect(scroll.mock.contexts[0]).toBe(view.container.querySelector(".ticket__message--hint"));
    view.rerender(panel({ ...TICKET_START, hintsShown: 1, solved: true }));
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith({ block: "start" });
    expect(scroll.mock.contexts[1]).toBe(view.container.querySelector(".ticket__explanation"));
  });

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
          extraGoals={content.levels.get("switch-backup")?.extraGoals ?? []}
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
