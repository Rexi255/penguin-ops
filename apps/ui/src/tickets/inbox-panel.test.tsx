// @vitest-environment jsdom
// Tests of the chapter inbox (ADR 0099) in both languages: the heading, each open chapter with its
// title and how many of its tickets are solved, the rows with their kind's icon, title and state in
// words, the current ticket, and the rows that open their ticket.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { type InboxChapter } from "@penguin-ops/gameplay";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { InboxPanel, titleOf } from "./inbox-panel";
import { ticketTexts } from "./ticket-texts";

const content = loadBundledContent();

const CHAPTERS: readonly InboxChapter[] = [
  { id: "first-day", tickets: [{ levelId: "first-steps", state: "solved" }] },
  {
    id: "tidying-up",
    tickets: [
      { levelId: "project-folders", state: "solved" },
      { levelId: "switch-backup", state: "started" },
      { levelId: "disk-full", state: "new" },
    ],
  },
];

const EXPECTED: Readonly<
  Record<
    MandatoryLanguage,
    {
      inbox: string;
      chapters: readonly string[];
      progress: readonly string[];
      rows: readonly string[];
    }
  >
> = {
  en: {
    inbox: "Inbox",
    chapters: ["First day", "Tidying up"],
    progress: ["1 of 1 solved", "1 of 3 solved"],
    rows: [
      "First steps Solved",
      "New project folders Solved",
      "Backup before the switch update In progress",
      "Disk full! New",
    ],
  },
  de: {
    inbox: "Posteingang",
    chapters: ["Der erste Tag", "Aufräumen"],
    progress: ["1 von 1 gelöst", "1 von 3 gelöst"],
    rows: [
      "Erste Schritte Gelöst",
      "Neue Projektordner Gelöst",
      "Backup vor dem Switch-Update Begonnen",
      "Platte voll! Neu",
    ],
  },
};

function titles(language: MandatoryLanguage) {
  return new Map(
    [...content.levels.keys()].map((levelId) => [
      levelId,
      ticketTexts(content, levelId, language).title,
    ]),
  );
}

function renderInbox(language: MandatoryLanguage = "en", current = "switch-backup") {
  const onOpen = vi.fn<(levelId: string) => void>();
  const currentRef = createRef<HTMLButtonElement>();
  render(
    <TextsProvider texts={createTexts(content.uiCatalogs, language)}>
      <InboxPanel
        chapters={CHAPTERS}
        titles={titles(language)}
        current={current}
        onOpen={onOpen}
        currentRef={currentRef}
      />
    </TextsProvider>,
  );
  return { onOpen, currentRef };
}

afterEach(() => {
  cleanup();
});

describe("InboxPanel", () => {
  test.each(MANDATORY_LANGUAGES)("shows the open chapters with their tickets in %s", (language) => {
    renderInbox(language);
    const expected = EXPECTED[language];
    const inbox = screen.getByRole("region", { name: expected.inbox });
    expect(screen.getByRole("heading", { level: 2, name: expected.inbox })).toBeDefined();
    const chapters = within(inbox).getAllByRole("region");
    expect(chapters.map((chapter) => chapter.getAttribute("aria-labelledby") !== null)).toEqual([
      true,
      true,
    ]);
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(expected.chapters);
    expect(
      [...document.querySelectorAll(".inbox__progress")].map((line) => line.textContent),
    ).toEqual(expected.progress);
    expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual(expected.rows);
    expect(screen.getAllByRole("list")).toHaveLength(2);
  });

  test.each(MANDATORY_LANGUAGES)("names each chapter's region by its title in %s", (language) => {
    renderInbox(language);
    for (const title of EXPECTED[language].chapters) {
      expect(screen.getByRole("region", { name: title })).toBeDefined();
    }
  });

  test("marks only the current ticket and hands its row to the game screen", () => {
    const { currentRef } = renderInbox();
    const rows = screen.getAllByRole("button");
    expect(rows.map((row) => row.getAttribute("aria-current"))).toEqual([null, null, "true", null]);
    expect(currentRef.current).toBe(rows[2]);
  });

  test("shows a solved ticket with the solved icon, and the kind's icon on every row", () => {
    renderInbox();
    const rows = screen.getAllByRole("button");
    for (const row of rows) {
      expect(row.querySelectorAll(".inbox-ticket__kind svg")).toHaveLength(1);
    }
    expect(rows[0]?.querySelectorAll(".inbox-ticket__state--solved svg")).toHaveLength(1);
    expect(rows[2]?.querySelector(".inbox-ticket__state--solved")).toBeNull();
    expect(rows[3]?.querySelector(".inbox-ticket__state svg")).toBeNull();
  });

  test("opens the ticket of a row that is clicked or chosen with Enter", async () => {
    const { onOpen } = renderInbox();
    await userEvent.click(screen.getByRole("button", { name: "Disk full! New" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("disk-full");
    screen.getByRole("button", { name: "First steps Solved" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenLastCalledWith("first-steps");
  });

  test("opens the current ticket too", async () => {
    const { onOpen } = renderInbox();
    await userEvent.click(
      screen.getByRole("button", { name: "Backup before the switch update In progress" }),
    );
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("switch-backup");
  });
});

describe("titleOf", () => {
  test("is the title of the level", () => {
    expect(titleOf(titles("en"), "disk-full")).toEqual([{ type: "text", text: "Disk full!" }]);
  });

  test("throws for a level without a title", () => {
    expect(() => titleOf(new Map(), "missing")).toThrow(
      'There is no title of the level "missing".',
    );
  });
});
