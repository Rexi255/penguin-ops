// @vitest-environment jsdom
// Tests of the terminal component in both languages: it draws the prompt, the screen and the
// cursor, runs what the player types, and maps the keys of bash to the terminal model; keys it
// does not own (Esc, F-keys, Shift+Tab, paste) stay with the browser and the game screen.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { createGameClock } from "@penguin-ops/engine";
import { GAME_START_TIME, type GameEvent, levelSetup, startLevel } from "@penguin-ops/gameplay";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { Terminal } from "./terminal";
import { createTerminal } from "./terminal-model";

const content = loadBundledContent();

const NAMES: Readonly<
  Record<MandatoryLanguage, { output: string; input: string; notice: string }>
> = {
  en: {
    output: "Terminal output",
    input: "Command line",
    notice: "PenguinOps does not simulate this yet, so the input stopped here.",
  },
  de: {
    output: "Terminalausgabe",
    input: "Befehlszeile",
    notice: "Das simuliert PenguinOps noch nicht, darum hat die Eingabe hier angehalten.",
  },
};

function renderTerminal(language: MandatoryLanguage = "en", levelId = "first-steps") {
  const clock = createGameClock(GAME_START_TIME);
  const session = startLevel(levelSetup(content, levelId, language, "max"), clock);
  const onGameEvents = vi.fn<(events: readonly GameEvent[]) => void>();
  const view = render(
    <TextsProvider texts={createTexts(content.uiCatalogs, language)}>
      <Terminal initialState={createTerminal(session, clock.now())} onGameEvents={onGameEvents} />
    </TextsProvider>,
  );
  const input = screen.getByRole("textbox", { name: NAMES[language].input });
  input.focus();
  return {
    view,
    input,
    log: screen.getByRole("log", { name: NAMES[language].output }),
    onGameEvents,
  };
}

/** The finished lines and the input line as text, one entry per line. */
function lines(log: HTMLElement): string[] {
  return [...log.querySelectorAll(".terminal__line, .terminal__notice")].map(
    (line) => line.textContent,
  );
}

/** The input line with its prompt; the cursor's cell is part of it. */
function inputLine(log: HTMLElement): string {
  return lines(log).at(-1) ?? "";
}

function cursor(log: HTMLElement): string {
  return log.querySelector(".terminal__cursor")?.textContent ?? "";
}

afterEach(() => {
  cleanup();
  document.getSelection()?.removeAllRanges();
});

