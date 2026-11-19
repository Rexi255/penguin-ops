// Tests of the terminal model: line editing, Enter with output, notices and continuation lines,
// Ctrl+C, Ctrl+L and clear, the history keys, Tab with its list and question, and the scrollback.
import { baseWorldSchema, levelSchema } from "@penguin-ops/content";
import { COMPLETION_QUERY_ITEMS, createGameClock, TIME_PER_INPUT } from "@penguin-ops/engine";
import { startLevel } from "@penguin-ops/gameplay";
import { describe, expect, test } from "vitest";

import {
  activeLine,
  clearScreen,
  createTerminal,
  deleteBackward,
  deleteForward,
  historyDown,
  historyUp,
  insertText,
  interrupt,
  moveLeft,
  moveRight,
  moveToEnd,
  moveToStart,
  pageLines,
  pressTab,
  promptSpans,
  SCROLLBACK_LINES,
  type ScreenLine,
  scrollbackLines,
  submit,
  type TerminalState,
  visibleText,
} from "./terminal-model";

const START_TIME = 1_767_600_000_000;
const COLUMNS = 80;
const MANY_FILES = COMPLETION_QUERY_ITEMS + 20;

const WORLD = baseWorldSchema.parse({
  format: 1,
  id: "office",
  hosts: [
    {
      name: "desk",
      groups: [{ name: "root", gid: 0 }],
      users: [{ name: "root", uid: 0 }],
      files: {
        "/var/log/syslog": "disk full\n",
        "/var/log/long.log": "x\n".repeat(SCROLLBACK_LINES + 50),
        ...Object.fromEntries(
          Array.from({ length: MANY_FILES }, (_, index) => [
            `/many/f${String(index).padStart(3, "0")}`,
            "",
          ]),
        ),
      },
    },
  ],
});

const LEVEL = levelSchema.parse({
  format: 1,
  id: "test-level",
  kind: "main",
  teaches: ["cd"],
  start: { files: { "~/projects/": {}, "~/notes.txt": "hello\n" } },
  goal: { cwd_is: "/var/log" },
  solutions: [["cd /var/log"]],
});

function terminal(): TerminalState {
  const clock = createGameClock(START_TIME);
  const session = startLevel(
    { level: LEVEL, world: WORLD, fileTexts: new Map(), player: "alice" },
    clock,
  );
  return createTerminal(session, clock.now());
}

/** Types `text` and presses Enter. */
function run(state: TerminalState, text: string): TerminalState {
  return submit(insertText(state, text, COLUMNS), COLUMNS);
}

/** The text of a screen line; a notice shows its event kind in brackets. */
function lineText(line: ScreenLine): string {
  return line.kind === "text"
    ? line.spans.map((span) => span.text).join("")
    : `[${line.event.kind}]`;
}

function screenText(state: TerminalState): string[] {
  return state.screen.lines.map(lineText);
}

/** The active line as text, with the cursor shown as `|` before the character under it. */
function shownLine(state: TerminalState): string {
  const { before, atCursor, after } = activeLine(state);
  return `${before.map((span) => span.text).join("")}|${atCursor}${after}`;
}

describe("a new terminal", () => {
  test("shows an empty screen and Debian's prompt", () => {
    const state = terminal();
    expect(state.screen).toEqual({ lines: [], pageStart: 0, partial: [], nextId: 0 });
    expect(promptSpans(state)).toEqual([
      { text: "alice@desk", style: "prompt-user" },
      { text: ":", style: "plain" },
      { text: "~", style: "prompt-directory" },
      { text: "$ ", style: "plain" },
    ]);
    expect(shownLine(state)).toBe("alice@desk:~$ | ");
    expect(state.time).toBe(START_TIME);
  });
});

