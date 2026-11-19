// @vitest-environment jsdom
// Tests of the new game screen in both languages (ROADMAP M3.2b, ADR 0094): the name field has the
// focus, the user name follows the name until the player edits it, every problem has its text and
// marks its field, Start creates the game only without problems, the mode is a single choice of
// two cards, and Back and Esc go back.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import {
  type NewGame,
  PLAYER_NAME_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  type UserNameProblem,
} from "@penguin-ops/gameplay";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { DEFAULT_GAME_MODE, NewGameScreen } from "./new-game-screen";

const { uiCatalogs } = loadBundledContent();

const RESERVED: ReadonlySet<string> = new Set(["root", "admin"]);

interface Expected {
  readonly title: string;
  readonly slot: string;
  readonly playerName: string;
  readonly userName: string;
  readonly userNameHelp: string;
  readonly mode: string;
  readonly modeFixed: string;
  readonly story: string;
  readonly storyDescription: string;
  readonly sandbox: string;
  readonly sandboxDescription: string;
  readonly start: string;
  readonly back: string;
  readonly playerNameEmpty: string;
  readonly playerNameTooLong: string;
  readonly userNameProblems: Readonly<Record<UserNameProblem, string>>;
}

const EXPECTED: Readonly<Record<MandatoryLanguage, Expected>> = {
  en: {
    title: "New game",
    slot: "Slot 2",
    playerName: "Your name",
    userName: "Linux user name",
    userNameHelp: "Your account on the company's systems. Lowercase letters, digits and hyphens.",
    mode: "Game mode",
    modeFixed: "The mode belongs to this save slot and cannot be changed later.",
    story: "Career",
    storyDescription:
      "Start as a trainee in the IT department and work your way up, chapter by chapter.",
    sandbox: "Sandbox",
    sandboxDescription: "Every chapter and ticket is open from the start, without story scenes.",
    start: "Start game",
    back: "Back",
    playerNameEmpty: "Enter your name.",
    playerNameTooLong: "Your name can have at most 40 characters.",
    userNameProblems: {
      empty: "Enter a user name.",
      "too-long": "A user name can have at most 32 characters.",
      uppercase: "Linux user names are written in lowercase.",
      "invalid-character": "Only lowercase letters a–z, digits and hyphens are allowed.",
      "invalid-start": "The user name has to start with a letter.",
      reserved: "The name root is already taken on the system.",
    },
  },
  de: {
    title: "Neues Spiel",
    slot: "Spielstand 2",
    playerName: "Dein Name",
    userName: "Linux-Benutzername",
    userNameHelp:
      "Dein Konto in den Systemen der Firma. Kleinbuchstaben, Ziffern und Bindestriche.",
    mode: "Spielmodus",
    modeFixed: "Der Modus gehört zu diesem Spielstand und lässt sich später nicht ändern.",
    story: "Karriere",
    storyDescription:
      "Fang als Azubi in der IT-Abteilung an und arbeite dich Kapitel für Kapitel hoch.",
    sandbox: "Sandbox",
    sandboxDescription: "Alle Kapitel und Tickets sind von Anfang an offen, ohne Story-Szenen.",
    start: "Spiel starten",
    back: "Zurück",
    playerNameEmpty: "Gib deinen Namen ein.",
    playerNameTooLong: "Dein Name darf höchstens 40 Zeichen haben.",
    userNameProblems: {
      empty: "Gib einen Benutzernamen ein.",
      "too-long": "Ein Benutzername darf höchstens 32 Zeichen haben.",
      uppercase: "Linux-Benutzernamen werden kleingeschrieben.",
      "invalid-character": "Erlaubt sind nur Kleinbuchstaben a–z, Ziffern und Bindestriche.",
      "invalid-start": "Der Benutzername muss mit einem Buchstaben anfangen.",
      reserved: "Den Namen root gibt es im System schon.",
    },
  },
};

/** A user name with each problem; `reserved` is in `RESERVED`. */
const USER_NAMES_WITH_PROBLEMS: Readonly<Record<UserNameProblem, string>> = {
  empty: "",
  "too-long": "a".repeat(USER_NAME_MAX_LENGTH + 1),
  uppercase: "Anna",
  "invalid-character": "anna_lena",
  "invalid-start": "1anna",
  reserved: "root",
};

function renderNewGameScreen(language: MandatoryLanguage = "en") {
  const onStart = vi.fn<(game: NewGame) => void>();
  const onBack = vi.fn<() => void>();
  const view = render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <NewGameScreen
        slotNumber={2}
        reservedUserNames={RESERVED}
        onStart={onStart}
        onBack={onBack}
      />
    </TextsProvider>,
  );
  const expected = EXPECTED[language];
  return {
    onStart,
    onBack,
    view,
    playerName: screen.getByRole("textbox", { name: expected.playerName }),
    userName: screen.getByRole("textbox", { name: expected.userName }),
    start: screen.getByRole("button", { name: expected.start }),
  };
}

