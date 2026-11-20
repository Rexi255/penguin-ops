# 0096. Side panel tabs and key hints of the workplace layout

- Status: Accepted; partly superseded by
  [0097](0097-ticket-panel-with-step-segments-and-messages-and-the-top-bars-guide-words.md) (the
  empty tickets panel and the focus order)
- Date: 2026-11-20
- Supersedes: –

## Context

ROADMAP M3.4 fills the frame of the workplace layout (ADR 0020, ADR 0092) with its tabs and key
hints: the side panel gets the tabs Tickets, Mail and Handbook, the footer gets the key hints, and
the top bar names where the player is. The panels' contents come later: the ticket panel with
hints in M3.5 (F1), the game commands in M3.6, the mail and the handbook in M3.11 (F2), the rank
and XP in M3.12. ADR 0092 keeps only entries whose functions work, and `DESIGN.md` gives each
kind of work a cable colour that appears as a 3 px cable run on tabs. The terminal takes Tab for
completion and leaves Shift+Tab to the browser (ADR 0095). Open were how the tabs behave, what
the panels show before their work packages, which key hints the footer shows now and what the
top bar shows. The owner agreed to empty states for mail and handbook and to key hints only for
keys that already work.

## Decision

- **Tabs after the WAI-ARIA tabs pattern.** `apps/ui/src/screens/side-panel.tsx` draws a
  `tablist` named "Panels" with the tabs Tickets, Mail and Handbook, each a `tab` button with its
  icon and its label, and one `tabpanel` per tab, linked by `aria-controls` and
  `aria-labelledby`; the hidden panels stay in the DOM with `hidden`. Activation is automatic:
  Left and Right move to the previous and next tab and wrap around at the ends, Home and End go
  to the first and the last tab, and the tab the focus reaches is chosen. Keys with Ctrl, Alt,
  Meta or Shift are left alone. Only the chosen tab is in the tab order (`tabindex` 0, the others
  -1). A panel with text takes the focus (`tabindex` 0), so the keyboard reaches its text; an
  empty panel does not. Tickets is chosen when the game screen appears. The choice lives in the
  side panel until a later work package needs it elsewhere (F2 Handbook in M3.11).
- **Look.** A tab is one and a half cells high, its label in Inter 500 at body size, its icon in
  the colour of its text. The chosen tab stands out three ways, so colour is never the only sign:
  the raised surface, the full text colour instead of the muted one, and a 3 px cable run in the
  colour of its kind of work (ticket blue, mail violet, handbook green) that covers the hairline
  rule under the row. The row keeps half a cell of space to the panel's edge, so the first tab's
  focus ring stays on screen; a panel's focus ring lies inside the panel.
- **Panels before their work packages.** The tickets panel stays empty until M3.5, because a
  level is always being played and an empty state such as "No tickets yet" would be wrong. The
  mail panel shows "No mail yet." and the handbook panel "The commands you learn will appear
  here." These are real empty states that stay valid later.
- **Key hints only for keys that work.** The footer shows "Tab Complete" and "Esc Menu", in the
  order of ADR 0020. A hint for a game function is a button that does what its key does (ADR
  0092). A hint for a key the terminal answers itself, such as Tab, is plain text with a `kbd`,
  not a button, because a click cannot complete in the terminal. "F1 Hint" and "F2 Handbook" join
  the footer with M3.5 and M3.11.
- **Top bar stays empty.** The top bar names where the player is (`DESIGN.md`): the ticket and
  step (M3.5) and the rank and progress (M3.12). Until those exist it keeps only the hidden
  heading of ADR 0092 and shows nothing else, instead of decoration such as the product name.
- **Focus order.** The side panel comes before the terminal in the DOM, so Shift+Tab from the
  terminal reaches the chosen tab (before M3.4 it wrapped around to the footer). Tab from the
  tabs goes through the panel, if it has text, back into the terminal.

## Alternatives considered

- **Manual activation (arrow keys move, Enter or Space chooses):** needed when switching a panel
  is slow or costly; switching these panels is instant, and automatic activation is one key less.
- **Showing only the chosen panel in the DOM:** `aria-controls` would point to missing elements;
  hidden panels cost nothing.
- **"F1 Hint" and "F2 Handbook" in the footer now:** they would promise functions that do not
  exist yet (ADR 0092).
- **The Tab hint as a button that completes in the terminal:** a click moves the focus out of the
  terminal, and completing from a button is no real use; a terminal key is shown, not pressed.
- **An empty state in the tickets panel:** false while a level is played.
- **The product name on tape in the top bar:** decoration without information, which ADR 0020's
  top bar does not show.

## Consequences

- M3.5 fills the tickets panel and the top bar's ticket and step and adds "F1 Hint"; M3.11 fills
  mail and handbook and adds "F2 Handbook", which also chooses the handbook tab, so the tab choice
  then moves up to the game screen.
- The screenshot tests of M3.15 cover the game screen with each tab chosen.
- The terminal key hints are a second kind of key hint next to the buttons; new ones choose by
  whether the game or the terminal answers the key.
