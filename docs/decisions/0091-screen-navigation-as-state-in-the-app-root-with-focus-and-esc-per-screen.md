# 0091. Screen navigation as state in the app root with focus and Esc per screen

- Status: Accepted
- Date: 2026-11-19
- Supersedes: –

## Context

ROADMAP M3.1b adds the second screen, the save slot screen, and with it the first navigation
between screens. The flow of `PRODUCT.md` is start screen, save slot screen, game, with Esc
opening the pause menu in the game (ADR 0020); new game, settings and credits follow later. The
game is a desktop app with a fixed, small set of screens and no URLs, address bar or browser
history. The keyboard is the main input, so every screen change must leave the focus somewhere
useful. Until the save system exists (M3.7) every slot is empty, and starting a new game in a
slot needs the new game flow (M3.2), which does not exist yet.

## Decision

- **State in the app root:** `apps/ui/src/app.tsx` holds the current screen as React state of
  the union type `Screen` (now `"start" | "save-slots"`) and picks the screen component with an
  exhaustive `switch`. Screens get callbacks such as `onPlay` and `onBack` and do not know about
  each other. No router library.
- **Focus per screen:** every screen moves the keyboard focus to its first control when it
  appears: Play on the start screen (also on the way back), Back on the save slot screen.
- **Esc goes back:** a screen below the start screen listens for Esc on the document while it is
  shown and goes back once per key press (key repeat is ignored). The start screen does not
  react to Esc. In the game, Esc opens the pause menu instead (ADR 0020, M3.1c).
- **Empty slots are not controls:** until M3.2 an empty slot is a list item with its name and
  the state "Empty"; it is not a button and not in the tab order.

## Alternatives considered

- **A router library (for example React Router's memory router):** made for URLs and browser
  history, which a desktop game does not have; one more dependency for a handful of fixed
  screens, and the focus handling would still be our own.
- **Moving the focus to the screen's heading:** helps screen readers announce the new screen,
  but the player would need an extra Tab before Enter works. Screen reader support is a later
  milestone (`PRODUCT.md`); it can revisit this.
- **Empty slots as buttons that do nothing yet:** a control that pretends to work is a
  placeholder implementation, which `CLAUDE.md` forbids.

## Consequences

- Adding a screen means one more member of `Screen` and one more `case`; TypeScript reports a
  missing case.
- Every screen owns its focus and its Esc handling, and its tests check both.
- A screen's state is lost when it is left; screens that need to keep state (the game) keep it
  in the app root or in gameplay state, not in the screen component.
- M3.2 makes empty slots start the new game flow; M3.7 fills slots with saved games.