/** The texts of the elements that describe `element`, joined by a space. */
function description(element: HTMLElement): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .filter((text) => text !== "")
    .join(" ");
}

/** Replaces the text of the field `field` with `text`, as the player would. */
async function retype(field: HTMLElement, text: string): Promise<void> {
  await userEvent.clear(field);
  if (text !== "") {
    await userEvent.type(field, text);
  }
}

afterEach(() => {
  cleanup();
});

describe("NewGameScreen", () => {
  describe.each(MANDATORY_LANGUAGES)("in %s", (language) => {
    const expected = EXPECTED[language];

    test("shows the title as the level 1 heading and the slot", () => {
      renderNewGameScreen(language);
      expect(screen.getByRole("heading", { level: 1, name: expected.title })).toBeDefined();
      expect(screen.getByText(expected.slot)).toBeDefined();
    });

    test("labels both fields and describes the user name", () => {
      const { playerName, userName } = renderNewGameScreen(language);
      expect(playerName.getAttribute("aria-invalid")).toBe("false");
      expect(description(playerName)).toBe("");
      expect(description(userName)).toBe(expected.userNameHelp);
    });

    test("offers the two modes as a single choice with Story chosen", () => {
      renderNewGameScreen(language);
      const group = screen.getByRole("group", { name: expected.mode });
      expect(description(group)).toBe(expected.modeFixed);
      const story = within(group).getByRole("radio", { name: expected.story });
      const sandbox = within(group).getByRole("radio", { name: expected.sandbox });
      expect(within(group).getAllByRole("radio")).toEqual([story, sandbox]);
      expect(description(story)).toBe(expected.storyDescription);
      expect(description(sandbox)).toBe(expected.sandboxDescription);
      expect((story as HTMLInputElement).checked).toBe(true);
      expect((sandbox as HTMLInputElement).checked).toBe(false);
    });

    test.each(Object.entries(USER_NAMES_WITH_PROBLEMS) as [UserNameProblem, string][])(
      "explains the user name problem %s",
      async (problem, name) => {
        const { userName } = renderNewGameScreen(language);
        await userEvent.type(userName, "x");
        await retype(userName, name);
        expect(userName.getAttribute("aria-invalid")).toBe("true");
        expect(description(userName)).toBe(
          `${expected.userNameHelp} ${expected.userNameProblems[problem]}`,
        );
      },
    );

    test("explains an empty player name", async () => {
      const { playerName } = renderNewGameScreen(language);
      await userEvent.type(playerName, "A");
      await userEvent.clear(playerName);
      expect(playerName.getAttribute("aria-invalid")).toBe("true");
      expect(description(playerName)).toBe(expected.playerNameEmpty);
    });

    test("explains a too long player name", async () => {
      const { playerName } = renderNewGameScreen(language);
      await userEvent.type(playerName, "a".repeat(PLAYER_NAME_MAX_LENGTH + 1));
      expect(description(playerName)).toBe(expected.playerNameTooLong);
    });

    test("names Back", () => {
      renderNewGameScreen(language);
      expect(screen.getByRole("button", { name: expected.back })).toBeDefined();
    });
  });

  test("starts with Story as the default mode (ADR 0017)", () => {
    expect(DEFAULT_GAME_MODE).toBe("story");
  });

  test("gives the name field the keyboard focus", () => {
    const { playerName } = renderNewGameScreen();
    expect(playerName).toBe(document.activeElement);
  });

  test("shows no problem before the player types", () => {
    const { playerName, userName } = renderNewGameScreen();
    expect(playerName.getAttribute("aria-invalid")).toBe("false");
    expect(userName.getAttribute("aria-invalid")).toBe("false");
    expect(description(userName)).toBe(EXPECTED.en.userNameHelp);
  });

  test("derives the user name while the player types the name", async () => {
    const { playerName, userName } = renderNewGameScreen();
    await userEvent.type(playerName, "Jörg");
    expect((userName as HTMLInputElement).value).toBe("joerg");
    await userEvent.type(playerName, " Müller");
    expect((userName as HTMLInputElement).value).toBe("joerg-mueller");
    expect(userName.getAttribute("aria-invalid")).toBe("false");
  });

  test("keeps the user name once the player has edited it", async () => {
    const { playerName, userName } = renderNewGameScreen();
    await userEvent.type(playerName, "Jörg");
    await userEvent.type(userName, "-m");
    await userEvent.type(playerName, " Müller");
    expect((userName as HTMLInputElement).value).toBe("joerg-m");
  });

  test("reports a reserved name that the name derives to", async () => {
    const { playerName, userName } = renderNewGameScreen();
    await userEvent.type(playerName, "Root");
    expect((userName as HTMLInputElement).value).toBe("root");
    expect(description(userName)).toBe(
      `${EXPECTED.en.userNameHelp} ${EXPECTED.en.userNameProblems.reserved}`,
    );
  });

  test("shows the reserved name as code", async () => {
    const { userName } = renderNewGameScreen();
    await userEvent.type(userName, "root");
    const problem = screen.getByText(/already taken/u);
    expect(within(problem).getByText("root").tagName).toBe("CODE");
  });

  test("derives no user name from a name without a Latin letter and says so", async () => {
    const { playerName, userName } = renderNewGameScreen();
    await userEvent.type(playerName, "李");
    expect((userName as HTMLInputElement).value).toBe("");
    expect(description(userName)).toBe(
      `${EXPECTED.en.userNameHelp} ${EXPECTED.en.userNameProblems.empty}`,
    );
  });

  test("announces problems in live regions", () => {
    const { playerName, userName } = renderNewGameScreen();
    const problemIds = [playerName, userName].map(
      (field) => field.getAttribute("aria-describedby")?.split(" ").at(-1) ?? "",
    );
    for (const id of problemIds) {
      expect(document.getElementById(id)?.getAttribute("aria-live")).toBe("polite");
    }
  });

  test("starts a game with the normalized name, the user name and Story", async () => {
    const { playerName, start, onStart } = renderNewGameScreen();
    await userEvent.type(playerName, "  Anna   Lena ");
    await userEvent.click(start);
    expect(onStart).toHaveBeenCalledExactlyOnceWith({
      playerName: "Anna Lena",
      userName: "anna-lena",
      mode: "story",
    });
  });

  test("starts a game in the Sandbox mode when the player clicks its card", async () => {
    const { playerName, start, onStart } = renderNewGameScreen();
    await userEvent.type(playerName, "Zoë");
    await userEvent.click(screen.getByText(EXPECTED.en.sandboxDescription));
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Sandbox" }).checked).toBe(true);
    await userEvent.click(start);
    expect(onStart).toHaveBeenCalledExactlyOnceWith({
      playerName: "Zoë",
      userName: "zoe",
      mode: "sandbox",
    });
  });

  test("chooses the mode with the arrow keys", async () => {
    renderNewGameScreen();
    const story = screen.getByRole<HTMLInputElement>("radio", { name: "Career" });
    const sandbox = screen.getByRole<HTMLInputElement>("radio", { name: "Sandbox" });
    story.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(sandbox.checked).toBe(true);
    expect(story.checked).toBe(false);
    await userEvent.keyboard("{ArrowLeft}");
    expect(story.checked).toBe(true);
  });

  test("starts the game with Enter in a field", async () => {
    const { playerName, onStart } = renderNewGameScreen();
    await userEvent.type(playerName, "Max{Enter}");
    expect(onStart).toHaveBeenCalledExactlyOnceWith({
      playerName: "Max",
      userName: "max",
      mode: "story",
    });
  });

  test("does not start without a name, shows both problems and focuses the name", async () => {
    const { playerName, userName, start, onStart } = renderNewGameScreen();
    await userEvent.click(start);
    expect(onStart).not.toHaveBeenCalled();
    expect(description(playerName)).toBe(EXPECTED.en.playerNameEmpty);
    expect(description(userName)).toBe(
      `${EXPECTED.en.userNameHelp} ${EXPECTED.en.userNameProblems.empty}`,
    );
    expect(playerName).toBe(document.activeElement);
  });

  test("does not start with a problem in the user name and focuses it", async () => {
    const { playerName, userName, start, onStart } = renderNewGameScreen();
    await userEvent.type(playerName, "Admin");
    await userEvent.click(start);
    expect(onStart).not.toHaveBeenCalled();
    expect(userName).toBe(document.activeElement);
    await retype(userName, "admin-anna");
    await userEvent.click(start);
    expect(onStart).toHaveBeenCalledExactlyOnceWith({
      playerName: "Admin",
      userName: "admin-anna",
      mode: "story",
    });
  });

  test("goes back when the player clicks Back", async () => {
    const { onBack, onStart } = renderNewGameScreen();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
    expect(onStart).not.toHaveBeenCalled();
  });

  test("goes back when the player presses Esc, also while typing", async () => {
    const { playerName, onBack } = renderNewGameScreen();
    await userEvent.type(playerName, "Jö");
    await userEvent.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
  });

  test("goes back only once when Esc is held down", async () => {
    const { onBack } = renderNewGameScreen();
    await userEvent.keyboard("{Escape>3/}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("stops listening for Esc when the screen is gone", async () => {
    const { onBack, view } = renderNewGameScreen();
    view.unmount();
    await userEvent.keyboard("{Escape}");
    expect(onBack).not.toHaveBeenCalled();
  });

  test("puts the fields, the chosen mode, Start and Back in the tab order", async () => {
    const { userName, start } = renderNewGameScreen();
    await userEvent.tab();
    expect(userName).toBe(document.activeElement);
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Career" })).toBe(document.activeElement);
    await userEvent.tab();
    expect(start).toBe(document.activeElement);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Back" })).toBe(document.activeElement);
  });
});
