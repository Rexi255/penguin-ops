// The settings in the game (ROADMAP M3.8b, ADR 0012, ADR 0109): a modal dialog in place of the
// pause menu, with the settings form and Back, which Esc chooses too and which returns to the
// pause menu. A new language changes the texts of the open tickets and their files, so the game
// asks first: the tickets then start again in the new language from their checkpoints. A language
// setting that keeps the game's language, such as the system's language when it is the one being
// played, needs no question.

import { gameLanguage, type Settings } from "@penguin-ops/gameplay";
import { useEffect, useId, useRef, useState } from "react";

import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import { ConfirmDialog } from "./confirm-dialog";
import { SettingsForm } from "./settings-form";

export interface SettingsDialogProps {
  readonly settings: Settings;
  /** The operating system's locale, which gives the language of the setting `system`. */
  readonly locale: string;
  /** Gets the settings with one of them changed, unless the game's language changes. */
  readonly onChange: (next: Settings) => void;
  /**
   * Gets the settings with a language that changes the game's language, after the player
   * confirmed that the tickets start again.
   */
  readonly onRestart: (next: Settings) => void;
  /** Whether the latest change could not be written. */
  readonly saveFailed: boolean;
  /** Returns to the pause menu. */
  readonly onBack: () => void;
}

export function SettingsDialog({
  settings,
  locale,
  onChange,
  onRestart,
  saveFailed,
  onBack,
}: SettingsDialogProps) {
  const texts = useTexts();
  const titleId = useId();
  const languageInput = useRef<HTMLInputElement>(null);
  // The settings with the new language, while the game asks whether to restart the tickets.
  const [pending, setPending] = useState<Settings | undefined>(undefined);
  const asking = pending !== undefined;

  // The chosen language has the focus when the dialog appears and when the question closes.
  useEffect(() => {
    if (!asking) {
      languageInput.current?.focus();
    }
  }, [asking]);

  // Esc returns to the pause menu; while the question is open, Esc belongs to the question.
  useEffect(() => {
    if (asking) {
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
  }, [asking, onBack]);

  return (
    <div className="pause-menu">
      <div
        className="pause-menu__dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={asking}
      >
        <h2 id={titleId} className="pause-menu__title">
          <InlineText text={texts.rich("settings.title")} textKey="settings.title" />
        </h2>
        <SettingsForm
          settings={settings}
          locale={locale}
          onChange={(next) => {
            if (gameLanguage(next.language, locale) === texts.language) {
              onChange(next);
            } else {
              setPending(next);
            }
          }}
          saveFailed={saveFailed}
          languageInput={languageInput}
        />
        <div className="settings-dialog__actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              onBack();
            }}
          >
            <InlineText text={texts.rich("settings.back")} textKey="settings.back" />
          </button>
        </div>
      </div>
      {pending !== undefined && (
        <ConfirmDialog
          title={
            <InlineText
              text={texts.rich("settings.restart-title")}
              textKey="settings.restart-title"
            />
          }
          text={
            <InlineText
              text={texts.rich("settings.restart-text")}
              textKey="settings.restart-text"
            />
          }
          confirmLabel={
            <InlineText text={texts.rich("settings.restart")} textKey="settings.restart" />
          }
          cancelLabel={
            <InlineText text={texts.rich("settings.cancel")} textKey="settings.cancel" />
          }
          onConfirm={() => {
            setPending(undefined);
            onRestart(pending);
          }}
          onCancel={() => {
            setPending(undefined);
          }}
        />
      )}
    </div>
  );
}