describe("line editing", () => {
  test("types at the cursor and moves it", () => {
    let state = insertText(terminal(), "lsa", COLUMNS);
    state = moveLeft(state);
    state = insertText(state, " -", COLUMNS);
    expect(state).toMatchObject({ line: "ls -a", cursor: 4 });
    expect(shownLine(state)).toBe("alice@desk:~$ ls -|a");
  });

  test("moves to the start and the end of the line", () => {
    let state = insertText(terminal(), "pwd", COLUMNS);
    state = moveToStart(state);
    expect(state.cursor).toBe(0);
    expect(shownLine(state)).toBe("alice@desk:~$ |pwd");
    expect(moveLeft(state).cursor).toBe(0);
    state = moveToEnd(state);
    expect(state.cursor).toBe(3);
    expect(moveRight(state).cursor).toBe(3);
  });

  test("deletes before and under the cursor", () => {
    let state = insertText(terminal(), "echo", COLUMNS);
    state = deleteBackward(state, COLUMNS);
    expect(state).toMatchObject({ line: "ech", cursor: 3 });
    state = moveToStart(state);
    expect(deleteBackward(state, COLUMNS)).toBe(state);
    state = deleteForward(state);
    expect(state).toMatchObject({ line: "ch", cursor: 0 });
    expect(deleteForward(moveToEnd(state))).toEqual(moveToEnd(state));
  });

  test("treats a character outside the BMP as one character", () => {
    let state = insertText(terminal(), "a😀b", COLUMNS);
    state = moveLeft(moveLeft(state));
    expect(state.cursor).toBe(1);
    expect(shownLine(state)).toBe("alice@desk:~$ a|😀b");
    state = moveRight(state);
    expect(state.cursor).toBe(3);
    state = deleteBackward(state, COLUMNS);
    expect(state).toMatchObject({ line: "ab", cursor: 1 });
    state = insertText(moveToStart(state), "😀", COLUMNS);
    state = moveToStart(state);
    expect(deleteForward(state).line).toBe("ab");
  });

  test("keeps the line breaks of a paste in the line", () => {
    const state = insertText(terminal(), "echo a\r\necho b\recho c", COLUMNS);
    expect(state.line).toBe("echo a\necho b\necho c");
    const ran = submit(state, COLUMNS);
    expect(screenText(ran)).toEqual(["alice@desk:~$ echo a\necho b\necho c", "a", "b", "c"]);
  });

  test("shows control characters in caret notation and the cursor before a line break", () => {
    let state = insertText(terminal(), "a\u0001b\nc", COLUMNS);
    state = moveLeft(moveLeft(moveLeft(state)));
    expect(activeLine(state)).toMatchObject({ atCursor: "b", after: "\nc" });
    state = moveRight(state);
    expect(activeLine(state)).toMatchObject({ atCursor: " ", after: "\nc" });
    state = moveLeft(moveLeft(state));
    expect(activeLine(state).atCursor).toBe("^A");
  });
});

