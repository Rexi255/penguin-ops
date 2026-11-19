// The start screen (ROADMAP M3.1a): the logo, the main menu and the version. The menu holds
// only entries whose screens exist; "Play" follows with the save slot screen (M3.1b).

import { useEffect, useRef } from "react";

import logoUrl from "../../../../assets/brand/svg/logo-horizontal-dark.svg?no-inline";
import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";

export interface StartScreenProps {
  /** The app version, shown as data. */
  readonly version: string;
  /** Closes the game. */
  readonly onQuit: () => void;
}

export function StartScreen({ version, onQuit }: StartScreenProps) {
  const texts = useTexts();
  const firstEntry = useRef<HTMLButtonElement>(null);

  // The keyboard is the main input (PRODUCT.md): the menu has the focus from the start, so Enter
  // chooses its first entry.
  useEffect(() => {
    firstEntry.current?.focus();
  }, []);

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
                ref={firstEntry}
                type="button"
                className="menu__entry"
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
