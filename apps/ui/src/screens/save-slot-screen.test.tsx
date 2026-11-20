// @vitest-environment jsdom
// Tests of the save slot screen in both languages: three slots, empty ones that open the new game
// screen and ones with a game that resume it with their details, locked slots that say why, the
// slot that has the focus, Back, which also answers to Esc, the slot menu and the question before
// a slot is deleted (ADR 0106), and the messages about a slot.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { newSaveGame, type SaveGame } from "@penguin-ops/gameplay";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { EMPTY_SLOT, type SlotState } from "../saves/save-slots";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import {
  lastPlayedText,
  type PendingImport,
  SAVE_SLOT_COUNT,
  SaveSlotScreen,
  type SlotMessage,
} from "./save-slot-screen";

const { uiCatalogs } = loadBundledContent();

const EXPECTED: Readonly<
  Record<
    MandatoryLanguage,
    {
      title: string;
      slots: string[];
      state: string;
      names: readonly [string, string, string];
      back: string;
    }
  >
> = {
  en: {
    title: "Choose a save slot",
    slots: ["Slot 1", "Slot 2", "Slot 3"],
    state: "New game",
    names: ["Slot 1 New game", "Slot 2 New game", "Slot 3 New game"],
    back: "Back",
  },
  de: {
    title: "Spielstand wählen",
    slots: ["Spielstand 1", "Spielstand 2", "Spielstand 3"],
    state: "Neues Spiel",
    names: ["Spielstand 1 Neues Spiel", "Spielstand 2 Neues Spiel", "Spielstand 3 Neues Spiel"],
    back: "Zurück",
  },
};

const EMPTY: readonly SlotState[] = [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT];

/** A real time in milliseconds: 2026-11-20, 10:00 UTC. */
const LAST_PLAYED = 1_795_168_800_000;

function game(save: SaveGame): SlotState {
  return { kind: "game", save };
}

/** Jörg's game: one of two tickets solved, 72 minutes played. */
const JOERG = game({
  ...newSaveGame(
    { playerName: "Jörg Müller", userName: "joerg-mueller", mode: "story" },
    "first-steps",
    LAST_PLAYED,
  ),
  playTime: 72 * 60_000 + 59_000,
  currentTicket: "printer-floor2",
  tickets: [
    { level: "first-steps", solved: true, hintsShown: 0, reachedExtraGoals: [] },
    { level: "printer-floor2", solved: false, hintsShown: 0, reachedExtraGoals: [] },
  ],
});

/** Zoë's game: nothing solved, five minutes played. */
const ZOE = game({
  ...newSaveGame(
    { playerName: "Zoë **Bold**", userName: "zoe", mode: "sandbox" },
    "first-steps",
    LAST_PLAYED,
  ),
  playTime: 5 * 60_000,
});

const DAMAGED: SlotState = { kind: "locked", lock: "damaged" };
const TOO_NEW: SlotState = { kind: "locked", lock: "too-new" };
const TAKEN: SlotState = { kind: "locked", lock: "user-name-taken" };

function renderSaveSlotScreen(
  language: MandatoryLanguage,
  slots: readonly SlotState[] = EMPTY,
  focusedSlot = 0,
  message?: SlotMessage,
  pendingImport?: PendingImport,
) {
  const onNewGame = vi.fn<(index: number) => void>();
  const onContinue = vi.fn<(index: number) => void>();
  const onDelete = vi.fn<(index: number) => void>();
  const onExport = vi.fn<(index: number) => void>();
  const onImport = vi.fn<(index: number) => void>();
  const onConfirmImport = vi.fn<() => void>();
  const onCancelImport = vi.fn<() => void>();
  const onBack = vi.fn<() => void>();
  const screenFor = (pending: PendingImport | undefined) => (
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <SaveSlotScreen
        slots={slots}
        focusedSlot={focusedSlot}
        message={message}
        onNewGame={onNewGame}
        onContinue={onContinue}
        onDelete={onDelete}
        onExport={onExport}
        onImport={onImport}
        pendingImport={pending}
        onConfirmImport={onConfirmImport}
        onCancelImport={onCancelImport}
        onBack={onBack}
      />
    </TextsProvider>
  );
  const view = render(screenFor(pendingImport));
  /** Shows the screen again with another pending import, as the app does. */
  const setPendingImport = (pending: PendingImport | undefined) => {
    view.rerender(screenFor(pending));
  };
  return {
    onNewGame,
    onContinue,
    onDelete,
    onExport,
    onImport,
    onConfirmImport,
    onCancelImport,
    onBack,
    view,
    setPendingImport,
  };
}

