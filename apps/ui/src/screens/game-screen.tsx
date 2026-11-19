// The game screen (ROADMAP M3.1c): the frame of the workplace layout of ADR 0020 with a top bar,
// the side panel, the terminal area and the key-hint footer, and the pause menu that Esc opens
// (ADR 0092). The areas stay empty until their work packages fill them: the terminal (M3.3), the
// panels (M3.11) and the top bar's chapter and progress (M3.12).

import { useCallback, useEffect, useRef, useState } from "react";

import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import { PauseMenu } from "./pause-menu";

export interface GameScreenProps {
  /** Leaves the game for the start screen. */
  readonly onMainMenu: () => void;
}

export function GameScreen({ onMainMenu }: GameScreenProps) {
  const texts = useTexts();
  const [paused, setPaused] = useState(false);
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

  // The keyboard is the main input (PRODUCT.md): when the screen appears and whenever the pause
  // menu closes, the focus goes back into the game. The frame is inert while the menu is open,
  // so this waits until it is not.
  useEffect(() => {
    if (paused) {
      return;
    }
    const target = focusBeforePause.current;
    focusBeforePause.current = null;
    if (target !== null && target !== document.body && target.isConnected) {
      target.focus();
    } else {
      menuHint.current?.focus();
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
        <aside className="game-screen__side-panel" aria-label={texts.plain("game.side-panel")} />
        <main className="game-screen__terminal" aria-label={texts.plain("game.terminal")} />
        <footer className="game-screen__footer">
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
