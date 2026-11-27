// @vitest-environment jsdom
// Tests of the navigation between the screens (ADR 0091, ADR 0092, ADR 0094): the app opens on
// the start screen, Play opens the save slot screen, Back and Esc return, an empty slot opens the
// new game screen, Start puts the game into the slot and opens the game, a slot with a game
// returns to it, the pause menu leads back to the start screen, and the keyboard focus follows.
// The game screen plays the first level as the player's Linux user (ADR 0095). The app saves a new
// game at once, after every change of the progress, when the player leaves the game and before
// the window closes, with the play time and the time last played; it deletes a slot after the
// player confirmed it (ADR 0106).
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import {
  DEFAULT_SETTINGS,
  GAME_START_TIME,
  newSaveGame,
  parseSave,
  parseSettings,
  type SaveGame,
  serializeSave,
  type Settings,
} from "@penguin-ops/gameplay";

import { App } from "./app";
import { loadBundledContent } from "./content/bundled-content";
import type { DisplayApi, SaveFilesApi, SettingsFileApi } from "./desktop-api";
import { EMPTY_SLOT, type SlotState } from "./saves/save-slots";

const content = loadBundledContent();

/** Matches an accessible name that starts with `start`, for slots named by their details too. */
function startsWith(start: string): (name: string) => boolean {
  return (name) => name.startsWith(start);
}

/** A fake of the desktop's save files that keeps the written texts. */
function fakeSaveFiles() {
  const written = new Map<number, string>();
  return {
    written,
    writeSlot: vi.fn<SaveFilesApi["writeSlot"]>((slot, text) => {
      written.set(slot, text);
      return Promise.resolve();
    }),
    deleteSlot: vi.fn<SaveFilesApi["deleteSlot"]>((slot) => {
      written.delete(slot);
      return Promise.resolve();
    }),
    exportSave: vi.fn<SaveFilesApi["exportSave"]>(() => Promise.resolve("saved")),
    importSave: vi.fn<SaveFilesApi["importSave"]>(() => Promise.resolve({ kind: "canceled" })),
  };
}

/** A fake of the desktop's settings file that keeps the texts written, the latest last. */
function fakeSettingsFile() {
  const written: string[] = [];
  return {
    written,
    write: vi.fn<SettingsFileApi["write"]>((text) => {
      written.push(text);
      return Promise.resolve();
    }),
  };
}

/** A fake of the window's display; `pressF11` reports a change as the desktop does. */
function fakeDisplay() {
  let listener: ((on: boolean) => void) | undefined;
  return {
    setFullscreen: vi.fn<DisplayApi["setFullscreen"]>(() => Promise.resolve()),
    setFullscreenListener: vi.fn<DisplayApi["setFullscreenListener"]>((next) => {
      listener = next;
    }),
    report: (on: boolean) => {
      if (listener === undefined) {
        throw new Error("The app set no fullscreen listener.");
      }
      listener(on);
    },
  };
}

/** The settings in the latest text the app wrote to the settings file. */
function writtenSettings(settingsFile: ReturnType<typeof fakeSettingsFile>): Settings {
  const text = settingsFile.written.at(-1);
  if (text === undefined) {
    throw new Error("No settings were written.");
  }
  const { settings, problems } = parseSettings(text);
  expect(problems).toEqual([]);
  return settings;
}

const EMPTY: readonly SlotState[] = [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT];

/** The real time the fake clock starts at: 2026-11-20, 10:00 UTC. */
const START = 1_795_168_800_000;

/** Options of `renderApp`. */
interface AppOptions {
  /** The settings at the start; English and windowed by default. */
  readonly settings?: Settings;
  /** The operating system's locale; `en-US` by default. */
  readonly locale?: string;
}

