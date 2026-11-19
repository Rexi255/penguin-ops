// The state of the game's terminal (ROADMAP M3.3, ADR 0095): the screen with its scrollback,
// the input line with its cursor, and what the keys do to them, like bash 5.2 with readline 8.2
// in an xterm-compatible terminal. Every function is pure: it takes a state and returns the next
// one, so the React component only stores states and draws them, and the tests need no DOM.
//
// The shell itself is the level session of the gameplay package; the engine computes the prompt,
// the completion and the history navigation. This module owns what readline and the terminal
// emulator add: the line editing, when Tab lists, the question before long lists, Ctrl+C, Ctrl+L,
// the continuation prompt and the scrollback.

import {
  acceptHistoryLine,
  AT_NEW_LINE,
  type CompletionMatch,
  completionQuestion,
  CONTINUATION_PROMPT,
  createGameClock,
  formatCompletionList,
  type HistoryNavigation,
  nextHistory,
  previousHistory,
} from "@penguin-ops/engine";
import {
  completeInput,
  interruptLevelInput,
  levelPrompt,
  type LevelSession,
  runInput,
  type TerminalEvent,
} from "@penguin-ops/gameplay";

/**
 * How a piece of text is drawn: plain terminal text, or one of the coloured parts of Debian's
 * prompt, `user@host` (bold green) and the working directory (bold blue).
 */
export type SpanStyle = "plain" | "prompt-user" | "prompt-directory";

/** A piece of a line in one style. */
export interface Span {
  readonly text: string;
  readonly style: SpanStyle;
}

/** A terminal event that the game explains with a notice instead of terminal output. */
export type NoticeEvent = Extract<
  TerminalEvent,
  { readonly kind: "unsupported" | "notice" | "syntax-unsupported" }
>;

/** A finished line of the screen. `id` is unique within a terminal and never reused. */
export type ScreenLine =
  /** Text the terminal shows: output, or an echoed prompt with its input. */
  | { readonly kind: "text"; readonly id: number; readonly spans: readonly Span[] }
  /** A game notice: the game, not the shell, says something (ADR 0052). */
  | { readonly kind: "notice"; readonly id: number; readonly event: NoticeEvent };

/** What the terminal shows above the input line. */
export interface Screen {
  /** The finished lines, oldest first; at most `SCROLLBACK_LINES`. */
  readonly lines: readonly ScreenLine[];
  /**
   * The index in `lines` of the first line of the page, the lines after the last screen clear
   * (`clear -x`, Ctrl+L). The lines before it are scrollback above the screen.
   */
  readonly pageStart: number;
  /**
   * The text on the current line that the output left without a line break (`echo -n`); the
   * next prompt follows it on the same line, like in a real terminal.
   */
  readonly partial: readonly Span[];
  /** The ID of the next line. */
  readonly nextId: number;
}

/** readline's question before a long list of matches, waiting for y or n. */
export interface CompletionQuestion {
  readonly text: string;
  readonly matches: readonly CompletionMatch[];
}

/** The whole state of a terminal. */
export interface TerminalState {
  /** The ticket being played: the world and the player's shell. */
  readonly session: LevelSession;
  /** The game time; every input that runs moves it forward (`runInput`). */
  readonly time: number;
  readonly screen: Screen;
  /** The input line as typed, without the prompt. */
  readonly line: string;
  /** The cursor as an offset in `line` (UTF-16 code units), from 0 to `line.length`. */
  readonly cursor: number;
  /**
   * The earlier lines of an input that needs more lines (an open quote, a trailing `|`), joined
   * with line breaks; `undefined` when the next line starts a new input.
   */
  readonly pending: string | undefined;
  /** Where the input line is in the history (ADR 0066). */
  readonly navigation: HistoryNavigation;
  /** Whether the last key was a Tab that left the line unchanged: the next Tab lists (ADR 0065). */
  readonly tabUnchanged: boolean;
  /** readline's question before a long list, while it waits for the answer. */
  readonly question: CompletionQuestion | undefined;
}

