// The game's terminal (ROADMAP M3.3, ADR 0095): it draws the state of `terminal-model.ts` and
// turns the player's keys into its functions. The screen is a log of lines in the monospace face;
// the page after the last screen clear is at least as high as the terminal, so a clear moves the
// prompt to the top and leaves the lines before it in the scrollback above. The player types into
// a transparent text field under the cursor, so that dead keys, AltGr and input methods work.
// What happens in the game after an input goes to the game screen (`onGameEvents`), which shows
// the ticket's progress (ROADMAP M3.5a, ADR 0097); every new state goes there too
// (`onStateChange`), which keeps the terminal of each ticket the player opened (M3.5c, ADR 0099).
// The game commands `help` and `hint` show their texts as lines of the game (M3.6b, ADR 0103);
// `hint` shows the ticket's next hint after the ones the player has seen.

import type { GameEvent } from "@penguin-ops/gameplay";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  memo,
  type MouseEvent,
  type Ref,
  type SyntheticEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Icon } from "../icons/icon";
import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import { GameLine, type TicketHints } from "./game-line";
import { noticeKey, noticeText } from "./notice-text";
import {
  columnsFor,
  DEFAULT_COLUMNS,
  type TerminalKeyAction,
  terminalKeyAction,
} from "./terminal-keys";
import {
  activeLine,
  clearScreen,
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
  type ScreenLine,
  scrollbackLines,
  type Span,
  type SpanStyle,
  submit,
  type TerminalState,
} from "./terminal-model";

/** A change of the terminal for a terminal `columns` wide. */
type Change = (state: TerminalState, columns: number) => TerminalState;

/** The characters measured to find the width of one cell. */
const MEASURED_CELLS = 10;

/** What each key action does to the state; the scroll keys move the view instead. */
const CHANGES: Readonly<
  Record<Exclude<TerminalKeyAction, "scroll-up" | "scroll-down" | "submit">, Change>
> = {
  "delete-backward": deleteBackward,
  "delete-forward": (state) => deleteForward(state),
  "move-left": (state) => moveLeft(state),
  "move-right": (state) => moveRight(state),
  "move-to-start": (state) => moveToStart(state),
  "move-to-end": (state) => moveToEnd(state),
  "history-up": (state) => historyUp(state),
  "history-down": (state) => historyDown(state),
  complete: pressTab,
  interrupt: (state) => interrupt(state),
  "clear-screen": (state) => clearScreen(state),
  ignore: (state) => state,
};

export interface TerminalProps {
  /** The state the terminal starts with; later changes of this prop are ignored. */
  readonly initialState: TerminalState;
  /** The text field the player types into, for the game screen to focus. */
  readonly ref?: Ref<HTMLTextAreaElement>;
  /**
   * Gets what happened in the game after an input that ran, in order; inputs after which nothing
   * happened in the game are not reported.
   */
  readonly onGameEvents: (events: readonly GameEvent[]) => void;
  /**
   * Gets every new state, so that the game screen can keep the terminal of a ticket the player
   * leaves and start it again from there (ROADMAP M3.5c, ADR 0099).
   */
  readonly onStateChange?: (state: TerminalState) => void;
  /** The hints of the ticket the terminal plays, which the game command `hint` shows. */
  readonly hints: TicketHints;
  /** How many of the hints the player has seen; the next `hint` shows the one after them. */
  readonly hintsShown: number;
}

