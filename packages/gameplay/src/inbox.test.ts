import type { Chapter } from "@penguin-ops/content";
import { describe, expect, test } from "vitest";

import {
  type CampaignProgress,
  chapterOf,
  inbox,
  isTicketOpen,
  nextTicket,
  openChapters,
  ticketState,
} from "./inbox";
import { GAME_MODES } from "./new-game";

const CHAPTERS: readonly Chapter[] = [
  { id: "first", levels: ["a1", "a2", "a3"] },
  { id: "second", levels: ["b1", "b2"] },
  { id: "third", levels: ["c1"] },
];

function progress(started: readonly string[], solved: readonly string[]): CampaignProgress {
  return { started: new Set(started), solved: new Set(solved) };
}

const solved = (...ids: string[]): ReadonlySet<string> => new Set(ids);

const ids = (chapters: readonly Chapter[]) => chapters.map((chapter) => chapter.id);

describe("ticketState", () => {
  test("is new for a level the player has not opened", () => {
    expect(ticketState(progress([], []), "a1")).toBe("new");
  });

  test("is started for an opened level that is not solved", () => {
    expect(ticketState(progress(["a1"], []), "a1")).toBe("started");
  });

  test("is solved for a solved level, started or not", () => {
    expect(ticketState(progress(["a1"], ["a1"]), "a1")).toBe("solved");
    expect(ticketState(progress([], ["a1"]), "a1")).toBe("solved");
  });
});

describe("openChapters", () => {
  test("opens only the first chapter of a new story game", () => {
    expect(ids(openChapters(CHAPTERS, "story", solved()))).toEqual(["first"]);
  });

  test("keeps the next chapter closed while one ticket of the chapter is unsolved", () => {
    expect(ids(openChapters(CHAPTERS, "story", solved("a1", "a3")))).toEqual(["first"]);
  });

  test("opens the next chapter when every ticket of the chapter is solved", () => {
    expect(ids(openChapters(CHAPTERS, "story", solved("a3", "a1", "a2")))).toEqual([
      "first",
      "second",
    ]);
  });

  test("opens every chapter when every ticket is solved", () => {
    const all = solved("a1", "a2", "a3", "b1", "b2", "c1");
    expect(ids(openChapters(CHAPTERS, "story", all))).toEqual(["first", "second", "third"]);
  });

  test("never skips a chapter whose tickets are unsolved", () => {
    // Solving a later chapter's tickets (for example in an old save) opens nothing past it.
    expect(ids(openChapters(CHAPTERS, "story", solved("b1", "b2", "c1")))).toEqual(["first"]);
  });

  test("opens every chapter of a sandbox game from the start", () => {
    expect(ids(openChapters(CHAPTERS, "sandbox", solved()))).toEqual(["first", "second", "third"]);
  });

  test.each(GAME_MODES)("gives no chapter for content without chapters in %s", (mode) => {
    expect(openChapters([], mode, solved())).toEqual([]);
  });
});

describe("inbox", () => {
  test("lists the open chapters with the state of every ticket", () => {
    expect(inbox(CHAPTERS, "story", progress(["a1", "a2"], ["a2"]))).toEqual([
      {
        id: "first",
        tickets: [
          { levelId: "a1", state: "started" },
          { levelId: "a2", state: "solved" },
          { levelId: "a3", state: "new" },
        ],
      },
    ]);
  });

  test("adds the next chapter in story mode once the chapter is solved", () => {
    const result = inbox(CHAPTERS, "story", progress(["a1"], ["a1", "a2", "a3"]));
    expect(result.map((chapter) => chapter.id)).toEqual(["first", "second"]);
    expect(result[1]?.tickets).toEqual([
      { levelId: "b1", state: "new" },
      { levelId: "b2", state: "new" },
    ]);
  });

  test("lists every chapter in sandbox mode", () => {
    const result = inbox(CHAPTERS, "sandbox", progress(["c1"], []));
    expect(result.map((chapter) => chapter.id)).toEqual(["first", "second", "third"]);
    expect(result[2]?.tickets).toEqual([{ levelId: "c1", state: "started" }]);
  });
});

describe("isTicketOpen", () => {
  test("is true for every ticket of an open chapter, solved or not", () => {
    expect(isTicketOpen(CHAPTERS, "story", solved(), "a3")).toBe(true);
    expect(isTicketOpen(CHAPTERS, "story", solved("a1"), "a1")).toBe(true);
  });

  test("is false for a ticket of a closed chapter in story mode", () => {
    expect(isTicketOpen(CHAPTERS, "story", solved("a1", "a2"), "b1")).toBe(false);
  });

  test("is true for every ticket in sandbox mode", () => {
    expect(isTicketOpen(CHAPTERS, "sandbox", solved(), "c1")).toBe(true);
  });

  test.each(GAME_MODES)("is false for a level no chapter holds in %s", (mode) => {
    expect(isTicketOpen(CHAPTERS, mode, solved(), "missing")).toBe(false);
  });
});

describe("chapterOf", () => {
  test("is the chapter that holds the level", () => {
    expect(chapterOf(CHAPTERS, "b2").id).toBe("second");
    expect(chapterOf(CHAPTERS, "a1").id).toBe("first");
  });

  test("throws for a level that no chapter holds", () => {
    expect(() => chapterOf(CHAPTERS, "missing")).toThrow('No chapter holds the level "missing".');
  });
});

describe("nextTicket", () => {
  test("is the next ticket of the chapter after a solved one", () => {
    expect(nextTicket(CHAPTERS, "story", solved("a1"), "a1")).toBe("a2");
  });

  test("skips solved tickets after the level", () => {
    expect(nextTicket(CHAPTERS, "story", solved("a1", "a2"), "a1")).toBe("a3");
  });

  test("goes back to an unsolved ticket before the level at the end of the open tickets", () => {
    expect(nextTicket(CHAPTERS, "story", solved("a3", "a2"), "a3")).toBe("a1");
  });

  test("is the first ticket of the chapter that the last solved ticket opened", () => {
    expect(nextTicket(CHAPTERS, "story", solved("a1", "a2", "a3"), "a3")).toBe("b1");
  });

  test("goes on into the next chapter in sandbox mode", () => {
    expect(nextTicket(CHAPTERS, "sandbox", solved("a3"), "a3")).toBe("b1");
  });

  test("goes back to the first chapter in sandbox mode after the last ticket", () => {
    expect(nextTicket(CHAPTERS, "sandbox", solved("c1"), "c1")).toBe("a1");
  });

  test("is never the level itself, even when it is unsolved", () => {
    expect(nextTicket(CHAPTERS, "story", solved(), "a2")).toBe("a3");
    expect(nextTicket([{ id: "only", levels: ["x"] }], "story", solved(), "x")).toBeUndefined();
  });

  test.each(GAME_MODES)("is undefined when every ticket is solved in %s", (mode) => {
    const all = solved("a1", "a2", "a3", "b1", "b2", "c1");
    expect(nextTicket(CHAPTERS, mode, all, "c1")).toBeUndefined();
  });

  test("is the first open unsolved ticket for a level no open chapter holds", () => {
    expect(nextTicket(CHAPTERS, "story", solved("a1"), "c1")).toBe("a2");
  });
});
