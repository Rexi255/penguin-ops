# 0114. Settings as a full-window frame with a category list and a footer with Back

- Status: Accepted
- Date: 2026-11-27
- Supersedes: –

## Context

ADR 0109 added the settings as a screen of the main menu and a dialog of the pause menu. Both
showed one narrow column of 45 cells in the middle of the window, with every group below the
other and the Back button at the very end. With each work package since (M3.8c, M3.9, M3.10) the
column grew, until it was about three screens high on a 1080p display. The owner found that it
looked like a mobile app instead of a PC game, that it wasted the 16:9 window (players use 1080p
to 4K), and that Back was only visible after scrolling to the bottom. The workplace layout of
ADR 0020 already fills the window with a top bar, a side panel and a footer, so the settings
were the one part of the game that did not.

No earlier record fixes the settings' layout, so none is superseded.

## Decision

- **One frame for both entry points.** The settings form fills the whole window like the game
  screen: a top bar with the title, a body with the category list on the left and the chosen
  category's settings on the right, and a footer. The settings screen of the main menu and the
  settings dialog of the game show the same form (`SettingsForm`); the dialog covers the whole
  window on a solid ground (`.settings-overlay`) instead of floating in a box. Its role, modal
  state, inert content while the language question is open and the question's stacking are
  unchanged (ADR 0109).
- **Only the settings scroll.** The frame is a grid of three rows (top bar, body, footer). The
  panel of the settings scrolls inside its row, so the footer and Back are on screen at every
  window size and font size, also at 200 % in 960 × 600 px.
- **Three categories** in the order General, Display and Sound:
  - General: the language and "reduce motion".
  - Display: fullscreen, the font size, the colour scheme and the effects.
  - Sound: the three volumes.

  "Reduce motion" is in General because it is an accessibility setting that applies to the whole
  game. The group that held fullscreen and the font size is now named "Screen" so that it does
  not repeat the category's name.
- **The list follows the WAI-ARIA tabs pattern**, as the game's side panel does, but vertical:
  `role="tablist"` with `aria-orientation="vertical"`, only the chosen tab in the tab order,
  Up, Down, Home and End move between the tabs and choose the one they reach (Down after the
  last tab wraps to the first). Every panel stays in the page and is hidden unless it is the
  chosen one. The chosen tab is marked by the raised surface, the full text colour and a bar at
  its start in the text colour, so that colour is never the only sign. It takes no cable colour,
  because a category is no kind of work (The Quarantine Rule of DESIGN.md).
- **The footer holds Back and the alert.** Back is a standard button with the key cap `Esc`. The
  cap is hidden from assistive technology and the button announces its shortcut with
  `aria-keyshortcuts="Escape"`, so its accessible name stays "Back". The alert after a failed
  write moves into the footer (`role="alert"`, always in the page), so that it is on screen too.
- **Groups stand side by side.** The groups of a category fill columns of at least 45 cells, as
  many as fit; a group is at most 60 cells wide and the groups at most 160 cells in all, so that
  sliders and rows do not stretch across a 4K window. Groups of few and short choices, such as
  the colour schemes, use two columns inside their group.
- **The language radio button has the focus when the settings open**, as before (ADR 0109); the
  language is in the first category, which is chosen when the settings open.
- **New texts**: the names of the three categories and the accessible name of the list, in both
  languages. The existing texts are unchanged, except that "Display" as the name of a group is
  now "Screen" ("Bildschirm").

## Alternatives considered

- **One page with all groups in two or three columns and no list:** every setting is visible at
  once, but at the default font size the page is still too high for 1080p once the groups wrap,
  at large font sizes it scrolls again, and the groups have no order a player can learn. A list
  of categories is what players know from PC games.
- **A list with more categories (language, display, colours, effects, sound):** each page would
  hold one or two controls and look empty. Three categories fill their pages and still keep the
  list short.
- **Keep Back at the end of the form and make it sticky:** this fixes only the complaint about
  Back and leaves the mobile look of the column.
- **Show only the chosen panel, without keeping the others in the page:** it would save a few
  elements, but the panel IDs the tabs point to would not exist, and a category's state (such as
  a slider being dragged) could not survive a change of category.
- **Name the button "Esc Back" like the game footer's key hints:** the game's hints are small
  and plain; Back is the one control the player needs here, so it is a button, and its name is
  the word the player looks for.

## Consequences

- The settings use the whole window at every aspect ratio from 960 × 600 px up to 4K; a very
  large font size leaves little room in a small window, but Back and the list stay on screen and
  the settings scroll.
- Every test that touches a control outside General first chooses its category; the end-to-end
  tests assert that Back is in the viewport at the largest font size in a small window, for the
  screen and for the dialog.
- A new setting needs a category. A fourth category (for example the keys, ROADMAP M3.14) is
  one entry in the list of categories and one panel.
- The screenshot tests of ROADMAP M3.15 take one screenshot per category, language and colour
  scheme.
- The previous layout's single-column styles are gone; the settings screen is no longer a
  column of the width of the side panel.