export function Terminal({
  initialState,
  ref,
  onGameEvents,
  onStateChange,
  hints,
  hintsShown,
}: TerminalProps) {
  const texts = useTexts();
  const [state, setState] = useState(initialState);
  // The hints seen, also those of an input whose events the game screen has not drawn yet.
  const hintsSeen = useRef(hintsShown);
  // The newest state and width, for key presses that follow each other before React renders.
  const latest = useRef(initialState);
  const columns = useRef(DEFAULT_COLUMNS);
  const viewport = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const setInput = useCallback(
    (element: HTMLTextAreaElement | null) => {
      input.current = element;
      if (typeof ref === "function") {
        ref(element);
      } else if (ref !== undefined && ref !== null) {
        ref.current = element;
      }
    },
    [ref],
  );

  const apply = useCallback(
    (change: Change) => {
      const previous = latest.current;
      const next = change(previous, columns.current);
      if (next === previous) {
        return;
      }
      latest.current = next;
      setState(next);
      onStateChange?.(next);
      // Every input that runs brings a list of its own (`TerminalState.gameEvents`).
      if (next.gameEvents !== previous.gameEvents && next.gameEvents.length > 0) {
        const asked = next.gameEvents.filter((event) => event.kind === "hint-requested").length;
        hintsSeen.current += asked;
        onGameEvents(next.gameEvents);
      }
    },
    [onGameEvents, onStateChange],
  );

  // F1 shows hints too; the game screen's count is the one that holds.
  useLayoutEffect(() => {
    hintsSeen.current = hintsShown;
  }, [hintsShown]);

  // The width in cells follows the size of the terminal and the font once it has loaded.
  useLayoutEffect(() => {
    const pageElement = page.current;
    const measureElement = measure.current;
    if (pageElement === null || measureElement === null) {
      return undefined;
    }
    const update = () => {
      const cellWidth = measureElement.getBoundingClientRect().width / MEASURED_CELLS;
      columns.current = columnsFor(pageElement.clientWidth, cellWidth);
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(update);
    observer.observe(pageElement);
    observer.observe(measureElement);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Like a terminal, every change of the screen or the line scrolls to the bottom.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (element !== null) {
      element.scrollTop = element.scrollHeight;
    }
  }, [state]);

  const focusInput = () => {
    input.current?.focus({ preventScroll: true });
  };

  const takeTyped = (field: HTMLTextAreaElement) => {
    const text = field.value;
    field.value = "";
    if (text !== "") {
      apply((current, width) => insertText(current, text, width));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    const action = terminalKeyAction(event);
    // With text selected, Ctrl+C copies it, as in Windows Terminal.
    if (action === "interrupt" && hasSelection()) {
      return;
    }
    if (event.target !== input.current) {
      focusInput();
    }
    if (action === undefined) {
      return;
    }
    event.preventDefault();
    if (action === "scroll-up" || action === "scroll-down") {
      scrollPage(viewport.current, measure.current, action === "scroll-up" ? -1 : 1);
    } else if (action === "submit") {
      apply((current, width) => submit(current, width, hintsSeen.current));
    } else {
      apply(CHANGES[action]);
    }
  };

  const onInput = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    const native = event.nativeEvent;
    if (native instanceof InputEvent && native.isComposing) {
      return;
    }
    takeTyped(event.currentTarget);
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    focusInput();
    apply((current, width) => insertText(current, text, width));
  };

  // A click puts the focus back into the input line; selecting text with the mouse does not.
  const onMouseUp = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button === 0 && !hasSelection()) {
      focusInput();
    }
  };

  const scrollback = useMemo(() => scrollbackLines(state.screen), [state.screen]);
  const pageContent = useMemo(() => pageLines(state.screen), [state.screen]);
  const active = activeLine(state);

  return (
    <div
      ref={viewport}
      className="terminal"
      role="log"
      aria-label={texts.plain("terminal.output")}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onMouseUp={onMouseUp}
    >
      <Lines lines={scrollback} hints={hints} />
      <div ref={page} className="terminal__page">
        <Lines lines={pageContent} hints={hints} />
        {/* The input line changes with every key; only finished lines are announced. */}
        <div className="terminal__line" aria-live="off">
          <Spans spans={active.before} />
          <span className="terminal__cursor">
            {active.atCursor}
            <textarea
              ref={setInput}
              className="terminal__input"
              aria-label={texts.plain("terminal.input")}
              rows={1}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onInput={onInput}
              onCompositionEnd={(event) => {
                takeTyped(event.currentTarget);
              }}
            />
          </span>
          {active.after}
        </div>
      </div>
      <span ref={measure} className="terminal__measure" aria-hidden="true">
        {"0".repeat(MEASURED_CELLS)}
      </span>
    </div>
  );
}

/** Finished lines; they change only when the screen changes, not while the player types. */
const Lines = memo(function Lines({
  lines,
  hints,
}: {
  readonly lines: readonly ScreenLine[];
  readonly hints: TicketHints;
}) {
  return lines.map((line) => <Line key={line.id} line={line} hints={hints} />);
});

const Line = memo(function Line({
  line,
  hints,
}: {
  readonly line: ScreenLine;
  readonly hints: TicketHints;
}) {
  const texts = useTexts();
  switch (line.kind) {
    case "text":
      return (
        <div className="terminal__line">
          <Spans spans={line.spans} />
        </div>
      );
    case "notice":
      // The game speaks in its own face with the hint icon, never in the shell's.
      return (
        <p className="terminal__notice">
          <Icon name="hint" />
          <span>
            <InlineText text={noticeText(texts, line.event)} textKey={noticeKey(line.event)} />
          </span>
        </p>
      );
    case "game":
      return <GameLine message={line.message} hints={hints} />;
  }
});

/** The class of each span style; plain text has none. */
const SPAN_CLASSES: Readonly<Record<SpanStyle, string | undefined>> = {
  plain: undefined,
  "prompt-user": "terminal__prompt-user",
  "prompt-directory": "terminal__prompt-directory",
};

function Spans({ spans }: { readonly spans: readonly Span[] }) {
  // The spans of a line never change order, so their index is a stable key.
  return spans.map((span, index) => (
    <span key={index} className={SPAN_CLASSES[span.style]}>
      {span.text}
    </span>
  ));
}

/** Whether the player has selected text, which Ctrl+C then copies. */
function hasSelection(): boolean {
  const selection = document.getSelection();
  return selection !== null && !selection.isCollapsed && selection.toString() !== "";
}

/** Shift+PageUp and Shift+PageDown: scrolls by the terminal's height less one line. */
function scrollPage(
  viewport: HTMLDivElement | null,
  measure: HTMLSpanElement | null,
  direction: -1 | 1,
): void {
  if (viewport === null) {
    return;
  }
  const lineHeight = measure?.getBoundingClientRect().height ?? 0;
  viewport.scrollTop += direction * Math.max(lineHeight, viewport.clientHeight - lineHeight);
}