/**
 * The most lines the terminal keeps. Debian's GNOME Terminal keeps 10,000 lines of scrollback by
 * default; older lines are dropped.
 */
export const SCROLLBACK_LINES = 10_000;

/** What readline echoes when Ctrl+C interrupts the input line. */
const INTERRUPT_ECHO = "^C";

/** The bell (BEL), which makes no mark on the screen. */
const BELL = 0x07;

/** DEL, which the Backspace key sends (readline's RUBOUT). */
const DELETE = "\u007f";

/** A new terminal for a level session that just started at the game time `time`. */
export function createTerminal(session: LevelSession, time: number): TerminalState {
  return {
    session,
    time,
    screen: { lines: [], pageStart: 0, partial: [], nextId: 0 },
    line: "",
    cursor: 0,
    pending: undefined,
    navigation: AT_NEW_LINE,
    tabUnchanged: false,
    question: undefined,
  };
}

/** The prompt before the input line: Debian's `PS1`, or `PS2` while an input continues. */
export function promptSpans(state: TerminalState): readonly Span[] {
  if (state.pending !== undefined) {
    return [{ text: CONTINUATION_PROMPT, style: "plain" }];
  }
  const prompt = levelPrompt(state.session);
  return [
    { text: prompt.userAtHost, style: "prompt-user" },
    { text: ":", style: "plain" },
    { text: prompt.directory, style: "prompt-directory" },
    { text: `${prompt.sign} `, style: "plain" },
  ];
}

/** The line the cursor is on, split at the cursor, as the terminal draws it. */
export interface ActiveLine {
  /** Everything before the cursor: the partial output, the prompt and the input up to it. */
  readonly before: readonly Span[];
  /** The character under the cursor, a space at the end of the line. */
  readonly atCursor: string;
  /** The input after the character under the cursor. */
  readonly after: string;
}

/**
 * The current line: the partial output, the prompt and the input line with the cursor, or
 * readline's question with the cursor after it. Control characters are shown like readline
 * shows them, in caret notation (`^X`). A line break or tab under the cursor is drawn after it,
 * so that the cursor stays one cell wide.
 */
export function activeLine(state: TerminalState): ActiveLine {
  const { screen, question, line, cursor } = state;
  if (question !== undefined) {
    return { before: [...screen.partial, plain(question.text)], atCursor: " ", after: "" };
  }
  const next = nextBoundary(line, cursor);
  const character = line.slice(cursor, next);
  const drawnAfter = character === "\n" || character === "\t" || character === "";
  return {
    before: joinSpans([
      ...screen.partial,
      ...promptSpans(state),
      plain(visibleText(line.slice(0, cursor))),
    ]),
    atCursor: drawnAfter ? " " : visibleText(character),
    after: visibleText(drawnAfter ? line.slice(cursor) : line.slice(next)),
  };
}

/**
 * Types `text` at the cursor. Line breaks of a paste (`\r\n`, `\r`) become `\n` and stay in the
 * line, as with bash's bracketed paste: Enter runs them all. While readline asks its question,
 * the first character answers it and the rest is typed after.
 */
export function insertText(state: TerminalState, text: string, columns: number): TerminalState {
  let current = state;
  let rest = text.replace(/\r\n?/gu, "\n");
  while (current.question !== undefined && rest !== "") {
    const answer = String.fromCodePoint(rest.codePointAt(0) ?? 0);
    current = answerQuestion(current, answer, columns);
    rest = rest.slice(answer.length);
  }
  if (rest === "") {
    return current;
  }
  const { line, cursor } = current;
  return edited(current, line.slice(0, cursor) + rest + line.slice(cursor), cursor + rest.length);
}

