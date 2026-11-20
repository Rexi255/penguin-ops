// The game screen (ROADMAP M3.1c): the frame of the workplace layout of ADR 0020 with a top bar,
// the side panel, the terminal and the key-hint footer, and the pause menu that Esc opens
// (ADR 0092). The terminal (M3.3, ADR 0095) plays the level it gets and has the focus. The side
// panel holds the tabs of the tickets, the mail and the handbook (M3.4, ADR 0096); the tickets
// panel shows the ticket being played (M3.5a, ADR 0097), M3.11 fills the others. The footer shows
// the key hints of the keys that work. The top bar names where the player is: the ticket and its
// step or state (M3.5a); the rank and progress follow with M3.12.
//
// The game screen keeps the ticket's progress: the terminal reports the game events of every
// input, and the ticket panel and the top bar show what they add up to. F1 or its key hint shows
// the ticket's next hint and brings the tickets panel to the front (M3.5b, ADR 0098); the focus
// stays where it is, so the player keeps typing.

import { createGameClock } from "@penguin-ops/engine";
import {
  GAME_START_TIME,
  type GameEvent,
  type LevelSetup,
  startLevel,
} from "@penguin-ops/gameplay";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "../icons/icon";
import { Terminal } from "../terminal/terminal";
import { createTerminal, type TerminalState } from "../terminal/terminal-model";
import { InlineText, Inlines } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import { TicketPanel } from "../tickets/ticket-panel";
import {
  applyGameEvents,
  showNextHint,
  stepPosition,
  TICKET_START,
  type TicketProgress,
} from "../tickets/ticket-progress";
import type { TicketTexts } from "../tickets/ticket-texts";
import { PauseMenu } from "./pause-menu";
import { SidePanel, type SidePanelTab } from "./side-panel";

export interface GameScreenProps {
  /**
   * The level the terminal plays, from its start at the game's start time. Until the save system
   * (ROADMAP M3.7), the level starts again whenever the game screen appears.
   */
  readonly level: LevelSetup;
  /** The texts of the level's ticket in the player's language. */
  readonly ticket: TicketTexts;
  /** Leaves the game for the start screen. */
  readonly onMainMenu: () => void;
}

/** A terminal for `level`, started at the game's start time. */
function startTerminal(level: LevelSetup): TerminalState {
  const clock = createGameClock(GAME_START_TIME);
  const session = startLevel(level, clock);
  return createTerminal(session, clock.now());
}

