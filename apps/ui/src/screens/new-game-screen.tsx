// The new game screen (ROADMAP M3.2b, ADR 0017, ADR 0019, ADR 0094): the player's name, the
// Linux user name derived from it while the player types and editable, and the game mode as two
// choice cards. Start creates the game only when both names have no problem; Back and Esc return
// to the save slot screen.

import type { RichText } from "@penguin-ops/content";
import {
  checkPlayerName,
  checkUserName,
  deriveUserName,
  GAME_MODES,
  type GameMode,
  type NewGame,
  normalizePlayerName,
  PLAYER_NAME_MAX_LENGTH,
  type PlayerNameProblem,
  USER_NAME_MAX_LENGTH,
  type UserNameProblem,
} from "@penguin-ops/gameplay";
import { type SubmitEvent, useEffect, useId, useRef, useState } from "react";

import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import type { Texts, UiTextKey } from "../texts/ui-texts";

/** The mode a new game starts with: Story leads a beginner through the chapters (ADR 0017). */
export const DEFAULT_GAME_MODE: GameMode = "story";

export interface NewGameScreenProps {
  /** The number of the save slot the game is for, counting from 1. */
  readonly slotNumber: number;
  /** The names the player cannot take (`reservedUserNames` of the loaded worlds). */
  readonly reservedUserNames: ReadonlySet<string>;
  /** Creates the game in the slot and opens the game screen. */
  readonly onStart: (game: NewGame) => void;
  /** Returns to the save slot screen. */
  readonly onBack: () => void;
}

export function NewGameScreen({
  slotNumber,
  reservedUserNames,
  onStart,
  onBack,
}: NewGameScreenProps) {
  const texts = useTexts();
  const id = useId();
  const playerNameInput = useRef<HTMLInputElement>(null);
  const userNameInput = useRef<HTMLInputElement>(null);

  const [playerName, setPlayerName] = useState("");
  const [userName, setUserName] = useState("");
  const [mode, setMode] = useState<GameMode>(DEFAULT_GAME_MODE);
  // Once the player edits the user name, a change of their name no longer replaces it.
  const [userNameEdited, setUserNameEdited] = useState(false);
  // A problem shows once the player has changed the field, or tried to start.
  const [playerNameTouched, setPlayerNameTouched] = useState(false);
  const [userNameTouched, setUserNameTouched] = useState(false);
  const [startTried, setStartTried] = useState(false);

  const playerNameProblem = checkPlayerName(playerName);
  const userNameProblem = checkUserName(userName, reservedUserNames);
  const shownPlayerNameProblem = playerNameTouched || startTried ? playerNameProblem : undefined;
  const shownUserNameProblem = userNameTouched || startTried ? userNameProblem : undefined;

  // The keyboard is the main input (PRODUCT.md): the name field has the focus from the start.
  useEffect(() => {
    playerNameInput.current?.focus();
  }, []);

  // Esc goes back, like on the save slot screen (ADR 0091).
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

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStartTried(true);
    if (playerNameProblem !== undefined) {
      playerNameInput.current?.focus();
      return;
    }
    if (userNameProblem !== undefined) {
      userNameInput.current?.focus();
      return;
    }
    onStart({ playerName: normalizePlayerName(playerName), userName, mode });
  };

  const playerNameId = `${id}-player-name`;
  const playerNameProblemId = `${id}-player-name-problem`;
  const userNameId = `${id}-user-name`;
  const userNameHelpId = `${id}-user-name-help`;
  const userNameProblemId = `${id}-user-name-problem`;
  const modeNoteId = `${id}-mode-note`;

  return (
    <main className="new-game-screen">
      <form className="new-game" noValidate onSubmit={onSubmit}>
        <hgroup className="new-game__heading">
          <h1 className="new-game__title">
            <InlineText text={texts.rich("new-game.title")} textKey="new-game.title" />
          </h1>
          <p className="new-game__slot">
            <InlineText
              text={texts.rich("slots.slot", { number: slotNumber })}
              textKey="slots.slot"
            />
          </p>
        </hgroup>

        <div className="field">
          <label className="field__label" htmlFor={playerNameId}>
            <InlineText text={texts.rich("new-game.player-name")} textKey="new-game.player-name" />
          </label>
          <input
            ref={playerNameInput}
            id={playerNameId}
            className="field__input"
            type="text"
            value={playerName}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={shownPlayerNameProblem !== undefined}
            aria-describedby={playerNameProblemId}
            onChange={(event) => {
              const name = event.target.value;
              setPlayerName(name);
              setPlayerNameTouched(true);
              if (!userNameEdited) {
                setUserName(deriveUserName(name));
                setUserNameTouched(true);
              }
            }}
          />
          <Problem
            id={playerNameProblemId}
            problem={playerNameProblemText(texts, shownPlayerNameProblem)}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor={userNameId}>
            <InlineText text={texts.rich("new-game.user-name")} textKey="new-game.user-name" />
          </label>
          <input
            ref={userNameInput}
            id={userNameId}
            className="field__input field__input--code"
            type="text"
            value={userName}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={shownUserNameProblem !== undefined}
            aria-describedby={`${userNameHelpId} ${userNameProblemId}`}
            onChange={(event) => {
              setUserName(event.target.value);
              setUserNameEdited(true);
              setUserNameTouched(true);
            }}
          />
          <p id={userNameHelpId} className="field__help">
            <InlineText
              text={texts.rich("new-game.user-name-help")}
              textKey="new-game.user-name-help"
            />
          </p>
          <Problem
            id={userNameProblemId}
            problem={userNameProblemText(texts, shownUserNameProblem, userName)}
          />
        </div>

        <fieldset className="mode-choice" aria-describedby={modeNoteId}>
          <legend className="field__label">
            <InlineText text={texts.rich("new-game.mode")} textKey="new-game.mode" />
          </legend>
          <div className="mode-choice__cards">
            {GAME_MODES.map((gameMode) => {
              const titleId = `${id}-mode-${gameMode}`;
              const descriptionId = `${id}-mode-${gameMode}-description`;
              return (
                <label key={gameMode} className="mode-card" data-mode={gameMode}>
                  <input
                    className="mode-card__input visually-hidden"
                    type="radio"
                    name={`${id}-mode`}
                    value={gameMode}
                    checked={mode === gameMode}
                    // Named by the card's title alone; the description follows as the
                    // description, so the name stays short.
                    aria-labelledby={titleId}
                    aria-describedby={descriptionId}
                    onChange={() => {
                      setMode(gameMode);
                    }}
                  />
                  <span className="mode-card__head">
                    <span className="mode-card__marker" aria-hidden="true" />
                    <span id={titleId} className="mode-card__title">
                      <InlineText
                        text={texts.rich(modeTitleKey(gameMode))}
                        textKey={modeTitleKey(gameMode)}
                      />
                    </span>
                  </span>
                  <span id={descriptionId} className="mode-card__description">
                    <InlineText
                      text={texts.rich(modeDescriptionKey(gameMode))}
                      textKey={modeDescriptionKey(gameMode)}
                    />
                  </span>
                </label>
              );
            })}
          </div>
          <p id={modeNoteId} className="field__help">
            <InlineText text={texts.rich("new-game.mode-fixed")} textKey="new-game.mode-fixed" />
          </p>
        </fieldset>

        <div className="new-game__actions">
          <button type="submit" className="button">
            <InlineText text={texts.rich("new-game.start")} textKey="new-game.start" />
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              onBack();
            }}
          >
            <InlineText text={texts.rich("new-game.back")} textKey="new-game.back" />
          </button>
        </div>
      </form>
    </main>
  );
}

