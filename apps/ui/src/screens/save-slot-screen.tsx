// The save slot screen (ROADMAP M3.1b, M3.1c): the three save slots and the way back to the start
// screen. Until the save system exists (M3.7) every slot is empty, and an empty slot is a button
// that starts a new game in it (ADR 0092); the new game flow (M3.2) will ask for the name and the
// mode first.

import { useEffect, useId, useRef } from "react";

import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";

/** The number of save slots (ADR 0013). */
export const SAVE_SLOT_COUNT = 3;

/** The slot numbers the player sees, starting at 1. */
const SLOT_NUMBERS = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => index + 1);

export interface SaveSlotScreenProps {
  /** Starts a new game in an empty slot. */
  readonly onNewGame: () => void;
  /** Returns to the start screen. */
  readonly onBack: () => void;
}

export function SaveSlotScreen({ onNewGame, onBack }: SaveSlotScreenProps) {
  const texts = useTexts();
  const firstSlot = useRef<HTMLButtonElement>(null);
  const idPrefix = useId();

  // The keyboard is the main input (PRODUCT.md): the first slot has the focus from the start, so
  // Enter starts a game in it.
  useEffect(() => {
    firstSlot.current?.focus();
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
        {SLOT_NUMBERS.map((number) => {
          const nameId = `${idPrefix}-slot-${String(number)}-name`;
          const stateId = `${idPrefix}-slot-${String(number)}-state`;
          return (
            <li key={number}>
              <button
                ref={number === 1 ? firstSlot : undefined}
                type="button"
                className="save-slot"
                // The name and the state are two blocks of the row with a space between them,
                // which the flex layout does not draw. Named by both, the button reads
                // "Slot 1 New game" instead of running the two texts together, and its name stays
                // exactly the visible text.
                aria-labelledby={`${nameId} ${stateId}`}
                onClick={() => {
                  onNewGame();
                }}
              >
                <span id={nameId} className="save-slot__name">
                  <InlineText text={texts.rich("slots.slot", { number })} textKey="slots.slot" />
                </span>{" "}
                <span id={stateId} className="save-slot__state">
                  <InlineText text={texts.rich("slots.new-game")} textKey="slots.new-game" />
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