/** Backspace (readline's `backward-delete-char`); while readline asks, it answers "no". */
export function deleteBackward(state: TerminalState, columns: number): TerminalState {
  if (state.question !== undefined) {
    return answerQuestion(state, DELETE, columns);
  }
  const { line, cursor } = state;
  if (cursor === 0) {
    return state;
  }
  const start = previousBoundary(line, cursor);
  return edited(state, line.slice(0, start) + line.slice(cursor), start);
}

/** Delete (Debian's `/etc/inputrc` binds it to `delete-char`): removes the character under the cursor. */
export function deleteForward(state: TerminalState): TerminalState {
  const { line, cursor } = state;
  if (state.question !== undefined || cursor === line.length) {
    return state;
  }
  return edited(state, line.slice(0, cursor) + line.slice(nextBoundary(line, cursor)), cursor);
}

/** Left (`backward-char`). */
export function moveLeft(state: TerminalState): TerminalState {
  return moveTo(state, previousBoundary(state.line, state.cursor));
}

/** Right (`forward-char`). */
export function moveRight(state: TerminalState): TerminalState {
  return moveTo(state, nextBoundary(state.line, state.cursor));
}

/** Home and Ctrl+A (`beginning-of-line`). */
export function moveToStart(state: TerminalState): TerminalState {
  return moveTo(state, 0);
}

/** End and Ctrl+E (`end-of-line`). */
export function moveToEnd(state: TerminalState): TerminalState {
  return moveTo(state, state.line.length);
}

/** Up (`previous-history`, ADR 0066). */
export function historyUp(state: TerminalState): TerminalState {
  if (state.question !== undefined) {
    return state;
  }
  const step = previousHistory(state.session.shell, state.navigation, state.line);
  return {
    ...state,
    session: { ...state.session, shell: step.session },
    navigation: step.navigation,
    line: step.line,
    cursor: step.cursor,
    tabUnchanged: false,
  };
}

/** Down (`next-history`, ADR 0066). */
export function historyDown(state: TerminalState): TerminalState {
  if (state.question !== undefined) {
    return state;
  }
  const step = nextHistory(state.session.shell, state.navigation, state.line);
  return {
    ...state,
    session: { ...state.session, shell: step.session },
    navigation: step.navigation,
    line: step.line,
    cursor: step.cursor,
    tabUnchanged: false,
  };
}

/**
 * Tab (`complete`, ADR 0065). The first Tab applies the completion. A Tab right after a Tab that
 * left the line unchanged lists the matches below the input line, in columns for a terminal
 * `columns` wide, and shows the prompt and the line again; from `COMPLETION_QUERY_ITEMS`
 * matches on, readline first asks whether to show them all.
 */
export function pressTab(state: TerminalState, columns: number): TerminalState {
  if (state.question !== undefined) {
    return state;
  }
  const completion = completeInput(state.session, state.line, state.cursor);
  if (!state.tabUnchanged) {
    const unchanged = completion.line === state.line && completion.cursor === state.cursor;
    return { ...state, line: completion.line, cursor: completion.cursor, tabUnchanged: unchanged };
  }
  const { matches } = completion;
  if (matches.length === 0) {
    return state;
  }
  const screen = finishLine(state.screen, currentLineSpans(state));
  const question = completionQuestion(matches.length);
  if (question !== undefined) {
    return { ...state, screen, question: { text: question, matches } };
  }
  return { ...state, screen: showText(screen, formatCompletionList(matches, columns)) };
}

/**
 * Enter (`accept-line`). The prompt and the line stay on the screen. The line, after the earlier
 * lines of an incomplete input, goes to the level session: an input that needs another line
 * waits for it behind the continuation prompt; any other input runs, and its output and notices
 * follow on the screen. The game time moves on as the session runs the input. While readline
 * asks its question, Enter changes nothing.
 */