function renderApp(slots: readonly SlotState[] = EMPTY, options: AppOptions = {}) {
  const onQuit = vi.fn<() => void>();
  const onSaveError = vi.fn<(error: unknown) => void>();
  const onSettingsError = vi.fn<(error: unknown) => void>();
  const saveFiles = fakeSaveFiles();
  const settingsFile = fakeSettingsFile();
  const display = fakeDisplay();
  const clock = { time: START };
  let closeHandler: (() => Promise<void>) | undefined;
  render(
    <App
      info={{ name: "PenguinOps", version: "1.2.3" }}
      content={content}
      locale={options.locale ?? "en-US"}
      settings={options.settings ?? { ...DEFAULT_SETTINGS, language: "en", fullscreen: false }}
      settingsFile={settingsFile}
      display={display}
      onSettingsError={onSettingsError}
      reservedUserNames={new Set(["root"])}
      slots={slots}
      saveFiles={saveFiles}
      now={() => clock.time}
      setCloseHandler={(handler) => {
        closeHandler = handler;
      }}
      onSaveError={onSaveError}
      onQuit={onQuit}
    />,
  );
  const close = async () => {
    if (closeHandler === undefined) {
      throw new Error("The app set no close handler.");
    }
    await closeHandler();
  };
  return {
    onQuit,
    onSaveError,
    onSettingsError,
    saveFiles,
    settingsFile,
    display,
    clock,
    close,
  };
}

/** The save in the text that the app wrote to `slot`. */
function writtenSave(saveFiles: ReturnType<typeof fakeSaveFiles>, slot: number): SaveGame {
  const text = saveFiles.written.get(slot);
  if (text === undefined) {
    throw new Error(`Nothing was written to the slot ${String(slot)}.`);
  }
  const parsed = parseSave(text);
  if (parsed.kind !== "save") {
    throw new Error(`The slot ${String(slot)} holds no save.`);
  }
  return parsed.save;
}

function startScreenTitle() {
  return screen.queryByRole("heading", { level: 1, name: "PenguinOps" });
}

function saveSlotTitle() {
  return screen.queryByRole("heading", { level: 1, name: "Choose a save slot" });
}

function newGameTitle() {
  return screen.queryByRole("heading", { level: 1, name: "New game" });
}

function gameTitle() {
  return screen.queryByRole("heading", { level: 1, name: "Workplace" });
}

/** jsdom lays nothing out, so it has no scrollIntoView; the tickets panel scrolls. */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn<Element["scrollIntoView"]>();
});

afterEach(() => {
  cleanup();
});

