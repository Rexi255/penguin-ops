// @vitest-environment jsdom
// Tests of what follows a solved ticket (ADR 0099) in both languages: the next ticket as a row
// that opens it, the chapter that solving opened, and the sentence when every open ticket is
// solved.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { NextTicket, type NextTicketOffer } from "./next-ticket";
import { ticketTexts } from "./ticket-texts";

const content = loadBundledContent();

const EXPECTED: Readonly<
  Record<MandatoryLanguage, { next: string; row: string; chapterOpen: string; allSolved: string }>
> = {
  en: {
    next: "Next ticket",
    row: "The printer on the second floor New",
    chapterOpen: "A new chapter is open: What others left behind",
    allSolved: "Every ticket in your inbox is solved.",
  },
  de: {
    next: "Nächstes Ticket",
    row: "Der Drucker im zweiten Stock Neu",
    chapterOpen: "Ein neues Kapitel ist offen: Was andere liegen ließen",
    allSolved: "Alle Tickets in deinem Posteingang sind gelöst.",
  },
};

function offer(language: MandatoryLanguage, opensChapter: boolean): NextTicketOffer {
  const texts = createTexts(content.uiCatalogs, language);
  const base = {
    ticket: { levelId: "printer-floor2", state: "new" as const },
    title: ticketTexts(content, "printer-floor2", language).title,
  };
  return opensChapter ? { ...base, openedChapter: texts.chapterTitle("left-behind") } : base;
}

function renderNext(next: NextTicketOffer | undefined, language: MandatoryLanguage = "en") {
  const onOpen = vi.fn<(levelId: string) => void>();
  render(
    <TextsProvider texts={createTexts(content.uiCatalogs, language)}>
      <NextTicket next={next} onOpen={onOpen} />
    </TextsProvider>,
  );
  return { onOpen };
}

afterEach(() => {
  cleanup();
});

describe("NextTicket", () => {
  test.each(MANDATORY_LANGUAGES)(
    "offers the next ticket with the chapter it opened in %s",
    (language) => {
      const expected = EXPECTED[language];
      renderNext(offer(language, true), language);
      const section = screen.getByRole("region", { name: expected.next });
      expect(screen.getByRole("heading", { level: 3, name: expected.next })).toBeDefined();
      expect(section.querySelector(".next-ticket__text")?.textContent).toBe(expected.chapterOpen);
      expect(section.querySelector("strong")?.textContent).toBe(
        expected.chapterOpen.slice(expected.chapterOpen.indexOf(": ") + 2),
      );
      expect(screen.getByRole("button").textContent).toBe(expected.row);
    },
  );

  test("offers the next ticket alone when it opened no chapter", () => {
    renderNext(offer("en", false));
    expect(document.querySelector(".next-ticket__text")).toBeNull();
    expect(screen.getByRole("button", { name: EXPECTED.en.row })).toBeDefined();
  });

  test("opens the next ticket", async () => {
    const { onOpen } = renderNext(offer("en", false));
    await userEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("printer-floor2");
  });

  test("never marks the next ticket as the current one", () => {
    renderNext(offer("en", true));
    expect(screen.getByRole("button").hasAttribute("aria-current")).toBe(false);
  });

  test.each(MANDATORY_LANGUAGES)(
    "says that every ticket is solved when there is none in %s",
    (language) => {
      const expected = EXPECTED[language];
      renderNext(undefined, language);
      expect(screen.getByRole("region", { name: expected.next }).textContent).toBe(
        `${expected.next}${expected.allSolved}`,
      );
      expect(screen.queryByRole("button")).toBeNull();
    },
  );
});
