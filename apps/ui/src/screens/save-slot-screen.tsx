// The save slot screen (ROADMAP M3.1b, M3.1c, M3.2b): the three save slots and the way back to
// the start screen. An empty slot is a button that opens the new game screen for it; a slot with
// a game shows the player's name and the mode and returns to the game (ADR 0092, ADR 0094). Until
// the save system exists (M3.7), the games live only in the app's memory.

import type { NewGame } from "@penguin-ops/gameplay";
import { useEffect, useId, useRef } from "react";

import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import { modeTitleKey } from "./new-game-screen";

/** The number of save slots (ADR 0013). */
export const SAVE_SLOT_COUNT = 3;

export interface SaveSlotScreenProps {
  /** The game in each slot, or undefined for an empty slot; `SAVE_SLOT_COUNT` entries. */
  readonly slots: readonly (NewGame | undefined)[];
  /** The index of the slot that has the focus when the screen appears, counting from 0. */
  readonly focusedSlot: number;
  /** Opens the new game screen for the empty slot `index`, counting from 0. */
  readonly onNewGame: (index: number) => void;
  /** Returns to the game in the slot `index`, counting from 0. */
  readonly onContinue: (index: number) => void;
  /** Returns to the start screen. */
  readonly onBack: () => void;
}

export function SaveSlotScreen({
  slots,
  focusedSlot,
  onNewGame,
  onContinue,
  onBack,
}: SaveSlotScreenProps) {
  const texts = useTexts();
  const focusTarget = useRef<HTMLButtonElement>(null);
  const idPrefix = useId();

  // The keyboard is the main input (PRODUCT.md): a slot has the focus from the start, the first
  // one or the one the player comes back from, so Enter works at once.
  useEffect(() => {
    focusTarget.current?.focus();
  }, []);

  // Esc goes back, like in the menus of other games; game functions use Esc (ADR 0020).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.repeat) {
        event.preventDefault();
        onBack();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onBack]);

  return (
    <main className="save-slot-screen">
      <h1 className="save-slot-screen__title">
        <InlineText text={texts.rich("slots.title")} textKey="slots.title" />
      </h1>
      <ol className="save-slot-screen__slots">
        {slots.map((game, index) => {
          const number = index + 1;
          const nameId = `${idPrefix}-slot-${String(number)}-name`;
          const stateId = `${idPrefix}-slot-${String(number)}-state`;
          return (
            <li key={number}>
              <button
                ref={index === focusedSlot ? focusTarget : undefined}
                type="button"
                className="save-slot"
                // The name and the state are blocks of the row with a space between them, which
                // the flex layout does not draw. Named by its visible texts, the button reads
                // "Slot 1 New game" instead of running them together, and its name stays exactly
                // the visible text.
                aria-labelledby={`${nameId} ${stateId}`}
                onClick={() => {
                  if (game === undefined) {
                    onNewGame(index);
                  } else {
                    onContinue(index);
                  }
                }}
              >
                <span id={nameId} className="save-slot__name">
                  <InlineText text={texts.rich("slots.slot", { number })} textKey="slots.slot" />
                </span>{" "}
                <span id={stateId} className="save-slot__state">
                  {game === undefined ? (
                    <InlineText text={texts.rich("slots.new-game")} textKey="slots.new-game" />
                  ) : (
                    // The player's name is a value: shown as typed, never read as markup.
                    <InlineText
                      text={texts.rich("slots.game", {
                        player: game.playerName,
                        mode: texts.plain(modeTitleKey(game.mode)),
                      })}
                      textKey="slots.game"
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="button"
        // Without the click event: the parent only needs to know that the player went back.
        onClick={() => {
          onBack();
        }}
      >
        <InlineText text={texts.rich("slots.back")} textKey="slots.back" />
      </button>
    </main>
  );
}
