// The save slot screen (ROADMAP M3.1b, M3.1c, M3.2b, M3.7c): the three save slots and the way back
// to the start screen. An empty slot is a button that opens the new game screen for it; a slot
// with a game shows the player's name, the mode, the solved tickets, the play time and when it was
// last played, and resumes the game (ADR 0092, ADR 0094, ADR 0106). A slot whose save the game
// cannot play says why and cannot be opened. The button with three dots next to a slot opens its
// menu: Export for a game, Import for every slot and Delete for a slot with a save (ADR 0107);
// deleting a slot and importing over a save ask first.

import type { SaveGame } from "@penguin-ops/gameplay";
import { useEffect, useId, useRef, useState } from "react";

import { type SlotLock, type SlotState, solvedTicketCount } from "../saves/save-slots";
import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import type { Texts } from "../texts/ui-texts";
import { ConfirmDialog } from "./confirm-dialog";
import { modeTitleKey } from "./new-game-screen";
import { SlotMenu, type SlotMenuEntry } from "./slot-menu";

export { SAVE_SLOT_COUNT } from "../saves/save-slots";

/** A message of the screen about a slot, such as that it was deleted; `slot` counts from 0. */
export interface SlotMessage {
  readonly key:
    | "slots.deleted"
    | "slots.delete-failed"
    | "slots.exported"
    | "slots.export-failed"
    | "slots.imported"
    | "slots.import-failed"
    | "slots.import-not-a-save"
    | "slots.import-damaged"
    | "slots.import-too-new"
    | "slots.import-user-name-taken";
  readonly slot: number;
}

/** An imported game that waits for the player to confirm that it replaces a slot's save. */
export interface PendingImport {
  /** The slot, counting from 0. */
  readonly slot: number;
  readonly save: SaveGame;
}

export interface SaveSlotScreenProps {
  /** What each slot holds; `SAVE_SLOT_COUNT` entries. */
  readonly slots: readonly SlotState[];
  /** The index of the slot that has the focus when the screen appears, counting from 0. */
  readonly focusedSlot: number;
  /** The latest message about a slot, announced politely; none at first. */
  readonly message?: SlotMessage | undefined;
  /** Opens the new game screen for the empty slot `index`, counting from 0. */
  readonly onNewGame: (index: number) => void;
  /** Resumes the game in the slot `index`, counting from 0. */
  readonly onContinue: (index: number) => void;
  /** Deletes the slot `index`, counting from 0, after the player confirmed it. */
  readonly onDelete: (index: number) => void;
  /** Exports the game of the slot `index`, counting from 0, to a file. */
  readonly onExport: (index: number) => void;
  /** Imports a file into the slot `index`, counting from 0. */
  readonly onImport: (index: number) => void;
  /** An imported game that would replace a slot's save; the screen asks the player first. */
  readonly pendingImport?: PendingImport | undefined;
  /** Replaces the slot's save with the pending import. */
  readonly onConfirmImport: () => void;
  /** Drops the pending import. */
  readonly onCancelImport: () => void;
  /** Returns to the start screen. */
  readonly onBack: () => void;
}

/** The text key of the reason why a slot cannot be played. */
function lockKey(lock: SlotLock) {
  switch (lock) {
    case "damaged":
      return "slots.damaged";
    case "too-new":
      return "slots.too-new";
    case "user-name-taken":
      return "slots.user-name-taken";
  }
}

/** The milliseconds per minute, to show the play time in whole minutes. */
const MINUTE = 60_000;

/** The play time of a game, such as "1 h 12 min played". */
function PlayTime({ playTime }: { readonly playTime: number }) {
  const texts = useTexts();
  const minutes = Math.floor(playTime / MINUTE);
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? (
    <InlineText
      text={texts.rich("slots.play-time-minutes", { minutes })}
      textKey="slots.play-time-minutes"
    />
  ) : (
    <InlineText
      text={texts.rich("slots.play-time-hours", { hours, minutes: minutes % 60 })}
      textKey="slots.play-time-hours"
    />
  );
}