/**
 * The problem line under a field. It is always there, so that the layout does not jump and screen
 * readers announce a problem as soon as it appears (a polite live region).
 */
function Problem({
  id,
  problem,
}: {
  readonly id: string;
  readonly problem: ProblemText | undefined;
}) {
  return (
    <p id={id} className="field__problem" aria-live="polite">
      {problem !== undefined && <InlineText text={problem.text} textKey={problem.key} />}
    </p>
  );
}

/** A problem's text with its catalog key. */
interface ProblemText {
  readonly key: UiTextKey;
  readonly text: RichText;
}

/** The catalog key of a mode's name. */
export function modeTitleKey(mode: GameMode): "modes.story" | "modes.sandbox" {
  switch (mode) {
    case "story":
      return "modes.story";
    case "sandbox":
      return "modes.sandbox";
  }
}

function modeDescriptionKey(
  mode: GameMode,
): "modes.story-description" | "modes.sandbox-description" {
  switch (mode) {
    case "story":
      return "modes.story-description";
    case "sandbox":
      return "modes.sandbox-description";
  }
}

function playerNameProblemText(
  texts: Texts,
  problem: PlayerNameProblem | undefined,
): ProblemText | undefined {
  switch (problem) {
    case undefined:
      return undefined;
    case "empty":
      return { key: "new-game.player-name-empty", text: texts.rich("new-game.player-name-empty") };
    case "too-long":
      return {
        key: "new-game.player-name-too-long",
        text: texts.rich("new-game.player-name-too-long", { max: PLAYER_NAME_MAX_LENGTH }),
      };
  }
}

function userNameProblemText(
  texts: Texts,
  problem: UserNameProblem | undefined,
  userName: string,
): ProblemText | undefined {
  switch (problem) {
    case undefined:
      return undefined;
    case "empty":
      return { key: "new-game.user-name-empty", text: texts.rich("new-game.user-name-empty") };
    case "too-long":
      return {
        key: "new-game.user-name-too-long",
        text: texts.rich("new-game.user-name-too-long", { max: USER_NAME_MAX_LENGTH }),
      };
    case "uppercase":
      return {
        key: "new-game.user-name-uppercase",
        text: texts.rich("new-game.user-name-uppercase"),
      };
    case "invalid-character":
      return {
        key: "new-game.user-name-invalid-character",
        text: texts.rich("new-game.user-name-invalid-character"),
      };
    case "invalid-start":
      return {
        key: "new-game.user-name-invalid-start",
        text: texts.rich("new-game.user-name-invalid-start"),
      };
    case "reserved":
      return {
        key: "new-game.user-name-reserved",
        text: texts.rich("new-game.user-name-reserved", { name: { code: userName } }),
      };
  }
}
