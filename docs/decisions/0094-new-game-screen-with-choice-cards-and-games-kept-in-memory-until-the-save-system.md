# 0094. New game screen with choice cards and games kept in memory until the save system

- Status: Accepted
- Date: 2026-11-19
- Supersedes: [0081](0081-label-tape-and-patch-cables-as-the-visual-world.md) (only the uses of
  fibre orange)

## Context

ROADMAP M3.2b adds the new game screen between an empty save slot and the game screen. ADR 0017
fixes the game mode per save slot (Story or Sandbox), ADR 0019 lets the player type a name from
which an editable Linux user name is derived, and ADR 0093 defines the derivation and the
problem codes of the check. Open were: how the screen shows the derived name and its problems,
how the mode is chosen, what the screen does with the game before the save system (M3.7)
exists, and how the chosen mode is highlighted. ADR 0081 reserves fibre orange for the player's
prompt, cursor and active ticket. The owner wanted the mode as two large cards, the chosen card
highlighted in colour and the other one grey but still clearly clickable, chose fibre orange for
the highlight, and named the Story mode "Karriere" / "Career".

## Decision

- **Screen:** "New game" as the level 1 heading with the slot's name under it; the fields "Your
  name" and "Linux user name"; the mode choice; Start game and Back. The name field has the
  focus when the screen appears. Back and Esc return to the save slot screen with the focus on
  the slot the player came from. Enter in a field starts the game (a form submit).
- **Player name:** `normalizePlayerName` (`packages/gameplay/src/new-game.ts`) keeps it in NFC
  without outer white space and with single spaces inside; `checkPlayerName` reports `empty` or
  `too-long` (more than 40 characters, `PLAYER_NAME_MAX_LENGTH`, so it fits on a slot). The
  name is shown as typed, never read as markup.
- **User name:** while the player types their name, `deriveUserName` fills the user name. Once
  the player edits the user name, a change of the name no longer replaces it. The field is set
  in the monospace face (the Real-Code Rule) and has a help line about what it is for.
- **Problems:** every problem code of both checks has a catalog text; `reserved` names the
  user name as code. A field's problem shows once the player has changed that field (the name
  also changes the derived user name) or has tried to start; before that the form shows none.
  The problem line is always present (empty while there is no problem), is a polite live region
  and describes its field (`aria-describedby`); the field gets `aria-invalid` and a boundary in
  the incident colour. Start is never disabled: with a problem it shows the problems and moves
  the focus to the first field that has one.
- **Mode choice:** a `fieldset` with the legend "Game mode" and two radio buttons drawn as
  cards side by side, Story first and chosen by default; arrow keys move the choice like any
  radio group. Each radio is named by its card's title ("Career", "Sandbox") and described by
  its text. A note under the cards says that the mode cannot be changed later. The internal
  mode IDs stay `story` and `sandbox` (ADR 0017); only the shown name of Story is "Career" /
  "Karriere".
- **Card look:** a card that is not chosen lies on the panel metal with muted text and a
  boundary in the new token `control-border`, and lightens on hover. The chosen card is raised,
  its text is full strength, and its 2 px frame and its marker's dot are fibre orange. A filled
  marker (a ring with a dot, like a standard radio button) shows the choice without colour.
- **Fibre orange:** besides the prompt, the cursor, the active ticket and the current step,
  fibre orange marks the player's current choice on a choice card. This replaces only the list
  of uses of fibre orange in ADR 0081; the colour still never decorates.
- **New tokens:** `--color-control-border` (`#6b737c`), the boundary of text fields and choice
  cards, with 3:1 against every surface (WCAG 1.4.11); `--border-width-control` (1 px),
  `--border-width-choice` (2 px) and `--radius-round` (the round marker). New contrast pairs:
  the control border on every surface, fibre orange on the ground and the incident colour on
  the terminal ground, each as non-text.
- **Games in memory:** Start puts the game (player name, user name, mode) into the slot and
  opens the game screen. The app root holds the three slots as React state until the save
  system (M3.7) stores them; they are gone when the app closes. A slot with a game shows "Jörg
  Müller · Career" instead of "New game" and returns to the game screen. A game cannot be
  deleted yet; that comes with the save system (M3.7).
- **Navigation state:** `Screen` in `apps/ui/src/app.tsx` becomes a union of objects, so a
  screen can carry its slot (`new-game` and `game`) or the slot to focus (`save-slots`).

## Alternatives considered

- **Radio buttons with a line of text each:** smaller and plainer, but the owner wants large
  cards that can later carry a picture of each mode.
- **Yellow tape "Chosen" on the chosen card, or a neutral white frame:** the owner chose fibre
  orange as the colour of the player's own choice; tape is for names and IDs, and a neutral
  frame is hardly a highlight.
- **A disabled Start button while a problem exists:** a disabled button cannot take the focus
  and does not say why; an enabled Start that explains the problems and moves the focus does.
- **Problems from the first moment:** the empty form would greet the player with two errors.
- **`maxLength` on the name field:** browsers count UTF-16 code units, not characters, and cut
  the text silently; a problem text explains the limit.
- **Keep deriving after the player edited the user name:** typing in the name field would
  overwrite the player's own choice.
- **A dialog over the save slot screen:** a full screen is the pattern of the other screens
  and leaves room for the cards.

## Consequences

- The save system (M3.7) stores the `NewGame` of each slot and replaces the in-memory slots;
  the slot screen then also needs a way to delete a game.
- The terminal (M3.3) can take the user name from the slot's game for the prompt.
- Pictures or symbols on the mode cards (a trainee badge, a sandbox) are an idea in the
  ROADMAP; the card layout leaves room for them.
- `DESIGN.md` lists the new token and the new use of fibre orange.
