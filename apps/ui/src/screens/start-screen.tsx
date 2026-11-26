// The start screen (ROADMAP M3.1a, M3.1b): the logo, the main menu and the version. The menu
// holds only entries whose screens exist: Play opens the save slot screen, Settings the settings
// screen (ADR 0109), Quit closes the game.

import { useEffect, useRef } from "react";

import logoUrl from "../../../../assets/brand/svg/logo-horizontal-dark.svg?no-inline";
import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";

export interface StartScreenProps {
  /** The app version, shown as data. */
  readonly version: string;
  /** Opens the save slot screen. */
  readonly onPlay: () => void;
  /** Opens the settings screen. */
  readonly onSettings: () => void;
  /** Closes the game. */
  readonly onQuit: () => void;
  /** The entry that has the focus when the screen appears: Settings on the way back from them. */
  readonly focusedEntry?: "play" | "settings";
}

export function StartScreen({
  version,
  onPlay,
  onSettings,
  onQuit,
  focusedEntry = "play",
}: StartScreenProps) {
  const texts = useTexts();
  const playEntry = useRef<HTMLButtonElement>(null);
  const settingsEntry = useRef<HTMLButtonElement>(null);

  // The keyboard is the main input (PRODUCT.md): the menu has the focus whenever the screen
  // appears, at the start and on the way back from another screen, so Enter chooses Play; back
  // from the settings, the focus is where the player left.
  useEffect(() => {
    (focusedEntry === "settings" ? settingsEntry : playEntry).current?.focus();
  }, [focusedEntry]);

  return (
    <div className="start-screen">
      <main className="start-screen__main">
        <h1 className="start-screen__title">
          <img className="start-screen__logo" src={logoUrl} alt={texts.plain("app.name")} />
        </h1>
        <nav className="start-screen__menu" aria-label={texts.plain("start.menu")}>
          <ul className="menu">
            <li>
              <button
                ref={playEntry}
                type="button"
                className="button menu__entry"
                onClick={() => {
                  onPlay();
                }}
              >
                <InlineText text={texts.rich("start.play")} textKey="start.play" />
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
                <InlineText text={texts.rich("start.settings")} textKey="start.settings" />
              </button>
            </li>
            <li>
              <button
                type="button"
                className="button menu__entry"
                // Without the click event: the desktop API cannot take DOM objects (ADR 0033).
                onClick={() => {
                  onQuit();
                }}
              >
                <InlineText text={texts.rich("start.quit")} textKey="start.quit" />
              </button>
            </li>
          </ul>
        </nav>
      </main>
      <footer className="start-screen__footer">
        <p className="start-screen__version">
          <InlineText
            text={texts.rich("start.version", { version: { code: version } })}
            textKey="start.version"
          />
        </p>
      </footer>
    </div>
  );
}
