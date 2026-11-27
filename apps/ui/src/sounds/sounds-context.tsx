// The UI sounds for the screens (ROADMAP M3.10, ADR 0113): the app root provides a function that
// plays a sound at the volumes of the latest settings, and every screen takes it from here. A
// screen outside the provider, such as a screen in its own test, plays nothing.
//
// The controls of the menus and dialogs click without a line of their own: `controlSound` tells
// from a DOM event on the page whether it worked a control, and the app root listens for those
// events on the whole document. A button clicks when it is pressed, with the mouse or the
// keyboard; a radio button or a checkbox when it changes; a slider at each step it moves.

import { createContext, type ReactNode, useContext } from "react";

import type { UiSound } from "./ui-sounds";

/** Plays a UI sound at the volumes of the settings. */
export type PlaySound = (sound: UiSound) => void;

function playNothing(): void {
  // Silence.
}

const SoundsContext = createContext<PlaySound>(playNothing);

export interface SoundsProviderProps {
  readonly play: PlaySound;
  readonly children: ReactNode;
}

/** Gives the screens in `children` the function that plays the UI sounds. */
export function SoundsProvider({ play, children }: SoundsProviderProps) {
  return <SoundsContext value={play}>{children}</SoundsContext>;
}

/** The function that plays the UI sounds. */
export function useSounds(): PlaySound {
  return useContext(SoundsContext);
}

/** The DOM events after which `controlSound` may name a sound. */
export const CONTROL_SOUND_EVENTS = ["click", "change", "input"] as const;

/**
 * The sound of a control that `event` worked, or `undefined` if it worked none: a click of an
 * enabled button, a change of a radio button or a checkbox, and a step of a slider.
 */
export function controlSound(event: Event): UiSound | undefined {
  const { target } = event;
  if (!(target instanceof Element)) {
    return undefined;
  }
  switch (event.type) {
    case "click":
      // A click on a label also clicks its control, which then changes; only the change clicks.
      return target.closest("button") === null ? undefined : "click";
    case "change":
      return target instanceof HTMLInputElement &&
        (target.type === "radio" || target.type === "checkbox")
        ? "click"
        : undefined;
    case "input":
      return target instanceof HTMLInputElement && target.type === "range" ? "click" : undefined;
    default:
      return undefined;
  }
}
