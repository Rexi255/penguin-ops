// The root of the game's interface: it hands the UI texts to every screen and switches between
// the screens (ADR 0091, ADR 0094). The current screen and what each save slot holds are plain
// React state; each screen sets the keyboard focus when it appears.
//
// The app root also saves the games (ROADMAP M3.7c, ADR 0013, ADR 0106): a new game is saved in
// its slot as soon as it starts, the game screen asks for an autosave after every change of the
// progress or of the open ticket, and the game is saved again when the player leaves it for the
// main menu or closes the window. Each save adds the real play time since the game screen appeared
// and the real time as "last played"; the slot screen shows them. It exports a slot's game to a
// file and imports a file into a slot through the desktop's file dialogs (ROADMAP M3.7d, ADR 0107).
import type { Content } from "@penguin-ops/content";
import {
  type NewGame,
  newSaveGame,
  type SaveGame,
  serializeSave,
  startingLevelId,
} from "@penguin-ops/gameplay";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import type { AppInfo, SaveFilesApi } from "./desktop-api";
import {
  EMPTY_SLOT,
  exportFileName,
  type ImportProblem,
  readImport,
  type SlotState,
} from "./saves/save-slots";
import { type GameProgress, GameScreen } from "./screens/game-screen";
import { NewGameScreen } from "./screens/new-game-screen";
import { type PendingImport, SaveSlotScreen, type SlotMessage } from "./screens/save-slot-screen";
import { StartScreen } from "./screens/start-screen";
import { TextsProvider } from "./texts/texts-context";
import type { Texts } from "./texts/ui-texts";

/** The screens the app can show; a slot is an index counting from 0. */
export type Screen =
  | { readonly name: "start" }
  /** `focusedSlot` has the focus when the screen appears. */
  | { readonly name: "save-slots"; readonly focusedSlot: number }
  | { readonly name: "new-game"; readonly slot: number }
  /** `save` is the game's save when the game screen appeared. */
  | { readonly name: "game"; readonly slot: number; readonly save: SaveGame };

/** The game being played: its slot, its save when the game screen appeared, and since when. */
interface PlayedGame {
  readonly slot: number;
  readonly save: SaveGame;
  /** The real time when the game screen appeared. */
  readonly since: number;
  /** The latest game the game screen reported, until it reports one. */
  progress: GameProgress | undefined;
}

export interface AppProps {
  readonly info: AppInfo;
  /** The loaded content: the levels a game plays. */
  readonly content: Content;
  readonly texts: Texts;
  /** The user names a player cannot take (`reservedUserNames` of the loaded worlds). */
  readonly reservedUserNames: ReadonlySet<string>;
  /** What each save slot holds when the app starts (`loadSlots`). */
  readonly slots: readonly SlotState[];
  /** Where the saves are written, exported and imported. */
  readonly saveFiles: Pick<SaveFilesApi, "writeSlot" | "deleteSlot" | "exportSave" | "importSave">;
  /** The real time in milliseconds since 1970, for the play time and "last played". */
  readonly now: () => number;
  /**
   * Registers what has to happen before the window closes: the app saves the game being played
   * and waits for the saves that are still being written.
   */
  readonly setCloseHandler: (handler: () => Promise<void>) => void;
  /** Gets every save that failed, for the log. */
  readonly onSaveError: (error: unknown) => void;
  /** Closes the game. */
  readonly onQuit: () => void;
}