/** Matches an accessible name that starts with `start`, for slots named by their details too. */
function startsWith(start: string): (name: string) => boolean {
  return (name) => name.startsWith(start);
}

/** The slot buttons, without the buttons of the slot menus. */
function slotButtons() {
  return within(screen.getByRole("list")).getAllByRole("button", {
    name: /^(Slot|Spielstand) \d/u,
  });
}

afterEach(() => {
  cleanup();
});

describe("SaveSlotScreen", () => {
  test("has three slots (ADR 0013)", () => {
    expect(SAVE_SLOT_COUNT).toBe(3);
  });

  test.each(MANDATORY_LANGUAGES)("shows the title as the level 1 heading in %s", (language) => {
    renderSaveSlotScreen(language);
    expect(screen.getByRole("heading", { level: 1, name: EXPECTED[language].title })).toBeDefined();
  });

  test.each(MANDATORY_LANGUAGES)("lists three empty slots in %s", (language) => {
    renderSaveSlotScreen(language);
    const { slots, state } = EXPECTED[language];
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(slots.map((slot) => `${slot} ${state}`));
  });

  test.each(MANDATORY_LANGUAGES)(
    "names every empty slot by its visible texts and gives it a menu in %s",
    (language) => {
      renderSaveSlotScreen(language);
      for (const name of EXPECTED[language].names) {
        expect(within(screen.getByRole("list")).getByRole("button", { name })).toBeDefined();
      }
      expect(slotButtons()).toHaveLength(SAVE_SLOT_COUNT);
      expect(within(screen.getByRole("list")).getAllByRole("button")).toHaveLength(
        SAVE_SLOT_COUNT * 2,
      );
    },
  );

  test.each(MANDATORY_LANGUAGES)("gives the first slot the keyboard focus in %s", (language) => {
    renderSaveSlotScreen(language);
    expect(screen.getByRole("button", { name: EXPECTED[language].names[0] })).toBe(
      document.activeElement,
    );
  });

  test("puts every slot and its menu button before Back in the tab order", async () => {
    renderSaveSlotScreen("en");
    for (const name of [
      "Actions for slot 1",
      "Slot 2 New game",
      "Actions for slot 2",
      "Slot 3 New game",
      "Actions for slot 3",
      "Back",
    ]) {
      await userEvent.tab();
      expect(screen.getByRole("button", { name })).toBe(document.activeElement);
    }
  });

  test.each([1, 2, 3])("starts a new game when the player clicks slot %i", async (number) => {
    const { onNewGame, onContinue, onBack } = renderSaveSlotScreen("en");
    await userEvent.click(screen.getByRole("button", { name: `Slot ${String(number)} New game` }));
    expect(onNewGame).toHaveBeenCalledExactlyOnceWith(number - 1);
    expect(onContinue).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  test.each([
    ["en", ["Slot 1 Jörg Müller · Career", "Slot 2 New game", "Slot 3 Zoë **Bold** · Sandbox"]],
    [
      "de",
      [
        "Spielstand 1 Jörg Müller · Karriere",
        "Spielstand 2 Neues Spiel",
        "Spielstand 3 Zoë **Bold** · Sandbox",
      ],
    ],
  ] as const)(
    "names a slot with a game by the player's name as typed and the mode in %s",
    (language, names) => {
      renderSaveSlotScreen(language, [JOERG, EMPTY_SLOT, ZOE]);
      expect(slotButtons()).toHaveLength(SAVE_SLOT_COUNT);
      for (const name of names) {
        expect(
          within(screen.getByRole("list")).getByRole("button", { name: startsWith(name) }),
        ).toBeDefined();
      }
    },
  );

  test.each([
    [
      "en",
      "Slot 1 Jörg Müller · Career 1 ticket solved 1 h 12 min played Last played ",
      "Slot 3 Zoë **Bold** · Sandbox 0 tickets solved 5 min played Last played ",
    ],
    [
      "de",
      "Spielstand 1 Jörg Müller · Karriere 1 Ticket gelöst 1 Std. 12 Min. gespielt Zuletzt gespielt: ",
      "Spielstand 3 Zoë **Bold** · Sandbox 0 Tickets gelöst 5 Min. gespielt Zuletzt gespielt: ",
    ],
  ] as const)(
    "names a game's slot by every visible text, its progress and times too, in %s",
    (language, joerg, zoe) => {
      renderSaveSlotScreen(language, [JOERG, EMPTY_SLOT, ZOE]);
      const date = lastPlayedText({ language }, LAST_PLAYED);
      expect(screen.getByRole("button", { name: `${joerg}${date}` })).toBeDefined();
      expect(screen.getByRole("button", { name: `${zoe}${date}` })).toBeDefined();
    },
  );

  test.each(MANDATORY_LANGUAGES)("shows the last played time in the format of %s", (language) => {
    const expected = new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(LAST_PLAYED);
    expect(lastPlayedText({ language }, LAST_PLAYED)).toBe(expected);
  });

  test("resumes the game when the player clicks a slot with a game", async () => {
    const { onNewGame, onContinue } = renderSaveSlotScreen("en", [EMPTY_SLOT, EMPTY_SLOT, ZOE]);
    await userEvent.click(
      screen.getByRole("button", { name: startsWith("Slot 3 Zoë **Bold** · Sandbox") }),
    );
    expect(onContinue).toHaveBeenCalledExactlyOnceWith(2);
    expect(onNewGame).not.toHaveBeenCalled();
  });

  test.each([
    [
      "en",
      [
        "Slot 1 This save is damaged and cannot be loaded.",
        "Slot 2 A newer version of PenguinOps saved this game.",
        "Slot 3 The game's user name is now taken on the system.",
      ],
    ],
    [
      "de",
      [
        "Spielstand 1 Dieser Spielstand ist beschädigt und kann nicht geladen werden.",
        "Spielstand 2 Eine neuere Version von PenguinOps hat dieses Spiel gespeichert.",
        "Spielstand 3 Der Benutzername dieses Spiels ist jetzt im System vergeben.",
      ],
    ],
  ] as const)("says why a locked slot cannot be played in %s", (language, names) => {
    renderSaveSlotScreen(language, [DAMAGED, TOO_NEW, TAKEN]);
    for (const name of names) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-disabled")).toBe("true");
    }
  });

  test("does nothing when the player clicks a locked slot", async () => {
    const { onNewGame, onContinue } = renderSaveSlotScreen("en", [DAMAGED, EMPTY_SLOT, EMPTY_SLOT]);
    await userEvent.click(slotButtons()[0] ?? document.body);
    expect(onNewGame).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  test.each([0, 1, 2])("gives the slot with the index %i the focus when asked", (index) => {
    renderSaveSlotScreen("en", EMPTY, index);
    expect(screen.getByRole("button", { name: `Slot ${String(index + 1)} New game` })).toBe(
      document.activeElement,
    );
  });

  test("starts a new game when the player presses Enter on the focused first slot", async () => {
    const { onNewGame } = renderSaveSlotScreen("de");
    await userEvent.keyboard("{Enter}");
    expect(onNewGame).toHaveBeenCalledExactlyOnceWith(0);
  });

  test("goes back when the player clicks Back", async () => {
    const { onBack } = renderSaveSlotScreen("en");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
  });

  test("goes back when the player presses Enter on Back", async () => {
    const { onBack, onNewGame } = renderSaveSlotScreen("de");
    screen.getByRole("button", { name: EXPECTED.de.back }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNewGame).not.toHaveBeenCalled();
  });

  test("goes back when the player presses Esc", async () => {
    const { onBack } = renderSaveSlotScreen("en");
    // Esc works wherever the focus is, also when it is on no control.
    screen.getByRole("button", { name: "Slot 1 New game" }).blur();
    await userEvent.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
  });

  test("goes back only once when Esc is held down", async () => {
    const { onBack } = renderSaveSlotScreen("en");
    await userEvent.keyboard("{Escape>3/}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("ignores other keys", async () => {
    const { onBack, onNewGame } = renderSaveSlotScreen("en");
    screen.getByRole("button", { name: "Slot 1 New game" }).blur();
    await userEvent.keyboard("{F1}q{ArrowDown}");
    expect(onBack).not.toHaveBeenCalled();
    expect(onNewGame).not.toHaveBeenCalled();
  });

  test("stops listening for Esc when the screen is gone", async () => {
    const { onBack, view } = renderSaveSlotScreen("en");
    view.unmount();
    await userEvent.keyboard("{Escape}");
    expect(onBack).not.toHaveBeenCalled();
  });

  test.each([
    ["en", { key: "slots.deleted", slot: 1 }, "Slot 2 was deleted."],
    ["en", { key: "slots.delete-failed", slot: 0 }, "Slot 1 could not be deleted."],
    ["de", { key: "slots.deleted", slot: 2 }, "Spielstand 3 wurde gelöscht."],
    ["de", { key: "slots.delete-failed", slot: 2 }, "Spielstand 3 konnte nicht gelöscht werden."],
  ] as const)("announces the message %#", (language, message, text) => {
    renderSaveSlotScreen(language, EMPTY, 0, message);
    expect(screen.getByRole("status").textContent).toBe(text);
  });

  test("keeps an empty status region without a message", () => {
    renderSaveSlotScreen("en");
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

describe("the slot menu and deleting a slot", () => {
  test.each([
    ["en", "Actions for slot 1", "Export"],
    ["de", "Aktionen für Spielstand 1", "Exportieren"],
  ] as const)("opens the menu of a slot with a game in %s", async (language, label, entry) => {
    renderSaveSlotScreen(language, [JOERG, EMPTY_SLOT, EMPTY_SLOT]);
    const button = screen.getByRole("button", { name: label });
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu", { name: label });
    expect(button.getAttribute("aria-controls")).toBe(menu.id);
    expect(within(menu).getByRole("menuitem", { name: entry })).toBe(document.activeElement);
  });

  test("puts the menu button after its slot in the tab order", async () => {
    renderSaveSlotScreen("en", [JOERG, EMPTY_SLOT, EMPTY_SLOT]);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Actions for slot 1" })).toBe(document.activeElement);
  });

  test.each([
    [
      "en",
      [JOERG, DAMAGED, EMPTY_SLOT],
      ["Export", "Import", "Delete"],
      ["Import", "Delete"],
      ["Import"],
    ],
    [
      "de",
      [JOERG, DAMAGED, EMPTY_SLOT],
      ["Exportieren", "Importieren", "Löschen"],
      ["Importieren", "Löschen"],
      ["Importieren"],
    ],
  ] as const)(
    "offers the actions that fit a game, a locked and an empty slot in %s",
    async (language, slots, game, locked, empty) => {
      renderSaveSlotScreen(language, slots);
      const menuButtons = screen
        .getAllByRole("button")
        .filter((button) => button.getAttribute("aria-haspopup") === "menu");
      const entries: string[][] = [];
      for (const button of menuButtons) {
        await userEvent.click(button);
        entries.push(screen.getAllByRole("menuitem").map((item) => item.textContent));
        await userEvent.keyboard("{Escape}");
      }
      expect(entries).toEqual([[...game], [...locked], [...empty]]);
    },
  );

  test.each([
    ["{Enter}", "Export"],
    [" ", "Export"],
    ["{ArrowDown}", "Export"],
    ["{ArrowUp}", "Delete"],
  ])("opens the menu with %s on its button on %s", async (key, entry) => {
    renderSaveSlotScreen("en", [JOERG, EMPTY_SLOT, EMPTY_SLOT]);
    screen.getByRole("button", { name: "Actions for slot 1" }).focus();
    await userEvent.keyboard(key);
    expect(screen.getByRole("menuitem", { name: entry })).toBe(document.activeElement);
  });

  test.each([
    ["{ArrowDown}", "Import"],
    ["{ArrowDown}{ArrowDown}{ArrowDown}", "Export"],
    ["{ArrowUp}", "Delete"],
    ["{End}", "Delete"],
    ["{End}{Home}", "Export"],
  ])("moves through the entries with %s to %s", async (keys, entry) => {
    renderSaveSlotScreen("en", [JOERG, EMPTY_SLOT, EMPTY_SLOT]);
    await userEvent.click(screen.getByRole("button", { name: "Actions for slot 1" }));
    await userEvent.keyboard(keys);
    expect(screen.getByRole("menuitem", { name: entry })).toBe(document.activeElement);
  });

  test("ignores other keys in the menu", async () => {
    renderSaveSlotScreen("en", [JOERG, EMPTY_SLOT, EMPTY_SLOT]);
    await userEvent.click(screen.getByRole("button", { name: "Actions for slot 1" }));
    await userEvent.keyboard("x{ArrowLeft}");
    expect(screen.getByRole("menuitem", { name: "Export" })).toBe(document.activeElement);
  });

  test.each([
    ["Export", "onExport"],
    ["Import", "onImport"],
  ] as const)("asks the app to %s the slot", async (entry, callback) => {
    const callbacks = renderSaveSlotScreen("en", [EMPTY_SLOT, JOERG, EMPTY_SLOT]);
    await userEvent.click(screen.getByRole("button", { name: "Actions for slot 2" }));
    await userEvent.click(screen.getByRole("menuitem", { name: entry }));
    expect(callbacks[callback]).toHaveBeenCalledExactlyOnceWith(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("closes the menu with Esc and returns the focus without going back", async () => {
    const { onBack } = renderSaveSlotScreen("en", [JOERG, EMPTY_SLOT, EMPTY_SLOT]);
    const button = screen.getByRole("button", { name: "Actions for slot 1" });
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toBe(document.activeElement);
    expect(onBack).not.toHaveBeenCalled();
  });

  test("closes the menu with Tab", async () => {
    renderSaveSlotScreen("en", [JOERG, EMPTY_SLOT, EMPTY_SLOT]);
    await userEvent.click(screen.getByRole("button", { name: "Actions for slot 1" }));
    await userEvent.tab();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("closes the menu with a click outside and with a second click on its button", async () => {
    renderSaveSlotScreen("en", [JOERG, EMPTY_SLOT, EMPTY_SLOT]);
    const button = screen.getByRole("button", { name: "Actions for slot 1" });
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("heading", { level: 1 }));
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.click(button);
    await userEvent.click(button);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test.each([
    [
      "en",
      JOERG,
      "Delete slot 1?",
      "The game of Jörg Müller will be deleted for good.",
      "Cancel",
      "Delete",
    ],
    [
      "de",
      JOERG,
      "Spielstand 1 löschen?",
      "Das Spiel von Jörg Müller wird endgültig gelöscht.",
      "Abbrechen",
      "Löschen",
    ],
    ["en", DAMAGED, "Delete slot 1?", "The save will be deleted for good.", "Cancel", "Delete"],
    [
      "de",
      DAMAGED,
      "Spielstand 1 löschen?",
      "Der Spielstand wird endgültig gelöscht.",
      "Abbrechen",
      "Löschen",
    ],
  ] as const)(
    "asks before deleting %#",
    async (language, slot, title, description, cancel, confirm) => {
      renderSaveSlotScreen(language, [slot, EMPTY_SLOT, EMPTY_SLOT]);
      const menuButton = screen
        .getAllByRole("button")
        .find((button) => button.getAttribute("aria-haspopup") === "menu");
      await userEvent.click(menuButton ?? document.body);
      await userEvent.click(screen.getByRole("menuitem", { name: confirm }));
      const dialog = screen.getByRole("alertdialog", { name: title });
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(
        document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent,
      ).toBe(description);
      expect(within(dialog).getByRole("button", { name: cancel })).toBe(document.activeElement);
      expect(within(dialog).getByRole("button", { name: confirm })).toBeDefined();
      expect(screen.getByRole("main", { hidden: true }).hasAttribute("inert")).toBe(true);
    },
  );

  test("deletes the slot when the player confirms and gives the slot the focus", async () => {
    const { onDelete } = renderSaveSlotScreen("en", [EMPTY_SLOT, JOERG, EMPTY_SLOT]);
    await userEvent.click(screen.getByRole("button", { name: "Actions for slot 2" }));
    await userEvent.keyboard("{End}{Enter}");
    const dialog = screen.getByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: startsWith("Slot 2 Jörg Müller · Career") })).toBe(
      document.activeElement,
    );
  });

  test.each(["click", "Esc"] as const)(
    "keeps the slot when the player cancels with %s",
    async (how) => {
      const { onDelete, onBack } = renderSaveSlotScreen("en", [JOERG, EMPTY_SLOT, EMPTY_SLOT]);
      await userEvent.click(screen.getByRole("button", { name: "Actions for slot 1" }));
      await userEvent.keyboard("{End}{Enter}");
      if (how === "click") {
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      } else {
        await userEvent.keyboard("{Escape}");
      }
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(onDelete).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: startsWith("Slot 1 Jörg Müller · Career") })).toBe(
        document.activeElement,
      );
    },
  );

  test("does not delete with Enter on the dialog's first focus", async () => {
    const { onDelete } = renderSaveSlotScreen("en", [JOERG, EMPTY_SLOT, EMPTY_SLOT]);
    await userEvent.click(screen.getByRole("button", { name: "Actions for slot 1" }));
    await userEvent.keyboard("{End}{Enter}");
    await userEvent.keyboard("{Enter}");
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe("importing over a save (ADR 0107)", () => {
  const ZOE_SAVE = ZOE.kind === "game" ? ZOE.save : undefined;
  if (ZOE_SAVE === undefined) {
    throw new Error("Zoë has no game.");
  }

  test.each([
    [
      "en",
      JOERG,
      "Replace slot 1?",
      "The game of Jörg Müller will be replaced by the game of Zoë **Bold**.",
      "Replace",
    ],
    [
      "de",
      JOERG,
      "Spielstand 1 ersetzen?",
      "Das Spiel von Jörg Müller wird durch das Spiel von Zoë **Bold** ersetzt.",
      "Ersetzen",
    ],
    [
      "en",
      TOO_NEW,
      "Replace slot 1?",
      "The save will be replaced by the game of Zoë **Bold**.",
      "Replace",
    ],
    [
      "de",
      TOO_NEW,
      "Spielstand 1 ersetzen?",
      "Der Spielstand wird durch das Spiel von Zoë **Bold** ersetzt.",
      "Ersetzen",
    ],
  ] as const)(
    "asks before an import replaces a save %#",
    (language, slot, title, text, replace) => {
      renderSaveSlotScreen(language, [slot, EMPTY_SLOT, EMPTY_SLOT], 0, undefined, {
        slot: 0,
        save: ZOE_SAVE,
      });
      const dialog = screen.getByRole("alertdialog", { name: title });
      expect(
        document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent,
      ).toBe(text);
      expect(within(dialog).getByRole("button", { name: replace })).toBeDefined();
      expect(screen.getByRole("main", { hidden: true }).hasAttribute("inert")).toBe(true);
    },
  );

  test("replaces the save when the player confirms and then focuses the slot", async () => {
    const { onConfirmImport, onCancelImport, setPendingImport } = renderSaveSlotScreen(
      "en",
      [EMPTY_SLOT, JOERG, EMPTY_SLOT],
      0,
      undefined,
      { slot: 1, save: ZOE_SAVE },
    );
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(onConfirmImport).toHaveBeenCalledExactlyOnceWith();
    expect(onCancelImport).not.toHaveBeenCalled();
    setPendingImport(undefined);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: startsWith("Slot 2 Jörg Müller") })).toBe(
      document.activeElement,
    );
  });

  test.each(["click", "Esc"] as const)(
    "drops the import when the player cancels with %s",
    async (how) => {
      const { onConfirmImport, onCancelImport, onBack } = renderSaveSlotScreen(
        "en",
        [JOERG, EMPTY_SLOT, EMPTY_SLOT],
        0,
        undefined,
        { slot: 0, save: ZOE_SAVE },
      );
      if (how === "click") {
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      } else {
        await userEvent.keyboard("{Escape}");
      }
      expect(onCancelImport).toHaveBeenCalledExactlyOnceWith();
      expect(onConfirmImport).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["en", { key: "slots.exported", slot: 0 }, "Slot 1 was exported."],
    ["de", { key: "slots.export-failed", slot: 1 }, "Spielstand 2 konnte nicht exportiert werden."],
    ["en", { key: "slots.imported", slot: 2 }, "The game was imported into slot 3."],
    [
      "de",
      { key: "slots.import-failed", slot: 0 },
      "Das Spiel konnte nicht importiert werden. Spielstand 1 bleibt, wie er ist.",
    ],
    [
      "en",
      { key: "slots.import-not-a-save", slot: 0 },
      "The file is not a PenguinOps save. Slot 1 is unchanged.",
    ],
    [
      "de",
      { key: "slots.import-damaged", slot: 0 },
      "Der Spielstand in der Datei ist beschädigt. Spielstand 1 bleibt, wie er ist.",
    ],
    [
      "en",
      { key: "slots.import-too-new", slot: 0 },
      "A newer version of PenguinOps saved the file. Slot 1 is unchanged.",
    ],
    [
      "de",
      { key: "slots.import-user-name-taken", slot: 0 },
      "Der Benutzername des Spiels ist im System vergeben. Spielstand 1 bleibt, wie er ist.",
    ],
  ] as const)("announces the transfer message %#", (language, message, text) => {
    renderSaveSlotScreen(language, EMPTY, 0, message);
    expect(screen.getByRole("status").textContent).toBe(text);
  });
});