describe("Terminal", () => {
  test("reports what happened in the game after an input", async () => {
    const { onGameEvents } = renderTerminal();
    await userEvent.keyboard("cd welcome{Enter}");
    expect(onGameEvents).toHaveBeenCalledExactlyOnceWith([{ kind: "solved" }]);
  });

  test("reports the events of every input in order", async () => {
    const { onGameEvents } = renderTerminal("en", "switch-backup");
    await userEvent.keyboard("mv ~/network/switch-floor2.conf ~/backup/{Enter}");
    await userEvent.keyboard("mv ~/backup/switch-floor2.conf ~/network/{Enter}");
    await userEvent.keyboard("cp ~/network/switch-floor2.conf ~/backup/{Enter}");
    expect(onGameEvents.mock.calls).toEqual([
      [[{ kind: "tip", say: "tip-moved-config" }]],
      [[{ kind: "step-completed", step: "backup", say: "step-backup" }]],
    ]);
  });

  test("reports nothing for inputs and keys after which nothing happened in the game", async () => {
    const { onGameEvents } = renderTerminal();
    await userEvent.keyboard("pwd{Enter}ls{Enter}{ArrowUp}echo 'a{Enter}b'{Enter}");
    await userEvent.keyboard("cd wel{Tab}{Control>}c{/Control}{Control>}l{/Control}");
    expect(onGameEvents).not.toHaveBeenCalled();
  });

  test.each(MANDATORY_LANGUAGES)("shows the prompt and names its parts in %s", (language) => {
    const { log, input } = renderTerminal(language);
    expect(inputLine(log)).toBe("max@itdesk:~$  ");
    expect(log.querySelector(".terminal__prompt-user")?.textContent).toBe("max@itdesk");
    expect(log.querySelector(".terminal__prompt-directory")?.textContent).toBe("~");
    expect(input.closest(".terminal__cursor")).not.toBeNull();
  });

  test("runs what the player types and shows the output", async () => {
    const { log } = renderTerminal();
    await userEvent.keyboard("pwd{Enter}");
    expect(lines(log)).toEqual(["max@itdesk:~$ pwd", "/home/max", "max@itdesk:~$  "]);
    await userEvent.keyboard("cd welcome{Enter}");
    expect(inputLine(log)).toBe("max@itdesk:~/welcome$  ");
  });

  test("edits the line with Backspace, Delete, the arrows, Home and End", async () => {
    const { log } = renderTerminal();
    await userEvent.keyboard("lx{Backspace}s -a");
    expect(inputLine(log)).toBe("max@itdesk:~$ ls -a ");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{Delete}");
    expect(inputLine(log)).toBe("max@itdesk:~$ ls a");
    expect(cursor(log)).toBe("a");
    await userEvent.keyboard("{Home}x{End}y{ArrowRight}");
    expect(inputLine(log)).toBe("max@itdesk:~$ xls ay ");
  });

  test("moves to the start and the end with Ctrl+A and Ctrl+E", async () => {
    const { log } = renderTerminal();
    await userEvent.keyboard("pwd{Control>}a{/Control}x");
    expect(inputLine(log)).toBe("max@itdesk:~$ xpwd");
    await userEvent.keyboard("{Control>}e{/Control}y");
    expect(inputLine(log)).toBe("max@itdesk:~$ xpwdy ");
  });

  test("walks through the history with Up and Down", async () => {
    const { log } = renderTerminal();
    await userEvent.keyboard("pwd{Enter}whoami{Enter}{ArrowUp}{ArrowUp}");
    expect(inputLine(log)).toBe("max@itdesk:~$ pwd ");
    await userEvent.keyboard("{ArrowDown}");
    expect(inputLine(log)).toBe("max@itdesk:~$ whoami ");
  });

  test("completes with Tab and keeps the focus", async () => {
    const { log, input } = renderTerminal();
    await userEvent.keyboard("cd wel{Tab}");
    expect(inputLine(log)).toBe("max@itdesk:~$ cd welcome/ ");
    expect(input).toBe(document.activeElement);
  });

  test("lists the matches on a second Tab", async () => {
    const { log } = renderTerminal();
    await userEvent.keyboard("c{Tab}{Tab}");
    expect(lines(log)).toEqual([
      "max@itdesk:~$ c",
      "cat    cd     clear  cp     ",
      "max@itdesk:~$ c ",
    ]);
  });

  test("interrupts the line with Ctrl+C", async () => {
    const { log } = renderTerminal();
    await userEvent.keyboard("ls -l{Control>}c{/Control}");
    expect(lines(log)).toEqual(["max@itdesk:~$ ls -l^C", "max@itdesk:~$  "]);
    await userEvent.keyboard("echo $?{Enter}");
    expect(lines(log).at(-2)).toBe("130");
  });

  test("lets Ctrl+C copy selected text instead", () => {
    const { log, input } = renderTerminal();
    fireEvent.input(input, { target: { value: "pwd" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const output = log.querySelector(".terminal__line");
    if (output === null) {
      throw new Error("the terminal shows no line");
    }
    document.getSelection()?.selectAllChildren(output);
    const notPrevented = fireEvent.keyDown(input, { key: "c", ctrlKey: true });
    expect(notPrevented).toBe(true);
    expect(lines(log).join("\n")).not.toContain("^C");
  });

  test("clears the screen with Ctrl+L and keeps the scrollback and the line", async () => {
    const { log } = renderTerminal();
    await userEvent.keyboard("pwd{Enter}ls{Control>}l{/Control}");
    const page = log.querySelector(".terminal__page");
    expect(page?.textContent).toBe("max@itdesk:~$ ls ");
    expect(lines(log)).toEqual(["max@itdesk:~$ pwd", "/home/max", "max@itdesk:~$ ls "]);
  });

  test("ignores the readline keys the game does not simulate, so the app keeps them", () => {
    const { log, input } = renderTerminal();
    fireEvent.input(input, { target: { value: "ls" } });
    for (const letter of ["w", "r", "u", "d"]) {
      expect(fireEvent.keyDown(input, { key: letter, ctrlKey: true })).toBe(false);
    }
    expect(inputLine(log)).toBe("max@itdesk:~$ ls ");
  });

  test("leaves Esc, the F-keys, Shift+Tab and Ctrl+V to the browser", () => {
    const { input } = renderTerminal();
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "F1" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "Tab", shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "v", ctrlKey: true })).toBe(true);
  });

  test("types characters that AltGr makes on a German keyboard", () => {
    const { log, input } = renderTerminal();
    expect(fireEvent.keyDown(input, { key: "|", ctrlKey: true, altKey: true })).toBe(true);
    fireEvent.input(input, { target: { value: "|" } });
    expect(inputLine(log)).toBe("max@itdesk:~$ | ");
    expect((input as HTMLTextAreaElement).value).toBe("");
  });

  test("waits for the end of a composition before it types", () => {
    const { log, input } = renderTerminal();
    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: "^" }, isComposing: true });
    expect(inputLine(log)).toBe("max@itdesk:~$  ");
    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(true);
    fireEvent.input(input, { target: { value: "ê" }, isComposing: true });
    fireEvent.compositionEnd(input);
    expect(inputLine(log)).toBe("max@itdesk:~$ ê ");
  });

  test("pastes text with line breaks into the line", async () => {
    const { log } = renderTerminal();
    await userEvent.paste("echo a\r\necho b");
    expect(lines(log)).toEqual(["max@itdesk:~$ echo a\necho b "]);
    await userEvent.keyboard("{Enter}");
    expect(lines(log).slice(1, 3)).toEqual(["a", "b"]);
  });

  test.each(MANDATORY_LANGUAGES)("shows a game notice in %s", async (language) => {
    const { log } = renderTerminal(language);
    await userEvent.keyboard("cat{Enter}");
    const notice = log.querySelector(".terminal__notice");
    expect(notice?.textContent).toBe(NAMES[language].notice);
    expect(notice?.querySelector("svg.icon")).not.toBeNull();
  });

  test("puts the focus back into the input line on a click", async () => {
    const { log, input } = renderTerminal();
    input.blur();
    await userEvent.click(log);
    expect(input).toBe(document.activeElement);
  });

  test("leaves the focus where it is while text is selected", () => {
    const { log, input } = renderTerminal();
    log.focus();
    document.getSelection()?.selectAllChildren(log);
    fireEvent.mouseUp(log, { button: 0 });
    expect(input).not.toBe(document.activeElement);
  });

  test("takes keys that reach the screen back into the input line", () => {
    const { log, input } = renderTerminal();
    log.focus();
    fireEvent.keyDown(log, { key: "Escape" });
    expect(input).toBe(document.activeElement);
  });

  test("scrolls with Shift+PageUp and Shift+PageDown", () => {
    const { log, input } = renderTerminal();
    expect(fireEvent.keyDown(input, { key: "PageUp", shiftKey: true })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "PageDown", shiftKey: true })).toBe(false);
    expect(log.scrollTop).toBe(0);
    expect(inputLine(log)).toBe("max@itdesk:~$  ");
  });
});