describe("App", () => {
  test("opens on the start screen", () => {
    renderApp();
    expect(startScreenTitle()).not.toBeNull();
    expect(saveSlotTitle()).toBeNull();
  });

  test("opens the save slot screen with Play and gives the first slot the focus", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(saveSlotTitle()).not.toBeNull();
    expect(startScreenTitle()).toBeNull();
    expect(screen.getByRole("button", { name: "Slot 1 New game" })).toBe(document.activeElement);
  });

  test("goes there and back with the keyboard alone", async () => {
    renderApp();
    await userEvent.keyboard("{Enter}");
    expect(saveSlotTitle()).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(startScreenTitle()).not.toBeNull();
    // The focus is back on Play, so Enter opens the save slot screen again.
    expect(screen.getByRole("button", { name: "Play" })).toBe(document.activeElement);
    await userEvent.keyboard("{Enter}");
    expect(saveSlotTitle()).not.toBeNull();
  });

  test("returns to the start screen with Back", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(startScreenTitle()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Play" })).toBe(document.activeElement);
  });

  test("opens the new game screen for an empty slot", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Slot 2 New game" }));
    expect(newGameTitle()).not.toBeNull();
    expect(screen.getByText("Slot 2")).toBeDefined();
    expect(saveSlotTitle()).toBeNull();
    expect(screen.getByRole("textbox", { name: "Your name" })).toBe(document.activeElement);
  });

  test("returns from the new game screen to the slot it came from", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Slot 3 New game" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(saveSlotTitle()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Slot 3 New game" })).toBe(document.activeElement);
  });

  test("starts the game in the slot and keeps it there", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Slot 2 New game" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Your name" }), "Jörg Müller");
    await userEvent.click(screen.getByRole("radio", { name: "Sandbox" }));
    await userEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(gameTitle()).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Command line" })).toBe(document.activeElement);

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Main menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Slot 1 New game" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: startsWith("Slot 2 Jörg Müller · Sandbox") }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Slot 3 New game" })).toBeDefined();

    await userEvent.click(
      screen.getByRole("button", { name: startsWith("Slot 2 Jörg Müller · Sandbox") }),
    );
    expect(gameTitle()).not.toBeNull();
  });

  test("plays the first level as the player's Linux user", async () => {
    renderApp();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Jörg Müller{Enter}");
    const terminal = screen.getByRole("log", { name: "Terminal output" });
    expect(terminal.textContent).toContain("joerg-mueller@itdesk:~$");
    await userEvent.keyboard("ls{Enter}");
    expect(terminal.textContent).toContain("tickets");
    expect(terminal.textContent).toContain("welcome");
  });

  test("does not start the game with a reserved user name", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Slot 1 New game" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Your name" }), "Root{Enter}");
    expect(newGameTitle()).not.toBeNull();
    expect(gameTitle()).toBeNull();
  });

  test("goes into the game and back to the start screen with the keyboard alone", async () => {
    renderApp();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    expect(newGameTitle()).not.toBeNull();
    await userEvent.keyboard("Max{Enter}");
    expect(gameTitle()).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeDefined();
    // Continue has the focus; two Tabs reach Main menu, past Settings.
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Main menu" })).toBe(document.activeElement);
    await userEvent.keyboard("{Enter}");
    expect(startScreenTitle()).not.toBeNull();
    expect(gameTitle()).toBeNull();
    expect(screen.getByRole("button", { name: "Play" })).toBe(document.activeElement);
  });

  test("stays in the game when Esc closes the pause menu", async () => {
    renderApp();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Max{Enter}");
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    expect(gameTitle()).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("ignores Esc on the start screen", async () => {
    const { onQuit } = renderApp();
    await userEvent.keyboard("{Escape}");
    expect(startScreenTitle()).not.toBeNull();
    expect(onQuit).not.toHaveBeenCalled();
  });

  test("quits from the start screen", async () => {
    const { onQuit } = renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Quit" }));
    expect(onQuit).toHaveBeenCalledExactlyOnceWith();
  });
});

/** Jörg's saved game in Sandbox mode with the first ticket solved, last played at `START`. */
const JOERG: SaveGame = {
  ...newSaveGame(
    { playerName: "Jörg Müller", userName: "joerg-mueller", mode: "sandbox" },
    "first-steps",
    START - 3_600_000,
  ),
  playTime: 600_000,
  tickets: [{ level: "first-steps", solved: true, hintsShown: 0, reachedExtraGoals: [] }],
};

/** Starts a new game of Max in slot 1 with the keyboard alone. */
async function startNewGame() {
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard("Max{Enter}");
}

