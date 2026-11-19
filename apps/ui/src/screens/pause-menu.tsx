// The pause menu (ROADMAP M3.1c, ADR 0020, ADR 0092): a modal dialog over the game screen. It
// holds only entries whose functions exist: Continue returns to the game, Main menu leaves it for
// the start screen. Settings, the handbook and saving join it with their work packages.

import { useEffect, useId, useRef } from "react";

import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";

export interface PauseMenuProps {
  /** Closes the menu and returns to the game. */
  readonly onContinue: () => void;
  /** Leaves the game for the start screen. */
  readonly onMainMenu: () => void;
}

export function PauseMenu({ onContinue, onMainMenu }: PauseMenuProps) {
  const texts = useTexts();
  const titleId = useId();
  const firstEntry = useRef<HTMLButtonElement>(null);

  // The keyboard is the main input (PRODUCT.md): Continue has the focus, so Enter, like Esc,
  // returns to the game.
  useEffect(() => {
    firstEntry.current?.focus();
  }, []);

  // Esc closes the menu again, wherever the focus is (ADR 0020).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.repeat) {
        event.preventDefault();
        onContinue();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onContinue]);

  return (
    <div className="pause-menu">
      <div className="pause-menu__dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="pause-menu__title">
          <InlineText text={texts.rich("pause.title")} textKey="pause.title" />
        </h2>
        <ul className="menu">
          <li>
            <button
              ref={firstEntry}
              type="button"
              className="button menu__entry"
              onClick={() => {
                onContinue();
              }}
            >
              <InlineText text={texts.rich("pause.continue")} textKey="pause.continue" />
            </button>
          </li>
          <li>
            <button
              type="button"
              className="button menu__entry"
              onClick={() => {
                onMainMenu();
              }}
            >
              <InlineText text={texts.rich("pause.main-menu")} textKey="pause.main-menu" />
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
