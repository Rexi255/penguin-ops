# 0092. Empty slots start the game and Esc opens a modal pause menu

- Status: Accepted
- Date: 2026-11-19
- Supersedes: [0091](0091-screen-navigation-as-state-in-the-app-root-with-focus-and-esc-per-screen.md)
  (only the empty slots and the focus on the save slot screen)

## Context

ROADMAP M3.1c adds the game screen and the pause menu. ADR 0091 kept empty save slots out of the
controls until the new game flow (M3.2) exists, so the game screen could not be reached from the
app, and neither the player nor an end-to-end test could open it. ADR 0020 lists the pause menu's
entries as continue, settings, handbook, and save and quit; settings, the handbook and the save
system do not exist yet. `CLAUDE.md` forbids controls that pretend to work.

## Decision

- **Empty slots start the game:** an empty slot is a button that shows the slot's name and "New
  game" and opens the game screen. M3.2 puts the new game flow (name and mode) between the slot
  and the game screen; M3.7 fills slots with saved games. The button is named by its two visible
  texts (`aria-labelledby`), separated by a space, so its accessible name is exactly what the
  player sees ("Slot 1 New game").
- **Focus on the save slot screen:** the first slot has the focus when the screen appears, so
  Enter on Play and Enter again start a game. Back follows the slots in the tab order; Esc still
  goes back.
- **Game screen frame:** the game screen is the workplace layout of ADR 0020 as a CSS grid: a top
  bar (`header`), the side panel of 45 columns (`aside`, named "Side panel"), the terminal area
  (`main`, named "Terminal") and the key-hint footer (`footer`). The areas stay empty until
  their work packages fill them. A visually hidden level 1 heading ("Workplace") names the
  screen.
- **Key hints are buttons:** the footer's key hint "Esc Menu" is a button that does what its key
  does, so the mouse can open the pause menu too. It has the focus when the game screen appears
  and whenever the pause menu closes, until the terminal (M3.3) takes the focus.
- **Modal pause menu:** Esc in the game opens the pause menu, a dialog (`role="dialog"`,
  `aria-modal="true"`, named by its title "Paused") over the game. The game frame behind it is
  `inert`, so Tab stays inside the menu and clicks do not reach the game. Continue has the
  focus. Esc or Continue closes the menu and gives the focus back to the element that had it;
  Main menu leaves the game for the start screen. Holding Esc down opens the menu once and does
  not close it again (key repeat is ignored).
- **Only working entries:** the pause menu holds Continue and Main menu now. Settings, the
  handbook and saving join it with their work packages; with the save system (M3.7), Main menu
  saves first.
- **Pause state in the screen:** whether the menu is open is state of the game screen, not of
  the app root; it is not game state and may be lost when the game screen is left.

## Alternatives considered

- **Keep the game screen unreachable until M3.2:** only component tests could check it, and the
  owner could not see it in the app.
- **Do M3.2 before M3.1c:** the new game flow needs a game screen to lead to.
- **The native `<dialog>` element with `showModal()`:** it brings the top layer, a backdrop and
  its own Esc handling, but jsdom does not implement `showModal()`, so the component tests could
  not open it, and its Esc handling (the `cancel` event and the browser's close request rules)
  would differ from the document-level Esc handling of the other screens. A dialog role with
  `inert` on the rest gives the same keyboard behaviour under our control.
- **An accessible name such as "Slot 1: new game" in `aria-label`:** axe-core reports
  `label-content-name-mismatch` (WCAG 2.5.3), because the name differs from the visible text.
- **A dimming scrim behind the pause menu:** it needs a new translucent colour token without a
  contrast pair; the inert frame and the dialog's shadow already set the menu apart (DESIGN.md,
  Elevation & Depth).

## Consequences

- The whole flow from the start screen into the game and back is reachable with the keyboard
  alone and covered by end-to-end tests with axe-core in both languages.
- M3.2 changes where an empty slot leads; M3.3 moves the game screen's focus to the terminal and
  must leave Esc to the pause menu (ADR 0020).
- Every later pause menu entry is a real function with its own tests.
