// The root of the game's interface: it hands the UI texts to every screen and shows the start
// screen. Navigation between screens follows with the save slot screen (ROADMAP M3.1b).
import type { AppInfo } from "./desktop-api";
import { StartScreen } from "./screens/start-screen";
import { TextsProvider } from "./texts/texts-context";
import type { Texts } from "./texts/ui-texts";

export interface AppProps {
  readonly info: AppInfo;
  readonly texts: Texts;
  /** Closes the game. */
  readonly onQuit: () => void;
}

export function App({ info, texts, onQuit }: AppProps) {
  return (
    <TextsProvider texts={texts}>
      <StartScreen version={info.version} onQuit={onQuit} />
    </TextsProvider>
  );
}
