// The root of the game's interface: it hands the UI texts to every screen and switches between
// the screens (ADR 0091, ADR 0094). The current screen and the games in the save slots are plain
// React state; each screen sets the keyboard focus when it appears. Until the save system exists
// (M3.7), the games live only here and are gone when the app closes, and the game screen plays the
// first level of the content (ADR 0095).
import type { Content } from "@penguin-ops/content";
import { levelSetup, type NewGame, startingLevelId } from "@penguin-ops/gameplay";
import { type ReactNode, useState } from "react";

import type { AppInfo } from "./desktop-api";
import { GameScreen } from "./screens/game-screen";
import { NewGameScreen } from "./screens/new-game-screen";
import { SAVE_SLOT_COUNT, SaveSlotScreen } from "./screens/save-slot-screen";
import { StartScreen } from "./screens/start-screen";
import { TextsProvider } from "./texts/texts-context";
import { ticketTexts } from "./tickets/ticket-texts";
import type { Texts } from "./texts/ui-texts";

/** The screens the app can show; a slot is an index counting from 0. */
export type Screen =
  | { readonly name: "start" }
  /** `focusedSlot` has the focus when the screen appears. */
  | { readonly name: "save-slots"; readonly focusedSlot: number }
  | { readonly name: "new-game"; readonly slot: number }
  | { readonly name: "game"; readonly slot: number };

/** The game in each save slot, or undefined for an empty slot. */
export type Slots = readonly (NewGame | undefined)[];

const EMPTY_SLOTS: Slots = Array.from({ length: SAVE_SLOT_COUNT }, () => undefined);

export interface AppProps {
  readonly info: AppInfo;
  /** The loaded content: the levels a game plays. */
  readonly content: Content;
  readonly texts: Texts;
  /** The user names a player cannot take (`reservedUserNames` of the loaded worlds). */
  readonly reservedUserNames: ReadonlySet<string>;
  /** Closes the game. */
  readonly onQuit: () => void;
}

export function App({ info, content, texts, reservedUserNames, onQuit }: AppProps) {
  const [screen, setScreen] = useState<Screen>({ name: "start" });
  const [slots, setSlots] = useState<Slots>(EMPTY_SLOTS);
  let shown: ReactNode;
  switch (screen.name) {
    case "start":
      shown = (
        <StartScreen
          version={info.version}
          onPlay={() => {
            setScreen({ name: "save-slots", focusedSlot: 0 });
          }}
          onQuit={onQuit}
        />
      );
      break;
    case "save-slots":
      shown = (
        <SaveSlotScreen
          slots={slots}
          focusedSlot={screen.focusedSlot}
          onNewGame={(slot) => {
            setScreen({ name: "new-game", slot });
          }}
          onContinue={(slot) => {
            setScreen({ name: "game", slot });
          }}
          onBack={() => {
            setScreen({ name: "start" });
          }}
        />
      );
      break;
    case "new-game": {
      const { slot } = screen;
      shown = (
        <NewGameScreen
          slotNumber={slot + 1}
          reservedUserNames={reservedUserNames}
          onStart={(game) => {
            setSlots((current) => current.map((entry, index) => (index === slot ? game : entry)));
            setScreen({ name: "game", slot });
          }}
          onBack={() => {
            setScreen({ name: "save-slots", focusedSlot: slot });
          }}
        />
      );
      break;
    }
    case "game": {
      const game = slots[screen.slot];
      if (game === undefined) {
        throw new Error(`The save slot ${String(screen.slot + 1)} has no game to play.`);
      }
      // Until the campaign (M3.5) and the save system (M3.7), a game plays its first level.
      const levelId = startingLevelId(content);
      shown = (
        <GameScreen
          level={levelSetup(content, levelId, texts.language, game.userName)}
          ticket={ticketTexts(content, levelId, texts.language)}
          onMainMenu={() => {
            setScreen({ name: "start" });
          }}
        />
      );
      break;
    }
  }
  return <TextsProvider texts={texts}>{shown}</TextsProvider>;
}
