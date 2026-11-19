// The game screen (ROADMAP M3.1c): the frame of the workplace layout of ADR 0020 with a top bar,
// the side panel, the terminal and the key-hint footer, and the pause menu that Esc opens
// (ADR 0092). The terminal (M3.3, ADR 0095) plays the level it gets and has the focus. The side
// panel holds the tabs of the tickets, the mail and the handbook (M3.4, ADR 0096), whose panels
// M3.5 and M3.11 fill; the footer shows the key hints of the keys that work. The top bar stays
// empty until it can name where the player is: the ticket and step (M3.5) and the rank and
// progress (M3.12).

import { createGameClock } from "@penguin-ops/engine";
import { GAME_START_TIME, type LevelSetup, startLevel } from "@penguin-ops/gameplay";
import { useCallback, useEffect, useRef, useState } from "react";

import { Terminal } from "../terminal/terminal";
import { createTerminal, type TerminalState } from "../terminal/terminal-model";
import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import { PauseMenu } from "./pause-menu";
import { SidePanel } from "./side-panel";

export interface GameScreenProps {
  /**
   * The level the terminal plays, from its start at the game's start time. Until the save system
   * (ROADMAP M3.7), the level starts again whenever the game screen appears.
   */
  readonly level: LevelSetup;
  /** Leaves the game for the start screen. */
  readonly onMainMenu: () => void;
}

/** A terminal for `level`, started at the game's start time. */
function startTerminal(level: LevelSetup): TerminalState {
  const clock = createGameClock(GAME_START_TIME);
  const session = startLevel(level, clock);
  return createTerminal(session, clock.now());
}

export function GameScreen({ level, onMainMenu }: GameScreenProps) {
  const texts = useTexts();
  const [paused, setPaused] = useState(false);
  // The level starts once, when the screen appears.
  const [terminal] = useState(() => startTerminal(level));
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

  // In the game, Esc opens the pause menu (ADR 0020); while it is open, the menu handles Esc.
  useEffect(() => {
    if (paused) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.repeat) {
        event.preventDefault();
        openPauseMenu();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [paused, openPauseMenu]);

  return (
    <div className="game-screen">
      {/* While the pause menu is open, the frame takes neither focus nor clicks. */}
      <div className="game-screen__frame" inert={paused}>
        <header className="game-screen__top-bar">
          <h1 className="visually-hidden">
            <InlineText text={texts.rich("game.title")} textKey="game.title" />
          </h1>
        </header>
        <aside className="game-screen__side-panel" aria-label={texts.plain("game.side-panel")}>
          <SidePanel />
        </aside>
        <main className="game-screen__terminal" aria-label={texts.plain("game.terminal")}>
          <Terminal ref={terminalInput} initialState={terminal} />
        </main>
        <footer className="game-screen__footer">
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