/** When the game was last played, as a date and a time in the player's language. */
export function lastPlayedText(texts: Pick<Texts, "language">, lastPlayed: number): string {
  return new Intl.DateTimeFormat(texts.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(lastPlayed);
}

/** The details of a slot's game: solved tickets, play time and when it was last played. */
function GameDetails({ save, id }: { readonly save: SaveGame; readonly id: string }) {
  const texts = useTexts();
  return (
    <span id={id} className="save-slot__details">
      <span>
        <InlineText
          text={texts.rich("slots.solved", { count: solvedTicketCount(save) })}
          textKey="slots.solved"
        />
      </span>{" "}
      <span>
        <PlayTime playTime={save.playTime} />
      </span>{" "}
      <span>
        <InlineText
          text={texts.rich("slots.last-played", { date: lastPlayedText(texts, save.lastPlayed) })}
          textKey="slots.last-played"
        />
      </span>
    </span>
  );
}

export function SaveSlotScreen({
  slots,
  focusedSlot,
  message,
  onNewGame,
  onContinue,
  onDelete,
  onExport,
  onImport,
  pendingImport,
  onConfirmImport,
  onCancelImport,
  onBack,
}: SaveSlotScreenProps) {
  const texts = useTexts();
  const slotButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const idPrefix = useId();
  // The slot whose deletion the player is asked to confirm.
  const [confirming, setConfirming] = useState<number | undefined>(undefined);
  const dialogOpen = confirming !== undefined || pendingImport !== undefined;

  // The keyboard is the main input (PRODUCT.md): a slot has the focus from the start, the first
  // one or the one the player comes back from, so Enter works at once.
  useEffect(() => {
    slotButtons.current[focusedSlot]?.focus();
  }, [focusedSlot]);

  // Esc goes back, like in the menus of other games; game functions use Esc (ADR 0020). While
  // the dialog is open, Esc belongs to the dialog.
  useEffect(() => {
    if (dialogOpen) {
      return;
    }
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
  }, [onBack, dialogOpen]);

  // The slot that gets the focus when the dialog has closed and the screen is no longer inert.
  const focusAfterDialog = useRef<number | undefined>(undefined);
  useEffect(() => {
    const index = focusAfterDialog.current;
    if (!dialogOpen && index !== undefined) {
      focusAfterDialog.current = undefined;
      slotButtons.current[index]?.focus();
    }
  }, [dialogOpen]);

  const closeDialog = (index: number) => {
    focusAfterDialog.current = index;
    setConfirming(undefined);
  };

  /** The entries of the menu of the slot `index` (ADR 0107). */
  const menuEntries = (slot: SlotState, index: number): SlotMenuEntry[] => {
    const exportEntry: SlotMenuEntry = {
      key: "export",
      label: <InlineText text={texts.rich("slots.export")} textKey="slots.export" />,
      onSelect: () => {
        onExport(index);
      },
    };
    const importEntry: SlotMenuEntry = {
      key: "import",
      label: <InlineText text={texts.rich("slots.import")} textKey="slots.import" />,
      onSelect: () => {
        onImport(index);
      },
    };
    const deleteEntry: SlotMenuEntry = {
      key: "delete",
      label: <InlineText text={texts.rich("slots.delete")} textKey="slots.delete" />,
      onSelect: () => {
        setConfirming(index);
      },
    };
    switch (slot.kind) {
      case "empty":
        return [importEntry];
      case "game":
        return [exportEntry, importEntry, deleteEntry];
      case "locked":
        return [importEntry, deleteEntry];
    }
  };

  const replacedSlot = pendingImport === undefined ? undefined : slots[pendingImport.slot];

  const confirmingSlot = confirming === undefined ? undefined : slots[confirming];
  return (
    <>
      <main className="save-slot-screen" inert={dialogOpen}>
        <h1 className="save-slot-screen__title">
          <InlineText text={texts.rich("slots.title")} textKey="slots.title" />
        </h1>
        <div className="save-slot-screen__group">
          <ol className="save-slot-screen__slots">
            {slots.map((slot, index) => {
              const number = index + 1;
              const nameId = `${idPrefix}-slot-${String(number)}-name`;
              const stateId = `${idPrefix}-slot-${String(number)}-state`;
              const detailsId = `${idPrefix}-slot-${String(number)}-details`;
              return (
                <li key={number} className="save-slot-row">
                  <button
                    ref={(element) => {
                      slotButtons.current[index] = element;
                    }}
                    type="button"
                    className={slot.kind === "locked" ? "save-slot save-slot--locked" : "save-slot"}
                    // The name, the state and the details are blocks of the row with spaces between
                    // them, which the flex layout does not draw. Named by its visible texts, the
                    // button reads "Slot 1 New game" instead of running them together, and its name
                    // holds exactly the visible text (WCAG 2.5.3, Label in Name).
                    aria-labelledby={
                      slot.kind === "game"
                        ? `${nameId} ${stateId} ${detailsId}`
                        : `${nameId} ${stateId}`
                    }
                    aria-disabled={slot.kind === "locked" ? true : undefined}
                    onClick={() => {
                      switch (slot.kind) {
                        case "empty":
                          onNewGame(index);
                          break;
                        case "game":
                          onContinue(index);
                          break;
                        case "locked":
                          break;
                      }
                    }}
                  >
                    <span className="save-slot__heading">
                      <span id={nameId} className="save-slot__name">
                        <InlineText
                          text={texts.rich("slots.slot", { number })}
                          textKey="slots.slot"
                        />
                      </span>{" "}
                      <span id={stateId} className="save-slot__state">
                        <SlotStateText slot={slot} />
                      </span>
                    </span>
                    {slot.kind === "game" && (
                      <>
                        {" "}
                        <GameDetails save={slot.save} id={detailsId} />
                      </>
                    )}
                  </button>
                  <SlotMenu
                    label={texts.plain("slots.actions", { number })}
                    entries={menuEntries(slot, index)}
                  />
                </li>
              );
            })}
          </ol>
          <p className="save-slot-screen__message" role="status">
            {message !== undefined && (
              <InlineText
                text={texts.rich(message.key, { number: message.slot + 1 })}
                textKey={message.key}
              />
            )}
          </p>
        </div>
        <button
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
      {confirming !== undefined && confirmingSlot !== undefined && (
        <ConfirmDialog
          title={
            <InlineText
              text={texts.rich("slots.delete-title", { number: confirming + 1 })}
              textKey="slots.delete-title"
            />
          }
          text={
            confirmingSlot.kind === "game" ? (
              // The player's name is a value: shown as typed, never read as markup.
              <InlineText
                text={texts.rich("slots.delete-game", { player: confirmingSlot.save.playerName })}
                textKey="slots.delete-game"
              />
            ) : (
              <InlineText text={texts.rich("slots.delete-save")} textKey="slots.delete-save" />
            )
          }
          confirmLabel={<InlineText text={texts.rich("slots.delete")} textKey="slots.delete" />}
          cancelLabel={<InlineText text={texts.rich("slots.cancel")} textKey="slots.cancel" />}
          onConfirm={() => {
            onDelete(confirming);
            closeDialog(confirming);
          }}
          onCancel={() => {
            closeDialog(confirming);
          }}
        />
      )}
      {pendingImport !== undefined && replacedSlot !== undefined && (
        <ConfirmDialog
          title={
            <InlineText
              text={texts.rich("slots.replace-title", { number: pendingImport.slot + 1 })}
              textKey="slots.replace-title"
            />
          }
          text={
            replacedSlot.kind === "game" ? (
              // The players' names are values: shown as typed, never read as markup.
              <InlineText
                text={texts.rich("slots.replace-game", {
                  player: replacedSlot.save.playerName,
                  imported: pendingImport.save.playerName,
                })}
                textKey="slots.replace-game"
              />
            ) : (
              <InlineText
                text={texts.rich("slots.replace-save", {
                  imported: pendingImport.save.playerName,
                })}
                textKey="slots.replace-save"
              />
            )
          }
          confirmLabel={<InlineText text={texts.rich("slots.replace")} textKey="slots.replace" />}
          cancelLabel={<InlineText text={texts.rich("slots.cancel")} textKey="slots.cancel" />}
          onConfirm={() => {
            focusAfterDialog.current = pendingImport.slot;
            onConfirmImport();
          }}
          onCancel={() => {
            focusAfterDialog.current = pendingImport.slot;
            onCancelImport();
          }}
        />
      )}
    </>
  );
}

/** What a slot holds, in words: "New game", the player and the mode, or why it is locked. */
function SlotStateText({ slot }: { readonly slot: SlotState }) {
  const texts = useTexts();
  switch (slot.kind) {
    case "empty":
      return <InlineText text={texts.rich("slots.new-game")} textKey="slots.new-game" />;
    case "game":
      // The player's name is a value: shown as typed, never read as markup.
      return (
        <InlineText
          text={texts.rich("slots.game", {
            player: slot.save.playerName,
            mode: texts.plain(modeTitleKey(slot.save.mode)),
          })}
          textKey="slots.game"
        />
      );
    case "locked": {
      const key = lockKey(slot.lock);
      return <InlineText text={texts.rich(key)} textKey={key} />;
    }
  }
}
