// The root of the game's interface: it hands the UI texts to every screen and switches between
// the screens (ADR 0091). The current screen is plain React state; each screen sets the keyboard
// focus when it appears.
import { type ReactNode, useState } from "react";

import type { AppInfo } from "./desktop-api";
import { GameScreen } from "./screens/game-screen";
import { SaveSlotScreen } from "./screens/save-slot-screen";
import { StartScreen } from "./screens/start-screen";
import { TextsProvider } from "./texts/texts-context";
import type { Texts } from "./texts/ui-texts";

/** The screens the app can show. */
export type Screen = "start" | "save-slots" | "game";

export interface AppProps {
  readonly info: AppInfo;
  readonly texts: Texts;
  /** Closes the game. */
  readonly onQuit: () => void;
}

export function App({ info, texts, onQuit }: AppProps) {
  const [screen, setScreen] = useState<Screen>("start");
  let content: ReactNode;
  switch (screen) {
    case "start":
      content = (
        <StartScreen
          version={info.version}
          onPlay={() => {
            setScreen("save-slots");
          }}
          onQuit={onQuit}
        />
      );
      break;
    case "save-slots":
      content = (
        <SaveSlotScreen
          onNewGame={() => {
            setScreen("game");
          }}
          onBack={() => {
            setScreen("start");
          }}
        />
      );
      break;
    case "game":
      content = (
        <GameScreen
          onMainMenu={() => {
            setScreen("start");
          }}
        />
      );
      break;
  }
  return <TextsProvider texts={texts}>{content}</TextsProvider>;
}