export function submit(state: TerminalState, columns: number): TerminalState {
  if (state.question !== undefined) {
    return state;
  }
  const screen = finishLine(state.screen, currentLineSpans(state));
  const input = state.pending === undefined ? state.line : `${state.pending}\n${state.line}`;
  const session: LevelSession = {
    ...state.session,
    shell: acceptHistoryLine(state.session.shell, state.navigation),
  };
  const clock = createGameClock(state.time);
  const result = runInput(session, input, { clock, terminal: { columns } });
  const next: TerminalState = {
    ...state,
    line: "",
    cursor: 0,
    navigation: AT_NEW_LINE,
    tabUnchanged: false,
    time: clock.now(),
  };
  switch (result.kind) {
    case "incomplete":
      return { ...next, session, screen, pending: input };
    case "ran":
      return {
        ...next,
        session: result.session,
        screen: showEvents(screen, result.terminal),
        pending: undefined,
      };
  }
}

/**
 * Ctrl+C: readline echoes `^C` after the line and drops it, with the earlier lines of an
 * incomplete input; the next prompt is the primary one, and the shell's exit status becomes 130.
 * While readline asks its question, the question line gets the `^C`.
 */
export function interrupt(state: TerminalState): TerminalState {
  const shown =
    state.question === undefined
      ? currentLineSpans(state)
      : [...state.screen.partial, plain(state.question.text)];
  return {
    ...state,
    session: interruptLevelInput(state.session),
    screen: finishLine(state.screen, [...shown, plain(INTERRUPT_ECHO)]),
    line: "",
    cursor: 0,
    pending: undefined,
    navigation: AT_NEW_LINE,
    tabUnchanged: false,
    question: undefined,
  };
}

/**
 * Ctrl+L (`clear-screen`): the screen is cleared and the prompt and the line are drawn again at
 * its top; the lines before stay in the scrollback, like `clear -x`. While readline asks its
 * question, Ctrl+L changes nothing.
 */
export function clearScreen(state: TerminalState): TerminalState {
  if (state.question !== undefined) {
    return state;
  }
  return { ...state, screen: clearPage(state.screen), tabUnchanged: false };
}

/** The page of the screen: the lines since the last screen clear. */
export function pageLines(screen: Screen): readonly ScreenLine[] {
  return screen.lines.slice(screen.pageStart);
}

/** The scrollback: the lines before the last screen clear. */
export function scrollbackLines(screen: Screen): readonly ScreenLine[] {
  return screen.lines.slice(0, screen.pageStart);
}

/**
 * Text as the terminal shows it: tabs and line breaks stay (the screen lays them out), the bell
 * makes no mark, and the other C0 control characters and DEL appear in caret notation (`^[`,
 * `^?`). The game's terminal does not interpret escape sequences yet (ADR 0095).
 */
export function visibleText(text: string): string {
  let visible = "";
  for (const character of text) {
    const code = character.charCodeAt(0);
    const control = code < 0x20 || code === 0x7f;
    if (!control || character === "\t" || character === "\n") {
      visible += character;
    } else if (code !== BELL) {
      visible += `^${code === 0x7f ? "?" : String.fromCharCode(code + 0x40)}`;
    }
  }
  return visible;
}

/** readline's answer to its question: y, Y or space lists; n, N or DEL does not; others wait. */
function answerQuestion(state: TerminalState, key: string, columns: number): TerminalState {
  const { question } = state;
  if (question === undefined) {
    return state;
  }
  const yes = key === "y" || key === "Y" || key === " ";
  const no = key === "n" || key === "N" || key === DELETE;
  if (!yes && !no) {
    return state;
  }
  const screen = finishLine(state.screen, [plain(question.text)]);
  return {
    ...state,
    question: undefined,
    screen: yes ? showText(screen, formatCompletionList(question.matches, columns)) : screen,
  };
}

/** The current line as it stands: partial output, prompt and the whole input line. */
function currentLineSpans(state: TerminalState): readonly Span[] {
  return [...state.screen.partial, ...promptSpans(state), plain(visibleText(state.line))];
}

