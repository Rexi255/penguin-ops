// A modal question before an action that cannot be undone (ROADMAP M3.7c, ADR 0106), such as
// deleting a save slot. It floats over the screen like the pause menu; the screen behind it must
// be inert while it is open. Cancel has the focus, so Enter never confirms by mistake, and Esc
// cancels too.

import { type ReactNode, useEffect, useId, useRef } from "react";

export interface ConfirmDialogProps {
  /** The question, the dialog's name. */
  readonly title: ReactNode;
  /** What the action does, the dialog's description. */
  readonly text: ReactNode;
  /** The label of the button that confirms the action. */
  readonly confirmLabel: ReactNode;
  /** The label of the button that cancels it. */
  readonly cancelLabel: ReactNode;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const textId = useId();
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.repeat) {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel]);

  return (
    <div className="dialog-layer">
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
      >
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        <p id={textId} className="dialog__text">
          {text}
        </p>
        <div className="dialog__actions">
          <button
            ref={cancelButton}
            type="button"
            className="button"
            onClick={() => {
              onCancel();
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