describe("Enter", () => {
  test("keeps the prompt and the input on the screen and shows the output", () => {
    const state = run(terminal(), "pwd");
    expect(screenText(state)).toEqual(["alice@desk:~$ pwd", "/home/alice"]);
    expect(state.screen.lines[0]).toEqual({
      kind: "text",
      id: 0,
      spans: [
        { text: "alice@desk", style: "prompt-user" },
        { text: ":", style: "plain" },
        { text: "~", style: "prompt-directory" },
        { text: "$ pwd", style: "plain" },
      ],
    });
    expect(state).toMatchObject({ line: "", cursor: 0, pending: undefined });
    expect(state.time).toBe(START_TIME + TIME_PER_INPUT);
  });

  test("shows the new working directory in the next prompt", () => {
    const state = run(terminal(), "cd /var/log");
    expect(shownLine(state)).toBe("alice@desk:/var/log$ | ");
    expect(state.session.solved).toBe(true);
  });

  test("shows standard error like standard output", () => {
    const state = run(terminal(), "ls missing");
    expect(screenText(state).at(-1)).toBe("ls: cannot access 'missing': No such file or directory");
  });

  test("shows bash's message for a syntax error", () => {
    expect(screenText(run(terminal(), "ls |")).length).toBe(1);
    const state = run(terminal(), "ls ;;");
    expect(screenText(state).at(-1)).toBe("bash: syntax error near unexpected token `;;'");
  });

  test("puts the next prompt after output without a line break", () => {
    const state = run(terminal(), "echo -n foo");
    expect(screenText(state)).toEqual(["alice@desk:~$ echo -n foo"]);
    expect(shownLine(state)).toBe("fooalice@desk:~$ | ");
    const next = run(state, "pwd");
    expect(screenText(next)).toEqual([
      "alice@desk:~$ echo -n foo",
      "fooalice@desk:~$ pwd",
      "/home/alice",
    ]);
  });

  test("runs an empty line and shows the prompt again", () => {
    const state = submit(terminal(), COLUMNS);
    expect(screenText(state)).toEqual(["alice@desk:~$ "]);
    expect(shownLine(state)).toBe("alice@desk:~$ | ");
  });

  test("continues an incomplete input behind the continuation prompt", () => {
    let state = run(terminal(), 'echo "a');
    expect(state.pending).toBe('echo "a');
    expect(state.time).toBe(START_TIME);
    expect(shownLine(state)).toBe("> | ");
    state = run(state, 'b"');
    expect(screenText(state)).toEqual(['alice@desk:~$ echo "a', '> b"', "a", "b"]);
    expect(state.pending).toBeUndefined();
    expect(shownLine(state)).toBe("alice@desk:~$ | ");
    expect(state.session.shell.history.entries.map((entry) => entry.line)).toEqual(['echo "a\nb"']);
  });

  test("shows a notice for a feature the game does not simulate", () => {
    const state = run(terminal(), "echo $$");
    expect(screenText(state)).toEqual(["alice@desk:~$ echo $$", "[unsupported]"]);
    expect(state.screen.lines[1]).toMatchObject({ kind: "notice", event: { kind: "unsupported" } });
  });

  test("shows a notice for unsupported syntax and for a command's notice", () => {
    expect(screenText(run(terminal(), "ls &")).at(-1)).toBe("[syntax-unsupported]");
    expect(screenText(run(terminal(), "cat")).at(-1)).toBe("[notice]");
  });

  test("finishes a partial line before a notice", () => {
    const state = run(terminal(), "echo -n x; cat");
    expect(screenText(state)).toEqual(["alice@desk:~$ echo -n x; cat", "x", "[notice]"]);
    expect(state.screen.partial).toEqual([]);
  });
});

describe("clearing the screen", () => {
  test("clear empties the screen and the scrollback", () => {
    let state = run(terminal(), "pwd");
    state = run(state, "clear");
    expect(state.screen.lines).toEqual([]);
    expect(state.screen.pageStart).toBe(0);
    expect(run(state, "pwd").screen.lines[0]?.id).toBe(state.screen.nextId);
  });

  test("clear -x starts a new page and keeps the scrollback", () => {
    let state = run(terminal(), "pwd");
    state = run(state, "clear -x");
    expect(scrollbackLines(state.screen).map(lineText)).toEqual([
      "alice@desk:~$ pwd",
      "/home/alice",
      "alice@desk:~$ clear -x",
    ]);
    expect(pageLines(state.screen)).toEqual([]);
    state = run(state, "whoami");
    expect(pageLines(state.screen).map(lineText)).toEqual(["alice@desk:~$ whoami", "alice"]);
  });

  test("Ctrl+L starts a new page and keeps the input line", () => {
    let state = run(terminal(), "pwd");
    state = insertText(state, "ls", COLUMNS);
    state = clearScreen(state);
    expect(state.screen.pageStart).toBe(2);
    expect(pageLines(state.screen)).toEqual([]);
    expect(shownLine(state)).toBe("alice@desk:~$ ls| ");
  });

  test("Ctrl+L moves a partial line into the scrollback", () => {
    const state = clearScreen(run(terminal(), "echo -n foo"));
    expect(scrollbackLines(state.screen).map(lineText)).toEqual([
      "alice@desk:~$ echo -n foo",
      "foo",
    ]);
    expect(shownLine(state)).toBe("alice@desk:~$ | ");
  });
});