describe("App: saves (ADR 0106)", () => {
  test("saves a new game in its slot as soon as it starts", async () => {
    const { saveFiles } = renderApp();
    await startNewGame();
    await vi.waitFor(() => {
      expect(saveFiles.written.has(0)).toBe(true);
    });
    expect(writtenSave(saveFiles, 0)).toEqual(
      newSaveGame({ playerName: "Max", userName: "max", mode: "story" }, "first-steps", START),
    );
  });

  test("saves the progress at once, with the play time and the time last played", async () => {
    const { saveFiles, clock } = renderApp();
    await startNewGame();
    clock.time = START + 90_000;
    await userEvent.keyboard("cd welcome{Enter}");
    await vi.waitFor(() => {
      expect(writtenSave(saveFiles, 0).tickets[0]?.solved).toBe(true);
    });
    const save = writtenSave(saveFiles, 0);
    expect(save.playTime).toBe(90_000);
    expect(save.lastPlayed).toBe(START + 90_000);
    expect(save.gameTime).toBeGreaterThan(GAME_START_TIME);
  });

  test("saves when the player leaves the game and shows it on the slot", async () => {
    const { saveFiles, clock } = renderApp();
    await startNewGame();
    clock.time = START + 3 * 60_000;
    await userEvent.keyboard("pwd{Enter}");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Main menu" }));
    await vi.waitFor(() => {
      expect(writtenSave(saveFiles, 0).playTime).toBe(3 * 60_000);
    });
    // The game time of the input is saved too, though the input changed no progress.
    expect(writtenSave(saveFiles, 0).gameTime).toBeGreaterThan(GAME_START_TIME);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    const slot = screen.getByRole("button", { name: startsWith("Slot 1 Max · Career") });
    expect(slot.textContent).toContain("3 min played");
  });

  test("resumes a saved game from its slot and adds the new play time", async () => {
    const { saveFiles, clock } = renderApp([EMPTY_SLOT, { kind: "game", save: JOERG }, EMPTY_SLOT]);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(
      screen.getByRole("button", { name: startsWith("Slot 2 Jörg Müller · Sandbox") }),
    );
    expect(gameTitle()).not.toBeNull();
    // The game plays as the save's user, on the save's solved ticket.
    expect(screen.getByRole("log", { name: "Terminal output" }).textContent).toContain(
      "joerg-mueller@itdesk:~$",
    );
    expect(screen.getByRole("banner").textContent).toContain("Solved");
    clock.time = START + 60_000;
    await userEvent.keyboard("{F1}");
    await vi.waitFor(() => {
      expect(writtenSave(saveFiles, 1).tickets[0]?.hintsShown).toBe(1);
    });
    expect(writtenSave(saveFiles, 1).playTime).toBe(JOERG.playTime + 60_000);
  });

  test("saves the game being played before the window closes", async () => {
    const { saveFiles, clock, close } = renderApp();
    await startNewGame();
    await userEvent.keyboard("pwd{Enter}");
    clock.time = START + 120_000;
    await close();
    expect(writtenSave(saveFiles, 0).playTime).toBe(120_000);
    expect(writtenSave(saveFiles, 0).lastPlayed).toBe(START + 120_000);
  });

  test("writes nothing before the window closes outside a game", async () => {
    const { saveFiles, close } = renderApp();
    await close();
    expect(saveFiles.writeSlot).not.toHaveBeenCalled();
  });

  test("says that the game is not saved while saving fails, and logs the error", async () => {
    const { saveFiles, onSaveError } = renderApp();
    saveFiles.writeSlot.mockRejectedValue(new Error("disk full"));
    await startNewGame();
    await vi.waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Not saved: the game could not write its save file.",
      );
    });
    expect(onSaveError).toHaveBeenCalledWith(new Error("disk full"));
    saveFiles.writeSlot.mockResolvedValue();
    await userEvent.keyboard("{F1}");
    await vi.waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("");
    });
  });

  test("deletes a slot after the player confirmed it", async () => {
    const { saveFiles } = renderApp([{ kind: "game", save: JOERG }, EMPTY_SLOT, EMPTY_SLOT]);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Actions for slot 1" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(saveFiles.deleteSlot).toHaveBeenCalledExactlyOnceWith(0);
    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Slot 1 was deleted.");
    });
    expect(screen.getByRole("button", { name: "Slot 1 New game" })).toBe(document.activeElement);
  });

  test("keeps the slot and says so when it cannot be deleted", async () => {
    const { saveFiles, onSaveError } = renderApp([
      { kind: "game", save: JOERG },
      EMPTY_SLOT,
      EMPTY_SLOT,
    ]);
    saveFiles.deleteSlot.mockRejectedValue(new Error("locked"));
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Actions for slot 1" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Slot 1 could not be deleted.");
    });
    expect(onSaveError).toHaveBeenCalledWith(new Error("locked"));
    expect(
      screen.getByRole("button", { name: startsWith("Slot 1 Jörg Müller · Sandbox") }),
    ).toBeDefined();
  });

  test("forgets the message when the player comes back to the slots", async () => {
    renderApp([{ kind: "game", save: JOERG }, EMPTY_SLOT, EMPTY_SLOT]);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Actions for slot 1" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Slot 1 was deleted.");
    });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

