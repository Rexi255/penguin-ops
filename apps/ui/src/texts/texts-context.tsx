// Gives every component the UI texts in the game's language through React context: a value that
// a provider high up in the tree hands to all components below it without passing it on by
// hand.

import { createContext, type ReactNode, useContext } from "react";

import type { Texts } from "./ui-texts";

const TextsContext = createContext<Texts | undefined>(undefined);

export interface TextsProviderProps {
  readonly texts: Texts;
  readonly children: ReactNode;
}

/** Makes `texts` available to `useTexts` in every component below. */
export function TextsProvider({ texts, children }: TextsProviderProps) {
  return <TextsContext value={texts}>{children}</TextsContext>;
}

/** The UI texts; only inside a `TextsProvider`. */
export function useTexts(): Texts {
  const texts = useContext(TextsContext);
  if (texts === undefined) {
    throw new Error("useTexts needs a TextsProvider above the component.");
  }
  return texts;
}
