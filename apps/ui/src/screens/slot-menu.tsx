// The menu of a save slot (ROADMAP M3.7c, ADR 0106): a button with three dots next to the slot
// that opens a list of the slot's actions, after the WAI-ARIA menu button pattern. Enter, Space
// or Down opens it with the focus on the first entry, Up on the last; Up and Down move through the
// entries and wrap, Home and End go to the first and the last. Esc closes it and returns the focus
// to the button without leaving the screen; Tab and a click outside close it too.

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Icon } from "../icons/icon";

/** An entry of a slot menu. */
export interface SlotMenuEntry {
  /** A stable key of the entry, such as "delete". */
  readonly key: string;
  readonly label: ReactNode;
  readonly onSelect: () => void;
}

export interface SlotMenuProps {
  /** The accessible name of the button and the menu, such as "Actions for slot 1". */
  readonly label: string;
  /** The entries; the menu needs at least one. */
  readonly entries: readonly SlotMenuEntry[];
}

/** Which entry gets the focus when the menu opens. */
type OpenAt = "first" | "last";

export function SlotMenu({ label, entries }: SlotMenuProps) {
  const menuId = useId();
  const [openAt, setOpenAt] = useState<OpenAt | undefined>(undefined);
  const button = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const open = openAt !== undefined;

  const close = useCallback((returnFocus: boolean) => {
    setOpenAt(undefined);
    if (returnFocus) {
      button.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (openAt === undefined) {
      return;
    }
    const index = openAt === "first" ? 0 : entries.length - 1;
    items.current[index]?.focus();
  }, [openAt, entries.length]);

  // A click anywhere outside the menu closes it.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpenAt(event.key === "ArrowDown" ? "first" : "last");
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const current = items.current.findIndex((item) => item === document.activeElement);
    const focus = (index: number) => {
      items.current[(index + entries.length) % entries.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        focus(current + 1);
        break;
      case "ArrowUp":
        focus(current - 1);
        break;
      case "Home":
        focus(0);
        break;
      case "End":
        focus(entries.length - 1);
        break;
      case "Escape":
        // The screen's Esc goes back; inside the menu, Esc only closes the menu.
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        return;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div ref={container} className="slot-menu">
      <button
        ref={button}
        type="button"
        className="slot-menu__button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) {
            close(false);
          } else {
            setOpenAt("first");
          }
        }}
        onKeyDown={onButtonKeyDown}
      >
        <Icon name="more" />
      </button>
      {open && (
        <ul
          id={menuId}
          className="slot-menu__list"
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          {entries.map((entry, index) => (
            <li key={entry.key} role="none">
              <button
                ref={(element) => {
                  items.current[index] = element;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="slot-menu__entry"
                onClick={() => {
                  close(false);
                  entry.onSelect();
                }}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