describe("the scrollback", () => {
  test("keeps the newest lines up to its limit", () => {
    const state = run(terminal(), "cat /var/log/long.log");
    expect(state.screen.lines).toHaveLength(SCROLLBACK_LINES);
    expect(state.screen.lines[0]?.id).toBe(51);
    expect(state.screen.nextId).toBe(SCROLLBACK_LINES + 51);
  });

  test("moves the page start back when old lines are dropped", () => {
    let state = run(terminal(), "pwd");
    state = clearScreen(state);
    expect(state.screen.pageStart).toBe(2);
    state = run(state, "cat /var/log/long.log");
    expect(state.screen.pageStart).toBe(0);
    state = clearScreen(state);
    state = run(state, "pwd");
    state = run(state, "cat /var/log/long.log");
    expect(state.screen.pageStart).toBe(0);
    state = clearScreen(state);
    state = run(state, "pwd");
    expect(state.screen.pageStart).toBe(SCROLLBACK_LINES - 2);
  });
});

describe("Ctrl+C", () => {
  test("echoes ^C, drops the line and sets the exit status to 130", () => {
    let state = interrupt(insertText(terminal(), "ls -l", COLUMNS));
    expect(screenText(state)).toEqual(["alice@desk:~$ ls -l^C"]);
    expect(state).toMatchObject({ line: "", cursor: 0 });
    expect(state.time).toBe(START_TIME);
    state = run(state, "echo $?");
    expect(screenText(state).at(-1)).toBe("130");
    expect(state.session.shell.history.entries.map((entry) => entry.line)).toEqual(["echo $?"]);
  });

  test("drops an incomplete input", () => {
    let state = run(terminal(), 'echo "a');
    state = interrupt(insertText(state, "b", COLUMNS));
    expect(screenText(state)).toEqual(['alice@desk:~$ echo "a', "> b^C"]);
    expect(state.pending).toBeUndefined();
    expect(shownLine(state)).toBe("alice@desk:~$ | ");
  });

  test("leaves the history and starts the next line at the new line", () => {
    let state = run(run(terminal(), "pwd"), "whoami");
    state = interrupt(historyUp(state));
    expect(screenText(state).at(-1)).toBe("alice@desk:~$ whoami^C");
    expect(historyUp(state).line).toBe("whoami");
  });
});

describe("history keys", () => {
  test("Up and Down walk through the history", () => {
    let state = run(run(terminal(), "pwd"), "whoami");
    state = insertText(state, "ec", COLUMNS);
    state = historyUp(state);
    expect(state).toMatchObject({ line: "whoami", cursor: 6 });
    state = historyUp(state);
    expect(state.line).toBe("pwd");
    expect(historyUp(state).line).toBe("pwd");
    state = historyDown(historyDown(state));
    expect(state).toMatchObject({ line: "ec", cursor: 2 });
  });

  test("Enter on an edited entry runs the edit and restores the entry", () => {
    let state = run(terminal(), "echo one");
    state = insertText(historyUp(state), "s", COLUMNS);
    state = submit(state, COLUMNS);
    expect(screenText(state).at(-1)).toBe("ones");
    expect(state.session.shell.history.entries.map((entry) => entry.line)).toEqual([
      "echo one",
      "echo ones",
    ]);
  });
});

describe("Tab", () => {
  test("completes a single match", () => {
    const state = pressTab(insertText(terminal(), "cd pro", COLUMNS), COLUMNS);
    expect(state).toMatchObject({ line: "cd projects/", cursor: 12, tabUnchanged: false });
  });

  test("lists the matches on a second Tab that follows a Tab without a change", () => {
    let state = pressTab(insertText(terminal(), "c", COLUMNS), COLUMNS);
    expect(state).toMatchObject({ line: "c", tabUnchanged: true });
    expect(state.screen.lines).toEqual([]);
    state = pressTab(state, COLUMNS);
    expect(screenText(state)).toEqual(["alice@desk:~$ c", "cat    cd     clear  cp     "]);
    expect(shownLine(state)).toBe("alice@desk:~$ c| ");
    expect(screenText(pressTab(state, COLUMNS))).toHaveLength(4);
  });

  test("does not list after a Tab that changed the line", () => {
    let state = pressTab(insertText(terminal(), "ls /many/", COLUMNS), COLUMNS);
    expect(state).toMatchObject({ line: "ls /many/f", tabUnchanged: false });
    state = pressTab(state, COLUMNS);
    expect(state).toMatchObject({ line: "ls /many/f", tabUnchanged: true });
    expect(state.screen.lines).toEqual([]);
  });

  test("lists nothing when nothing matches", () => {
    let state = pressTab(insertText(terminal(), "ls zz", COLUMNS), COLUMNS);
    state = pressTab(state, COLUMNS);
    expect(state.screen.lines).toEqual([]);
    expect(state.line).toBe("ls zz");
  });

  test("lays out the list for the terminal's width", () => {
    let state = insertText(terminal(), "c", COLUMNS);
    state = pressTab(pressTab(state, 10), 10);
    expect(screenText(state).slice(1)).toEqual(["cat", "cd", "clear", "cp"]);
  });

  test("forgets the Tab after any other key", () => {
    let state = pressTab(insertText(terminal(), "c", COLUMNS), COLUMNS);
    state = moveToEnd(state);
    expect(state.tabUnchanged).toBe(false);
    expect(pressTab(state, COLUMNS).screen.lines).toEqual([]);
  });
});