export function App({
  info,
  content,
  texts,
  reservedUserNames,
  slots: initialSlots,
  saveFiles,
  now,
  setCloseHandler,
  onSaveError,
  onQuit,
}: AppProps) {
  const [screen, setScreen] = useState<Screen>({ name: "start" });
  const [slots, setSlots] = useState<readonly SlotState[]>(initialSlots);
  const [slotMessage, setSlotMessage] = useState<SlotMessage | undefined>(undefined);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | undefined>(undefined);
  const played = useRef<PlayedGame | undefined>(undefined);
  // The saves being written, one after the other, so that the latest one always wins.
  const writing = useRef<Promise<void>>(Promise.resolve());

  const setSlot = useCallback((index: number, state: SlotState) => {
    setSlots((current) => current.map((entry, slot) => (slot === index ? state : entry)));
  }, []);

  /** The save of the game being played as it is now. */
  const currentSave = useCallback(
    (game: PlayedGame): SaveGame => {
      const time = now();
      return {
        ...game.save,
        ...game.progress,
        playTime: game.save.playTime + Math.max(0, time - game.since),
        lastPlayed: time,
      };
    },
    [now],
  );

  /** Saves the game being played after the saves before it; returns the save. */
  const saveGame = useCallback((): SaveGame | undefined => {
    const game = played.current;
    if (game === undefined) {
      return undefined;
    }
    const save = currentSave(game);
    const text = serializeSave(save);
    writing.current = writing.current.then(() =>
      saveFiles.writeSlot(game.slot, text).then(
        () => {
          setSaveFailed(false);
        },
        (error: unknown) => {
          onSaveError(error);
          setSaveFailed(true);
        },
      ),
    );
    return save;
  }, [currentSave, saveFiles, onSaveError]);

  /** Writes the imported game `save` into `slot` and says how that went. */
  const writeImport = useCallback(
    (slot: number, save: SaveGame) => {
      saveFiles.writeSlot(slot, serializeSave(save)).then(
        () => {
          setSlot(slot, { kind: "game", save });
          setSlotMessage({ key: "slots.imported", slot });
        },
        (error: unknown) => {
          onSaveError(error);
          setSlotMessage({ key: "slots.import-failed", slot });
        },
      );
    },
    [saveFiles, setSlot, onSaveError],
  );

  /** Starts playing `save` in `slot` on the game screen. */
  const play = useCallback(
    (slot: number, save: SaveGame) => {
      played.current = { slot, save, since: now(), progress: undefined };
      setSaveFailed(false);
      setScreen({ name: "game", slot, save });
    },
    [now],
  );

  const onProgress = useCallback(
    (progress: GameProgress, autosave: boolean) => {
      const game = played.current;
      if (game === undefined) {
        return;
      }
      game.progress = progress;
      if (autosave) {
        saveGame();
      }
    },
    [saveGame],
  );

  // Before the window closes, the game being played is saved, and the app waits for every save.
  useEffect(() => {
    setCloseHandler(async () => {
      saveGame();
      await writing.current;
    });
  }, [setCloseHandler, saveGame]);

  let shown: ReactNode;
  switch (screen.name) {
    case "start":
      shown = (
        <StartScreen
          version={info.version}
          onPlay={() => {
            setSlotMessage(undefined);
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
          message={slotMessage}
          onNewGame={(slot) => {
            setScreen({ name: "new-game", slot });
          }}
          onContinue={(slot) => {
            const state = slots[slot];
            if (state?.kind !== "game") {
              throw new Error(`The save slot ${String(slot + 1)} has no game to play.`);
            }
            play(slot, state.save);
          }}
          onDelete={(slot) => {
            saveFiles.deleteSlot(slot).then(
              () => {
                setSlot(slot, EMPTY_SLOT);
                setSlotMessage({ key: "slots.deleted", slot });
              },
              (error: unknown) => {
                onSaveError(error);
                setSlotMessage({ key: "slots.delete-failed", slot });
              },
            );
          }}
          onExport={(slot) => {
            const state = slots[slot];
            if (state?.kind !== "game") {
              throw new Error(`The save slot ${String(slot + 1)} has no game to export.`);
            }
            saveFiles
              .exportSave({
                title: texts.plain("slots.export-title", { number: slot + 1 }),
                fileType: texts.plain("slots.file-type"),
                text: serializeSave(state.save),
                fileName: exportFileName(slot, state.save),
              })
              .then(
                (result) => {
                  if (result === "saved") {
                    setSlotMessage({ key: "slots.exported", slot });
                  }
                },
                (error: unknown) => {
                  onSaveError(error);
                  setSlotMessage({ key: "slots.export-failed", slot });
                },
              );
          }}
          onImport={(slot) => {
            saveFiles
              .importSave({
                title: texts.plain("slots.import-title", { number: slot + 1 }),
                fileType: texts.plain("slots.file-type"),
              })
              .then(
                (result) => {
                  if (result.kind === "canceled") {
                    return;
                  }
                  const reading = readImport(result.file, content, reservedUserNames);
                  if (reading.kind === "problem") {
                    setSlotMessage({ key: importProblemKey(reading.problem), slot });
                  } else if (slots[slot]?.kind === "empty") {
                    writeImport(slot, reading.save);
                  } else {
                    setPendingImport({ slot, save: reading.save });
                  }
                },
                (error: unknown) => {
                  onSaveError(error);
                  setSlotMessage({ key: "slots.import-failed", slot });
                },
              );
          }}
          pendingImport={pendingImport}
          onConfirmImport={() => {
            if (pendingImport !== undefined) {
              writeImport(pendingImport.slot, pendingImport.save);
            }
            setPendingImport(undefined);
          }}
          onCancelImport={() => {
            setPendingImport(undefined);
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
          onStart={(game: NewGame) => {
            const save = newSaveGame(game, startingLevelId(content), now());
            setSlot(slot, { kind: "game", save });
            play(slot, save);
          }}
          onBack={() => {
            setScreen({ name: "save-slots", focusedSlot: slot });
          }}
        />
      );
      break;
    }
    case "game": {
      const { slot } = screen;
      shown = (
        <GameScreen
          key={slot}
          content={content}
          save={screen.save}
          onProgress={onProgress}
          saveFailed={saveFailed}
          onMainMenu={() => {
            const save = saveGame();
            if (save !== undefined) {
              setSlot(slot, { kind: "game", save });
            }
            played.current = undefined;
            setScreen({ name: "start" });
          }}
        />
      );
      break;
    }
  }
  return <TextsProvider texts={texts}>{shown}</TextsProvider>;
}

/** The message key of an import problem (ADR 0107). */
function importProblemKey(problem: ImportProblem): SlotMessage["key"] {
  switch (problem) {
    case "unreadable":
      return "slots.import-failed";
    case "not-a-save":
      return "slots.import-not-a-save";
    case "damaged":
      return "slots.import-damaged";
    case "too-new":
      return "slots.import-too-new";
    case "user-name-taken":
      return "slots.import-user-name-taken";
  }
}
