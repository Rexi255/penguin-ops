// The save slot screen (ROADMAP M3.1b): the three save slots and the way back to the start
// screen. Until the save system exists (M3.7) every slot is empty, and an empty slot is not a
// control: starting a new game in it follows with the new game flow (M3.2).

import { useEffect, useRef } from "react";

import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";

/** The number of save slots (ADR 0013). */
export const SAVE_SLOT_COUNT = 3;

/** The slot numbers the player sees, starting at 1. */
const SLOT_NUMBERS = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => index + 1);

export interface SaveSlotScreenProps {
  /** Returns to the start screen. */
  readonly onBack: () => void;
}

export function SaveSlotScreen({ onBack }: SaveSlotScreenProps) {
  const texts = useTexts();
  const backButton = useRef<HTMLButtonElement>(null);

  // The keyboard is the main input (PRODUCT.md): Back is the only control until the slots can be
  // chosen, so it has the focus from the start.
  useEffect(() => {
    backButton.current?.focus();
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
        {SLOT_NUMBERS.map((number) => (
          <li key={number} className="save-slot">
            <span className="save-slot__name">
              <InlineText text={texts.rich("slots.slot", { number })} textKey="slots.slot" />
            </span>
            <span className="save-slot__state">
              <InlineText text={texts.rich("slots.empty")} textKey="slots.empty" />
            </span>
          </li>
        ))}
      </ol>
      <button
        ref={backButton}
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
