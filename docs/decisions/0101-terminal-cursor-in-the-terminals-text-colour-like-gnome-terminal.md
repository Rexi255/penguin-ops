# 0101. Terminal cursor in the terminal's text colour like GNOME Terminal

- Status: Accepted
- Date: 2026-11-20
- Supersedes: [0095](0095-terminal-component-on-a-pure-terminal-model-with-debians-prompt-and-readlines-keys.md)
  (only the colour of the terminal's cursor)

## Context

ADR 0095 gave the terminal Debian's colour prompt, so that the terminal looks like the real
system, and kept fibre orange, the player's colour, on the terminal's block cursor. Next to the
Debian prompt the orange cursor was the only part of the terminal that did not look like Debian.
The owner asked for the cursor in the standard colour as well. GNOME Terminal, the terminal of
Debian's default desktop whose colours ADR 0095 follows, draws the cursor with its default cursor
colours: a block in the text colour with the character under it in the background colour.

## Decision

- **Colour.** The terminal's cursor is drawn in the new token `terminal-cursor`, which has the
  value of the terminal's text colour (`#e8e6e1`). With the focus it is a filled block, and the
  character under it has the terminal ground's colour (`surface-terminal`), as in GNOME Terminal;
  without the focus only its frame remains, as before. The token is separate from `text`, so the
  colour schemes of M3.9 can give the cursor its own colour.
- **Contrast pairs.** `surface-terminal` on `terminal-cursor` (text, the character under the
  cursor) and `terminal-cursor` on `surface-terminal` (non-text, the cursor) replace the two pairs
  of fibre orange with the terminal ground.
- **Fibre orange.** It stays the player's colour on the outline of the active ticket, the current
  step and the frame of the chosen choice card; it is no longer a colour of the terminal.
  `DESIGN.md` says so.
- **Unchanged.** The cursor still does not blink (the One Motion Rule of `DESIGN.md`), even though
  GNOME Terminal blinks it by default.

## Alternatives considered

- **Keep the fibre orange cursor:** the owner wanted the terminal to look like Debian's default
  throughout; the orange was the last part that did not.
- **The cursor in the `text` token directly:** a colour scheme could then not change the cursor
  without changing all text.
- **A blinking cursor like GNOME Terminal's default:** the One Motion Rule allows only the tape
  strip to move on its own, and a blinking cursor is distracting for some players.

## Consequences

- The terminal has no colour of the player any more; the player's colour marks the side panel and
  the choice cards only.
- The colour schemes of M3.9 have to define `terminal-cursor` and pass its contrast pairs.
- The screenshot tests of M3.15 show the cursor in the text colour.
