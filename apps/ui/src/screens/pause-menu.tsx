// The pause menu (ROADMAP M3.1c, ADR 0020, ADR 0092): a modal dialog over the game screen. It
// holds only entries whose functions exist: Continue returns to the game, Settings opens the
// settings dialog (ADR 0109), Main menu leaves the game for the start screen. The handbook joins
// it with its work package.

import { useEffect, useId, useRef } from "react";

import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";

export interface PauseMenuProps {
  /** Closes the menu and returns to the game. */
  readonly onContinue: () => void;
  /** Opens the settings in place of the menu. */
  readonly onSettings: () => void;
  /** Leaves the game for the start screen. */
  readonly onMainMenu: () => void;
  /** The entry that has the focus when the menu appears: Settings on the way back from them. */
  readonly focusedEntry?: "continue" | "settings";
}

export function PauseMenu({
  onContinue,
  onSettings,
  onMainMenu,
  focusedEntry = "continue",
}: PauseMenuProps) {
  const texts = useTexts();
  const titleId = useId();
  const continueEntry = useRef<HTMLButtonElement>(null);
  const settingsEntry = useRef<HTMLButtonElement>(null);

  // The keyboard is the main input (PRODUCT.md): Continue has the focus, so Enter, like Esc,
  // returns to the game; back from the settings, the focus is where the player left.
  useEffect(() => {
    (focusedEntry === "settings" ? settingsEntry : continueEntry).current?.focus();
  }, [focusedEntry]);

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
              ref={continueEntry}
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
              ref={settingsEntry}
              type="button"
              className="button menu__entry"
              onClick={() => {
                onSettings();
              }}
            >
              <InlineText text={texts.rich("pause.settings")} textKey="pause.settings" />
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