/** Opens the slot screen and the menu of the slot `number`, counting from 1. */
async function openSlotMenu(number: number) {
  await userEvent.click(screen.getByRole("button", { name: "Play" }));
  await userEvent.click(screen.getByRole("button", { name: `Actions for slot ${String(number)}` }));
}

/** Ada's game, as a file the player imports. */
const ADA: SaveGame = newSaveGame(
  { playerName: "Ada Lovelace", userName: "ada", mode: "story" },
  "first-steps",
  START - 86_400_000,
);

describe("App: export and import (ADR 0107)", () => {
  test("exports a slot's game with the dialog's texts and a suggested file name", async () => {
    const { saveFiles } = renderApp([EMPTY_SLOT, { kind: "game", save: JOERG }, EMPTY_SLOT]);
    await openSlotMenu(2);
    await userEvent.click(screen.getByRole("menuitem", { name: "Export" }));
    expect(saveFiles.exportSave).toHaveBeenCalledExactlyOnceWith({
      title: "Export slot 2",
      fileType: "PenguinOps save",
      text: serializeSave(JOERG),
      fileName: "penguin-ops-slot-2-joerg-mueller.json",
    });
    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Slot 2 was exported.");
    });
  });

  test("says nothing when the player cancels the export", async () => {
    const { saveFiles } = renderApp([{ kind: "game", save: JOERG }, EMPTY_SLOT, EMPTY_SLOT]);
    saveFiles.exportSave.mockResolvedValue("canceled");
    await openSlotMenu(1);
    await userEvent.click(screen.getByRole("menuitem", { name: "Export" }));
    await vi.waitFor(() => {
      expect(saveFiles.exportSave).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole("status").textContent).toBe("");
  });

  test("says so when the export fails", async () => {
    const { saveFiles, onSaveError } = renderApp([
      { kind: "game", save: JOERG },
      EMPTY_SLOT,
      EMPTY_SLOT,
    ]);
    saveFiles.exportSave.mockRejectedValue(new Error("read-only"));
    await openSlotMenu(1);
    await userEvent.click(screen.getByRole("menuitem", { name: "Export" }));
    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Slot 1 could not be exported.");
    });
    expect(onSaveError).toHaveBeenCalledWith(new Error("read-only"));
  });

  test("imports a file into an empty slot at once", async () => {
    const { saveFiles } = renderApp();
    saveFiles.importSave.mockResolvedValue({
      kind: "file",
      file: { kind: "text", text: serializeSave(ADA) },
    });
    await openSlotMenu(3);
    await userEvent.click(screen.getByRole("menuitem", { name: "Import" }));
    expect(saveFiles.importSave).toHaveBeenCalledExactlyOnceWith({
      title: "Import into slot 3",
      fileType: "PenguinOps save",
    });
    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("The game was imported into slot 3.");
    });
    expect(writtenSave(saveFiles, 2)).toEqual(ADA);
    expect(
      screen.getByRole("button", { name: startsWith("Slot 3 Ada Lovelace · Career") }),
    ).toBeDefined();
  });

  test("asks before an import replaces a game and replaces it when the player confirms", async () => {
    const { saveFiles } = renderApp([{ kind: "game", save: JOERG }, EMPTY_SLOT, EMPTY_SLOT]);
    saveFiles.importSave.mockResolvedValue({
      kind: "file",
      file: { kind: "text", text: serializeSave(ADA) },
    });
    await openSlotMenu(1);
    await userEvent.click(screen.getByRole("menuitem", { name: "Import" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Replace slot 1?" });
    expect(saveFiles.writeSlot).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Replace" }));
    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("The game was imported into slot 1.");
    });
    expect(writtenSave(saveFiles, 0)).toEqual(ADA);
    expect(screen.getByRole("button", { name: startsWith("Slot 1 Ada Lovelace") })).toBe(
      document.activeElement,
    );
  });

  test("keeps the game when the player cancels the replacement", async () => {
    const { saveFiles } = renderApp([{ kind: "game", save: JOERG }, EMPTY_SLOT, EMPTY_SLOT]);
    saveFiles.importSave.mockResolvedValue({
      kind: "file",
      file: { kind: "text", text: serializeSave(ADA) },
    });
    await openSlotMenu(1);
    await userEvent.click(screen.getByRole("menuitem", { name: "Import" }));
    await screen.findByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(saveFiles.writeSlot).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: startsWith("Slot 1 Jörg Müller") })).toBe(
      document.activeElement,
    );
  });

  test.each([
    [{ kind: "unreadable" }, "The game could not be imported. Slot 1 is unchanged."],
    [{ kind: "text", text: "{}" }, "The file is not a PenguinOps save. Slot 1 is unchanged."],
    [
      { kind: "text", text: serializeSave(ADA).replace('"ada"', '"Ada"') },
      "The save in the file is damaged. Slot 1 is unchanged.",
    ],
    [
      { kind: "text", text: '{"format": "penguin-ops-save", "version": 99}' },
      "A newer version of PenguinOps saved the file. Slot 1 is unchanged.",
    ],
    [
      { kind: "text", text: serializeSave({ ...ADA, userName: "root" }) },
      "The game's user name is taken on the system. Slot 1 is unchanged.",
    ],
  ] as const)("refuses a file that cannot be imported %#", async (file, message) => {
    const { saveFiles } = renderApp();
    saveFiles.importSave.mockResolvedValue({ kind: "file", file });
    await openSlotMenu(1);
    await userEvent.click(screen.getByRole("menuitem", { name: "Import" }));
    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(message);
    });
    expect(saveFiles.writeSlot).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Slot 1 New game" })).toBeDefined();
  });

  test("does nothing when the player cancels the import", async () => {
    const { saveFiles } = renderApp();
    await openSlotMenu(1);
    await userEvent.click(screen.getByRole("menuitem", { name: "Import" }));
    await vi.waitFor(() => {
      expect(saveFiles.importSave).toHaveBeenCalledOnce();
    });
    expect(saveFiles.writeSlot).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  test.each([
    ["the dialog fails", "importSave"],
    ["the slot cannot be written", "writeSlot"],
  ] as const)("says so when %s", async (_name, failing) => {
    const { saveFiles, onSaveError } = renderApp();
    saveFiles.importSave.mockResolvedValue({
      kind: "file",
      file: { kind: "text", text: serializeSave(ADA) },
    });
    saveFiles[failing].mockRejectedValue(new Error("broken"));
    await openSlotMenu(1);
    await userEvent.click(screen.getByRole("menuitem", { name: "Import" }));
    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "The game could not be imported. Slot 1 is unchanged.",
      );
    });
    expect(onSaveError).toHaveBeenCalledWith(new Error("broken"));
    expect(screen.getByRole("button", { name: "Slot 1 New game" })).toBeDefined();
  });
});