export function GameScreen({ level, ticket, onMainMenu }: GameScreenProps) {
  const texts = useTexts();
  const [paused, setPaused] = useState(false);
  // The level starts once, when the screen appears.
  const [terminal] = useState(() => startTerminal(level));
  const [progress, setProgress] = useState<TicketProgress>(TICKET_START);
  const [tab, setTab] = useState<SidePanelTab>("tickets");
  const stepCount = level.level.steps?.length ?? 0;
  const terminalInput = useRef<HTMLTextAreaElement>(null);
  const menuHint = useRef<HTMLButtonElement>(null);
  // The element that had the focus when the pause menu opened; it gets the focus back.
  const focusBeforePause = useRef<HTMLElement | null>(null);

  const openPauseMenu = useCallback(() => {
    const active = document.activeElement;
    focusBeforePause.current = active instanceof HTMLElement ? active : null;
    setPaused(true);
  }, []);

  const closePauseMenu = useCallback(() => {
    setPaused(false);
  }, []);

  const onGameEvents = useCallback((events: readonly GameEvent[]) => {
    setProgress((current) => applyGameEvents(current, events));
  }, []);

  // The hint appears in the tickets panel, so that panel comes to the front.
  const showHint = useCallback(() => {
    setProgress(showNextHint);
    setTab("tickets");
  }, []);

  // The keyboard is the main input (PRODUCT.md): when the screen appears, the terminal's input
  // line has the focus, and whenever the pause menu closes, the focus goes back to where it was.
  // The frame is inert while the menu is open, so this waits until it is not.
  useEffect(() => {
    if (paused) {
      return;
    }
    const target = focusBeforePause.current;
    focusBeforePause.current = null;
    if (target !== null && target !== document.body && target.isConnected) {
      target.focus();
    } else {
      terminalInput.current?.focus();
    }
  }, [paused]);

  // In the game, Esc opens the pause menu and F1 shows the next hint (ADR 0020); while the menu
  // is open, it handles Esc and the game takes no keys. A held key acts once.
  useEffect(() => {
    if (paused) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        openPauseMenu();
      } else if (event.key === "F1") {
        event.preventDefault();
        showHint();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [paused, openPauseMenu, showHint]);

  return (
    <div className="game-screen">
      {/* While the pause menu is open, the frame takes neither focus nor clicks. */}
      <div className="game-screen__frame" inert={paused}>
        <header className="game-screen__top-bar">
          <h1 className="visually-hidden">
            <InlineText text={texts.rich("game.title")} textKey="game.title" />
          </h1>
          <GuideWords ticket={ticket} stepCount={stepCount} progress={progress} />
        </header>
        <aside className="game-screen__side-panel" aria-label={texts.plain("game.side-panel")}>
          <SidePanel
            tickets={<TicketPanel texts={ticket} stepCount={stepCount} progress={progress} />}
            selected={tab}
            onSelect={setTab}
          />
        </aside>
        <main className="game-screen__terminal" aria-label={texts.plain("game.terminal")}>
          <Terminal ref={terminalInput} initialState={terminal} onGameEvents={onGameEvents} />
        </main>
        <footer className="game-screen__footer">
          <button type="button" className="key-hint" aria-keyshortcuts="F1" onClick={showHint}>
            <kbd className="key-hint__key">
              <InlineText text={texts.rich("keys.f1")} textKey="keys.f1" />
            </kbd>{" "}
            <InlineText text={texts.rich("game.hint")} textKey="game.hint" />
          </button>
          {/* The terminal answers Tab itself, so its hint is no button (ADR 0096). */}
          <span className="key-hint key-hint--terminal">
            <kbd className="key-hint__key">
              <InlineText text={texts.rich("keys.tab")} textKey="keys.tab" />
            </kbd>{" "}
            <InlineText text={texts.rich("game.complete")} textKey="game.complete" />
          </span>
          <button
            ref={menuHint}
            type="button"
            className="key-hint"
            aria-keyshortcuts="Escape"
            onClick={() => {
              openPauseMenu();
            }}
          >
            <kbd className="key-hint__key">
              <InlineText text={texts.rich("keys.escape")} textKey="keys.escape" />
            </kbd>{" "}
            <InlineText text={texts.rich("game.menu")} textKey="game.menu" />
          </button>
        </footer>
      </div>
      {paused && <PauseMenu onContinue={closePauseMenu} onMainMenu={onMainMenu} />}
    </div>
  );
}

/**
 * The top bar's guide words (DESIGN.md): the ticket's title and the step the player works on, or
 * that the ticket is solved. The ticket panel announces changes, so these are not live.
 */
function GuideWords({
  ticket,
  stepCount,
  progress,
}: {
  readonly ticket: TicketTexts;
  readonly stepCount: number;
  readonly progress: TicketProgress;
}) {
  const texts = useTexts();
  const position = stepPosition(progress, stepCount);
  return (
    <p className="guide-words">
      <span className="guide-words__ticket">
        <Inlines inlines={ticket.title} />
      </span>
      {position !== undefined && (
        <span className="guide-words__state">
          <InlineText
            text={texts.rich("ticket.step", { current: position.current, count: position.count })}
            textKey="ticket.step"
          />
        </span>
      )}
      {progress.solved && (
        <span className="guide-words__state guide-words__state--solved">
          <Icon name="solved" />
          <InlineText text={texts.rich("ticket.solved")} textKey="ticket.solved" />
        </span>
      )}
    </p>
  );
}