describe("readline's question before a long list", () => {
  function asking(): TerminalState {
    let state = insertText(terminal(), "ls /many/f", COLUMNS);
    state = pressTab(pressTab(state, COLUMNS), COLUMNS);
    return state;
  }

  test("asks before it lists many matches", () => {
    const state = asking();
    expect(state.question?.text).toBe(`Display all ${String(MANY_FILES)} possibilities? (y or n)`);
    expect(screenText(state)).toEqual(["alice@desk:~$ ls /many/f"]);
    expect(shownLine(state)).toBe(`Display all ${String(MANY_FILES)} possibilities? (y or n)| `);
  });

  test.each(["y", "Y", " "])("lists them after %j", (answer) => {
    const state = insertText(asking(), answer, COLUMNS);
    expect(state.question).toBeUndefined();
    const lines = screenText(state);
    expect(lines[1]).toBe(`Display all ${String(MANY_FILES)} possibilities? (y or n)`);
    expect(lines[2]?.startsWith("f000")).toBe(true);
    expect(lines.join("\n")).toContain(`f${String(MANY_FILES - 1)}`);
    expect(shownLine(state)).toBe("alice@desk:~$ ls /many/f| ");
  });

  test.each(["n", "N"])("does not list them after %j", (answer) => {
    const state = insertText(asking(), answer, COLUMNS);
    expect(state.question).toBeUndefined();
    expect(screenText(state)).toHaveLength(2);
    expect(shownLine(state)).toBe("alice@desk:~$ ls /many/f| ");
  });

  test("takes Backspace as no", () => {
    const state = deleteBackward(asking(), COLUMNS);
    expect(state.question).toBeUndefined();
    expect(state.line).toBe("ls /many/f");
  });

  test("waits on other keys", () => {
    const state = asking();
    expect(insertText(state, "x", COLUMNS)).toBe(state);
    for (const key of [
      submit,
      pressTab,
      (current: TerminalState) => clearScreen(current),
      (current: TerminalState) => moveLeft(current),
      (current: TerminalState) => moveToStart(current),
      (current: TerminalState) => deleteForward(current),
      (current: TerminalState) => historyUp(current),
      (current: TerminalState) => historyDown(current),
    ]) {
      expect(key(state, COLUMNS)).toBe(state);
    }
  });

  test("types the rest of a paste after the answer", () => {
    const state = insertText(asking(), "xn0", COLUMNS);
    expect(state.question).toBeUndefined();
    expect(state.line).toBe("ls /many/f0");
  });

  test("Ctrl+C ends the question @differential", () => {
    const state = interrupt(asking());
    expect(state.question).toBeUndefined();
    expect(screenText(state).at(-1)).toBe(
      `Display all ${String(MANY_FILES)} possibilities? (y or n)^C`,
    );
    expect(shownLine(state)).toBe("alice@desk:~$ | ");
  });
});

describe("visibleText", () => {
  test("keeps text, tabs and line breaks", () => {
    expect(visibleText("a\tb\nc äö 😀")).toBe("a\tb\nc äö 😀");
  });

  test("drops the bell and shows other controls in caret notation", () => {
    expect(visibleText("a\u0007b")).toBe("ab");
    expect(visibleText("\u001b[2J\r\u0000\u007f")).toBe("^[[2J^M^@^?");
  });
});