describe("App: settings (ADR 0109)", () => {
  /** Opens the settings screen from the start screen. */
  async function openSettings(name = "Settings") {
    await userEvent.click(screen.getByRole("button", { name }));
  }

  function settingsTitle(name = "Settings") {
    return screen.queryByRole("heading", { level: 1, name });
  }

  test("opens the settings from the main menu with the chosen language focused", async () => {
    renderApp();
    await openSettings();
    expect(settingsTitle()).not.toBeNull();
    expect(screen.getByRole("radio", { name: "English" })).toBe(document.activeElement);
  });

  test.each([
    ["Back", () => userEvent.click(screen.getByRole("button", { name: "Back" }))],
    ["Esc", () => userEvent.keyboard("{Escape}")],
  ])("returns from the settings to the main menu with %s", async (_name, leave) => {
    renderApp();
    await openSettings();
    await leave();
    expect(startScreenTitle()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toBe(document.activeElement);
  });

  test("switches the language at once outside a game and writes the settings", async () => {
    const { settingsFile } = renderApp();
    await openSettings();
    await userEvent.click(screen.getByRole("radio", { name: "Deutsch" }));
    expect(settingsTitle("Einstellungen")).not.toBeNull();
    expect(document.documentElement.lang).toBe("de");
    expect(screen.getByRole("radio", { name: "Deutsch" })).toBe(document.activeElement);
    await vi.waitFor(() => {
      expect(writtenSettings(settingsFile).language).toBe("de");
    });
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));
    expect(screen.getByRole("button", { name: "Spielen" })).toBeDefined();
  });

  test("names the system's language in the player's language", async () => {
    renderApp(EMPTY, { locale: "de-AT" });
    await openSettings();
    expect(screen.getByRole("radio", { name: "System language (German)" })).toBeDefined();
    await userEvent.click(screen.getByRole("radio", { name: "System language (German)" }));
    expect(screen.getByRole("radio", { name: "Systemsprache (Deutsch)" })).toBeDefined();
  });

  test("shows the window in the mode of the setting when the app starts", () => {
    const { display } = renderApp(EMPTY, { settings: { ...DEFAULT_SETTINGS, language: "en" } });
    expect(display.setFullscreen).toHaveBeenCalledExactlyOnceWith(true);
  });

  test("switches fullscreen with its switch and writes the settings", async () => {
    const { display, settingsFile } = renderApp();
    expect(display.setFullscreen).toHaveBeenCalledExactlyOnceWith(false);
    await openSettings();
    const fullscreen = screen.getByRole("checkbox", { name: "Fullscreen" });
    expect(fullscreen).toHaveProperty("checked", false);
    await userEvent.click(fullscreen);
    expect(fullscreen).toHaveProperty("checked", true);
    expect(display.setFullscreen).toHaveBeenLastCalledWith(true);
    await vi.waitFor(() => {
      expect(writtenSettings(settingsFile).fullscreen).toBe(true);
    });
  });

  test("remembers fullscreen that F11 or the system changed, without sending it back", async () => {
    const { display, settingsFile } = renderApp();
    await openSettings();
    act(() => {
      display.report(true);
    });
    expect(screen.getByRole("checkbox", { name: "Fullscreen" })).toHaveProperty("checked", true);
    expect(display.setFullscreen).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(writtenSettings(settingsFile).fullscreen).toBe(true);
    });
  });

  test("writes nothing when a report changes nothing", () => {
    const { display, settingsFile } = renderApp();
    act(() => {
      display.report(false);
    });
    expect(settingsFile.write).not.toHaveBeenCalled();
  });

  test("says that the settings are not saved while writing fails, and logs the error", async () => {
    const { settingsFile, onSettingsError } = renderApp();
    settingsFile.write.mockRejectedValueOnce(new Error("disk full"));
    await openSettings();
    await userEvent.click(screen.getByRole("checkbox", { name: "Fullscreen" }));
    await vi.waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "The settings could not be saved. They apply until you close the game.",
      );
    });
    expect(onSettingsError).toHaveBeenCalledWith(new Error("disk full"));
    // The setting applies all the same, and the next write that works clears the alert.
    expect(screen.getByRole("checkbox", { name: "Fullscreen" })).toHaveProperty("checked", true);
    await userEvent.click(screen.getByRole("checkbox", { name: "Fullscreen" }));
    await vi.waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("");
    });
  });

  test("applies the font size and reduce motion of the settings to the page at start", () => {
    renderApp(EMPTY, {
      settings: { ...DEFAULT_SETTINGS, language: "en", fontSize: 150, reduceMotion: "on" },
    });
    expect(document.documentElement.style.fontSize).toBe("150%");
    expect(document.documentElement.dataset["reduceMotion"]).toBe("on");
  });

  test("changes the font size and reduce motion at once and writes them", async () => {
    const { settingsFile } = renderApp();
    await openSettings();
    fireEvent.change(screen.getByRole("slider", { name: "Font size" }), {
      target: { value: "110" },
    });
    expect(document.documentElement.style.fontSize).toBe("110%");
    await userEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(document.documentElement.dataset["reduceMotion"]).toBe("off");
    await vi.waitFor(() => {
      expect(writtenSettings(settingsFile)).toMatchObject({ fontSize: 110, reduceMotion: "off" });
    });
  });

  test("applies the colour scheme of the settings to the page at start", () => {
    renderApp(EMPTY, {
      settings: { ...DEFAULT_SETTINGS, language: "en", colorScheme: "high-contrast" },
    });
    expect(document.documentElement.dataset["colorScheme"]).toBe("high-contrast");
  });

  test("changes the colour scheme at once and writes it", async () => {
    const { settingsFile } = renderApp();
    await openSettings();
    expect(document.documentElement.dataset["colorScheme"]).toBe("default");
    await userEvent.click(screen.getByRole("radio", { name: "Retro CRT" }));
    expect(document.documentElement.dataset["colorScheme"]).toBe("retro-crt");
    await vi.waitFor(() => {
      expect(writtenSettings(settingsFile)).toMatchObject({ colorScheme: "retro-crt" });
    });
  });

  /** Opens the settings dialog in the game. */
  async function openSettingsInGame() {
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
  }

  test("opens the settings in the game as a dialog over the paused game", async () => {
    renderApp();
    await startNewGame();
    await openSettingsInGame();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(within(dialog).getByRole("radio", { name: "English" })).toBe(document.activeElement);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Settings" })).toBe(document.activeElement);
  });

  test("restarts the game in the new language after the player confirmed it", async () => {
    const { saveFiles, settingsFile } = renderApp();
    await startNewGame();
    await userEvent.keyboard("cd welcome{Enter}");
    await openSettingsInGame();
    await userEvent.click(screen.getByRole("radio", { name: "Deutsch" }));
    const question = screen.getByRole("alertdialog", { name: "Switch the language?" });
    expect(within(question).getByRole("button", { name: "Cancel" })).toBe(document.activeElement);
    expect(settingsFile.write).not.toHaveBeenCalled();
    await userEvent.click(within(question).getByRole("button", { name: "Switch language" }));
    // The game appears again in German, with the progress it had, and the terminal has the focus.
    expect(screen.getByRole("heading", { level: 1, name: "Arbeitsplatz" })).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("banner").textContent).toContain("Gelöst");
    expect(screen.getByRole("textbox", { name: "Befehlszeile" })).toBe(document.activeElement);
    expect(document.documentElement.lang).toBe("de");
    await vi.waitFor(() => {
      expect(writtenSettings(settingsFile).language).toBe("de");
    });
    expect(writtenSave(saveFiles, 0).tickets[0]?.solved).toBe(true);
  });

  test("keeps the language when the player cancels the restart", async () => {
    const { settingsFile } = renderApp();
    await startNewGame();
    await openSettingsInGame();
    await userEvent.click(screen.getByRole("radio", { name: "Deutsch" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(within(dialog).getByRole("radio", { name: "English" })).toHaveProperty("checked", true);
    expect(within(dialog).getByRole("radio", { name: "English" })).toBe(document.activeElement);
    expect(settingsFile.write).not.toHaveBeenCalled();
    // Esc belongs to the settings again and returns to the pause menu.
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeDefined();
  });

  test("changes a language setting that keeps the game's language without asking", async () => {
    const { settingsFile } = renderApp();
    await startNewGame();
    await openSettingsInGame();
    await userEvent.click(screen.getByRole("radio", { name: "System language (English)" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeDefined();
    await vi.waitFor(() => {
      expect(writtenSettings(settingsFile).language).toBe("system");
    });
  });

  test("switches fullscreen in the game without restarting it", async () => {
    const { display } = renderApp();
    await startNewGame();
    await userEvent.keyboard("pwd{Enter}");
    await openSettingsInGame();
    await userEvent.click(screen.getByRole("checkbox", { name: "Fullscreen" }));
    expect(display.setFullscreen).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard("{Escape}{Escape}");
    expect(screen.getByRole("log", { name: "Terminal output" }).textContent).toContain("pwd");
  });
});