function edited(state: TerminalState, line: string, cursor: number): TerminalState {
  return { ...state, line, cursor, tabUnchanged: false };
}

function moveTo(state: TerminalState, cursor: number): TerminalState {
  if (state.question !== undefined) {
    return state;
  }
  return { ...state, cursor, tabUnchanged: false };
}

/** Shows the events of an input: output text, screen clears and game notices, in order. */
function showEvents(screen: Screen, events: readonly TerminalEvent[]): Screen {
  return events.reduce((current, event): Screen => {
    switch (event.kind) {
      case "output":
        return showText(current, event.text);
      case "clear-screen":
        return event.clearsScrollback
          ? { lines: [], pageStart: 0, partial: [], nextId: current.nextId }
          : clearPage(current);
      case "unsupported":
      case "notice":
      case "syntax-unsupported": {
        const finished =
          current.partial.length > 0 ? finishLine(current, current.partial) : current;
        return addLine(finished, { kind: "notice", id: finished.nextId, event });
      }
    }
  }, screen);
}

/**
 * Adds output text: the first piece continues the partial line, every line break finishes a
 * line, and the text after the last line break is the new partial line.
 */
function showText(screen: Screen, text: string): Screen {
  const pieces = visibleText(text).split("\n");
  let current = screen;
  pieces.forEach((piece, index) => {
    const spans = piece === "" ? current.partial : joinSpans([...current.partial, plain(piece)]);
    current =
      index < pieces.length - 1 ? finishLine(current, spans) : { ...current, partial: spans };
  });
  return current;
}

/** Finishes the current line with `spans` (which include the partial line) and starts a new one. */
function finishLine(screen: Screen, spans: readonly Span[]): Screen {
  return addLine(
    { ...screen, partial: [] },
    { kind: "text", id: screen.nextId, spans: joinSpans(spans) },
  );
}

/** Starts a new page: the finished lines and a partial line go to the scrollback. */
function clearPage(screen: Screen): Screen {
  const finished = screen.partial.length > 0 ? finishLine(screen, screen.partial) : screen;
  return { ...finished, pageStart: finished.lines.length };
}

/** Adds a finished line and drops the oldest lines beyond `SCROLLBACK_LINES`. */
function addLine(screen: Screen, line: ScreenLine): Screen {
  const lines = [...screen.lines, line];
  const dropped = Math.max(0, lines.length - SCROLLBACK_LINES);
  return {
    ...screen,
    lines: dropped === 0 ? lines : lines.slice(dropped),
    pageStart: Math.max(0, screen.pageStart - dropped),
    nextId: screen.nextId + 1,
  };
}

/** Joins neighbouring spans of the same style and drops empty ones. */
function joinSpans(spans: readonly Span[]): readonly Span[] {
  const joined: Span[] = [];
  for (const span of spans) {
    const last = joined.at(-1);
    if (span.text === "") {
      continue;
    }
    if (last?.style === span.style) {
      joined[joined.length - 1] = { text: last.text + span.text, style: span.style };
    } else {
      joined.push(span);
    }
  }
  return joined;
}

function plain(text: string): Span {
  return { text, style: "plain" };
}

/** The offset of the character before `index`, a surrogate pair counted as one character. */
function previousBoundary(text: string, index: number): number {
  if (index <= 0) {
    return 0;
  }
  const low = text.charCodeAt(index - 1);
  const high = text.charCodeAt(index - 2);
  return isLowSurrogate(low) && isHighSurrogate(high) ? index - 2 : index - 1;
}

/** The offset after the character at `index`, a surrogate pair counted as one character. */
function nextBoundary(text: string, index: number): number {
  if (index >= text.length) {
    return text.length;
  }
  const high = text.charCodeAt(index);
  const low = text.charCodeAt(index + 1);
  return isHighSurrogate(high) && isLowSurrogate(low) ? index + 2 : index + 1;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
