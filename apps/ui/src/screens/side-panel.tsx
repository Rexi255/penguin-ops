// The side panel of the workplace layout (ROADMAP M3.4, ADR 0020, ADR 0096): a row of tabs for
// the tickets, the mail and the handbook, each marked with the cable colour of its kind of work,
// and one panel per tab. The tabs follow the WAI-ARIA tabs pattern with automatic activation:
// only the chosen tab is in the tab order, the arrow keys, Home and End move between the tabs
// and choose the tab they reach.
//
// The tickets panel stays empty until the ticket panel (M3.5) fills it, because a level is
// always being played and "no tickets" would be wrong. The mail and the handbook show their
// empty states until M3.11 fills them.

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";

import { Icon, type IconName } from "../icons/icon";
import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";

/** The labels of the tabs, texts without placeholders. */
type TabLabelKey = "game.tickets" | "game.mail" | "game.handbook";

/** The empty states of the panels, texts without placeholders. */
type EmptyStateKey = "game.mail-empty" | "game.handbook-empty";

/** The tabs of the side panel, in their order. */
export const SIDE_PANEL_TABS = ["tickets", "mail", "handbook"] as const;

export type SidePanelTab = (typeof SIDE_PANEL_TABS)[number];

/** What a tab shows: its icon, its cable colour and its label. */
const TAB_LOOKS: Readonly<
  Record<
    SidePanelTab,
    {
      readonly icon: IconName;
      readonly cable: "ticket" | "mail" | "handbook";
      readonly label: TabLabelKey;
    }
  >
> = {
  tickets: { icon: "ticket", cable: "ticket", label: "game.tickets" },
  mail: { icon: "mail", cable: "mail", label: "game.mail" },
  handbook: { icon: "handbook", cable: "handbook", label: "game.handbook" },
};

/**
 * The tab a key moves to from the tab at `index`, or `undefined` for a key the tabs leave alone.
 * Left and Right wrap around at the ends, as in the WAI-ARIA tabs pattern.
 */
export function tabAfterKey(key: string, index: number): SidePanelTab | undefined {
  const count = SIDE_PANEL_TABS.length;
  switch (key) {
    case "ArrowLeft":
      return SIDE_PANEL_TABS[(index - 1 + count) % count];
    case "ArrowRight":
      return SIDE_PANEL_TABS[(index + 1) % count];
    case "Home":
      return SIDE_PANEL_TABS[0];
    case "End":
      return SIDE_PANEL_TABS[count - 1];
    default:
      return undefined;
  }
}

/** The empty state of a panel as a paragraph. */
function EmptyState({ textKey }: { readonly textKey: EmptyStateKey }) {
  const texts = useTexts();
  return (
    <p className="side-panel__empty">
      <InlineText text={texts.rich(textKey)} textKey={textKey} />
    </p>
  );
}

/** The content of a tab's panel, or `null` while the panel has none. */
function panelContent(tab: SidePanelTab): ReactNode {
  switch (tab) {
    case "tickets":
      return null;
    case "mail":
      return <EmptyState textKey="game.mail-empty" />;
    case "handbook":
      return <EmptyState textKey="game.handbook-empty" />;
  }
}

export function SidePanel() {
  const texts = useTexts();
  const idPrefix = useId();
  const [selected, setSelected] = useState<SidePanelTab>("tickets");
  const tabButtons = useRef(new Map<SidePanelTab, HTMLButtonElement>());

  const tabId = (tab: SidePanelTab) => `${idPrefix}-tab-${tab}`;
  const panelId = (tab: SidePanelTab) => `${idPrefix}-panel-${tab}`;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const next = tabAfterKey(event.key, index);
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    setSelected(next);
    tabButtons.current.get(next)?.focus();
  };

  return (
    <div className="side-panel">
      <div className="side-panel__tabs" role="tablist" aria-label={texts.plain("game.panels")}>
        {SIDE_PANEL_TABS.map((tab, index) => {
          const { icon, cable, label } = TAB_LOOKS[tab];
          const isSelected = tab === selected;
          return (
            <button
              key={tab}
              ref={(element) => {
                if (element === null) {
                  tabButtons.current.delete(tab);
                } else {
                  tabButtons.current.set(tab, element);
                }
              }}
              id={tabId(tab)}
              type="button"
              role="tab"
              className={`side-panel__tab side-panel__tab--${cable}`}
              aria-selected={isSelected}
              aria-controls={panelId(tab)}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => {
                setSelected(tab);
              }}
              onKeyDown={(event) => {
                onKeyDown(event, index);
              }}
            >
              <Icon name={icon} />
              <InlineText text={texts.rich(label)} textKey={label} />
            </button>
          );
        })}
      </div>
      {SIDE_PANEL_TABS.map((tab) => {
        const content = panelContent(tab);
        return (
          <div
            key={tab}
            id={panelId(tab)}
            role="tabpanel"
            className="side-panel__panel"
            aria-labelledby={tabId(tab)}
            hidden={tab !== selected}
            // A panel without a control of its own takes the focus, so the keyboard reaches its
            // text (WAI-ARIA tabs pattern); an empty panel has nothing to reach.
            tabIndex={content === null ? undefined : 0}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
