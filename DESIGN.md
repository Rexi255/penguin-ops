---
name: PenguinOps
description: The IT office labelled the way admins label it, with label-maker tape and patch cable colours.
colors:
  surface-ground: "#16191d"
  surface-panel: "#1d2126"
  surface-raised: "#23282e"
  surface-terminal: "#0f1114"
  surface-selection: "#353d47"
  rule: "#2e343b"
  control-border: "#6b737c"
  text: "#e8e6e1"
  text-muted: "#a3a8ae"
  player: "#e0701a"
  prompt-user: "#8ae234"
  prompt-directory: "#729fcf"
  terminal-cursor: "#e8e6e1"
  terminal-scanline: "#1b1e24"
  focus: "#e8e6e1"
  tape-primary: "#f2c230"
  tape-secondary: "#f1ede4"
  tape-ink: "#141414"
  cable-ticket: "#4392ea"
  cable-mail: "#a17aec"
  cable-handbook: "#3fa35a"
  cable-incident: "#f35e51"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: "3rem"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: "2.25rem"
  heading:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.5rem"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  hint:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: "1.125rem"
  terminal:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  tape:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: "1.125rem"
    letterSpacing: "0.04em"
rounded:
  corner: "2px"
spacing:
  "1": "6px"
  "2": "12px"
  "3": "18px"
  "4": "24px"
  "6": "36px"
  "8": "48px"
---

# Design System: PenguinOps

The tokens live in `apps/ui/src/tokens.css` as CSS custom properties (ADR 0082); the frontmatter
above mirrors their default values. Product truth lives in `PRODUCT.md`; the workplace screen's
direction contract lives in `apps/ui/.impeccable/surfaces/src-app-tsx.md`. The typefaces
(ADR 0084) are bundled with the app and the type scale is in the tokens (ADR 0085). The icons are
the game's own, drawn under the icon rules below (ADR 0086).

## Overview

**Creative North Star: "Label Tape & Patch Cable"**

PenguinOps looks like the IT department it is set in. Admins label everything: switch ports,
cables, servers, shelves, with printed label-maker tape, and they sort cables by colour so that
anyone can see what a line is for. The game takes exactly these two habits as its visual
system. Names and IDs that matter are printed on tape; each kind of work has its own cable
colour; everything else is matte rack metal that stays quiet so the terminal can be the main
stage.

The world lends the interface four things only: palette, type, density and one signature move.
Layout, navigation and controls stay the familiar ones of a modern desktop game (ADR 0020): a
top bar, a side panel with tabs, a large terminal and a key-hint footer. Someone who has played
any coding game knows where everything is before they notice the tape.

The signature move: new tickets, mails, ranks and achievements print out as a strip of tape.
It is the only thing that moves on its own.

**The One Motion Rule.** The tape strip prints out at the steady speed of a label maker (480 ms,
linear). State changes on hover, focus and press answer within 120 ms with an exponential
ease-out. Nothing else moves, and "reduce motion" sets both to zero.

**Key Characteristics:**

- Dark, matte rack-metal ground with hairline rules; no glow, no gradients, no glass.
- Label tape (yellow and white, black condensed caps) for ticket IDs, panel names, the rank and
  toasts.
- Cable colours carry the kind of work: tickets, mail, handbook, incidents.
- Fibre orange belongs to the player: their active ticket and current step.
- The terminal's prompt and cursor keep Debian's colours, so it looks like the real system.
- One grid: every size is a multiple of the terminal's character cell.

## Colors

A restrained neutral ground with a full set of meaningful cable colours; colour always means
something. Every text and background pair meets WCAG AA (4.5:1 for text, 3:1 for the focus
ring), and a test proves it for every pair (ADR 0082).

### Primary

- **Fibre Orange** (`player`): the player's own colour, the logo's prompt orange. Only the
  outline of the active ticket, the current step and the frame of the player's choice on a
  choice card (ADR 0094, ADR 0095, ADR 0101).

### Secondary

- **Label Tape Yellow** (`tape-primary`) with **Tape Ink** (`tape-ink`): printed tape for ticket
  IDs, the product name and highlights such as XP segments.
- **Label Tape White** (`tape-secondary`) with Tape Ink: secondary tape, such as the rank and
  waiting tickets.

### Tertiary

The cable colours, one per kind of work. They appear as a 3 px cable run on tabs, as the tape of
typed toasts (with tape ink) and as state text. Never as large fills. All four share about the
same lightness, so no kind of work looks louder than another, and each one is readable as text
on every surface.

- **Ticket Cable Blue** (`cable-ticket`): tickets.
- **Mail Cable Violet** (`cable-mail`): mail.
- **Handbook Cable Green** (`cable-handbook`): the handbook and success.
- **Incident Cable Red** (`cable-incident`): incidents and real errors.

### Terminal

The prompt keeps the colours of Debian's `/etc/skel/.bashrc`, because the terminal shows the real
system (ADR 0095). They appear nowhere else.

- **Prompt Green** (`prompt-user`): `user@host` in the prompt, bold.
- **Prompt Blue** (`prompt-directory`): the working directory in the prompt, bold.

Both are the bright Tango colours that GNOME Terminal shows for bold text; Tango's plain blue
would not meet 4.5:1 on the terminal ground.

- **Terminal Cursor** (`terminal-cursor`): the block cursor in the terminal's text colour, with
  the character under it in the terminal ground's colour, as GNOME Terminal draws it by default
  (ADR 0101).
- **Terminal Scanline** (`terminal-scanline`): the stripes of the optional scanlines behind the
  terminal's text, lighter than the terminal ground in most schemes and darker in Solarized; every
  colour shown on the terminal meets its minimum on them (ADR 0112).

### Neutral

- **Rack Black** (`surface-ground`): the page ground, the top bar and the footer.
- **Panel Metal** (`surface-panel`) and **Raised Metal** (`surface-raised`): the side panel, and
  the active row and pressed controls.
- **Terminal Ground** (`surface-terminal`): the terminal, one step darker than the ground.
- **Selection Metal** (`surface-selection`): selected text.
- **Rule** (`rule`): hairline dividers between areas that their surfaces already tell apart. It
  is decorative and the only colour without a contrast minimum.
- **Control Boundary** (`control-border`): the boundary of text fields and choice cards and the
  ring of a choice marker, with 3:1 against every surface, because it identifies the control.
- **Paper Text** (`text`) and **Muted Text** (`text-muted`): body and secondary text.
- **Focus** (`focus`): the keyboard focus ring, neutral so that it never competes with fibre
  orange.

### Named Rules

**The Quarantine Rule.** Colour lives only on tape and cable runs, and in the terminal's prompt.
Grounds, panels and text stay neutral. If a colour appears somewhere else, it needs a meaning.

**The Fibre Rule.** Fibre orange marks only what the player is doing right now. It never
decorates.

**The Scheme Rule.** Every colour is a semantic token named by its purpose, so the colour schemes
(retro CRT, Solarized, high contrast; ADR 0111) only swap values, pass the same contrast pairs and
never require a screen change. Each scheme is one `:root[data-color-scheme]` rule in `tokens.css`
that redefines every colour token. High contrast needs 7:1 for text and visible dividers.

**The Optional Effects Rule.** Glow and scanlines (ADR 0112) are off by default, only in the
terminal, and "reduce motion" turns them off. They are effect tokens that the root's `data-glow`
and `data-scanlines` turn on. The glow lights only the terminal's text colour, and the text keeps
its contrast minimum on the ground the glow lights; the scanlines' stripes are a colour token with
contrast pairs for everything shown on the terminal.

**The Pair Rule.** A new colour token comes with the pairs it appears in, or with the reason why
it is decorative.

## Typography

**Display/Tape Font:** Barlow Condensed Bold, a condensed grotesque, in caps with slight
tracking, for tape strips only.
**Body Font:** Inter, a workhorse UI sans, for running text, headings, tabs, buttons, menus and
key hints.
**Mono Font:** JetBrains Mono for the terminal, commands, paths, file names and data, always with
ligatures turned off, so that the player sees every character they type.

All three are under the SIL OFL 1.1 and are bundled with the app as WOFF2 files in
`apps/ui/src/fonts/` (ADR 0084, ADR 0085). Weights: Inter 400 for running text, 500 for controls
and key hints, 600 for headings; JetBrains Mono 400 and 700 for bold terminal output; Barlow
Condensed 700 only.

**Scale:** one size and line height per role, in the tokens `--text-<role>-size` and
`--text-<role>-leading`. Every line height is a whole number of quarter cells (6 px), so text
lines up with the terminal's lines:

| Role | Size | Line height | Face and weight |
|---|---|---|---|
| Display: the start screen, rank-ups | 40 px | 48 px | Inter 600 |
| Title: screen titles | 28 px | 36 px | Inter 600 |
| Heading: side panel headings, ticket titles | 20 px | 24 px | Inter 600 |
| Body: running text | 16 px | 24 px | Inter 400 |
| Terminal | 16 px | 24 px, one cell | JetBrains Mono 400 |
| Tape | 15 px | 18 px | Barlow Condensed 700, caps |
| Hint: key hints, the footer, meta data | 13 px | 18 px | Inter 500 |

**Character:** The tape face is loud but small, like a real label; the UI face stays quiet and
readable; the mono face is reserved for real code, terminal output and data such as version
numbers.

### Named Rules

**The Real-Code Rule.** Monospace only for terminal output, commands, paths, file names and data,
never as a "technical" costume for labels or headings. Conversely, commands, paths and user names
are always monospace, also inside running text, because Inter draws `I` and `l` alike.

**The Label Rule.** Tape type is set in caps and only on tape. Running text is never in caps.

## Layout

The workplace layout of ADR 0020: a top bar, a side panel of about 430 px with tabs, the
terminal filling the rest, and a footer with F-key hints. The top bar names where the player is
(chapter, ticket, step), like the guide words at the head of a dictionary page.

Every size and gap snaps to the terminal's character cell: one line of terminal text (1.5rem,
24 px at the default size) by one column (0.6rem, 9.6 px). The spacing scale is quarter steps of
the line: 6, 12, 18, 24, 36 and 48 px, so gaps line up with the terminal's lines. The side panel
is 45 columns wide (432 px). Density is medium: tight space within a group (6 to 12 px), generous
space between groups (24 px) and between areas (48 px).

## Elevation & Depth

Flat. Depth comes from tonal steps of the rack-metal neutrals (terminal, ground, panel, raised)
and hairline rules, not from shadows. Only floating elements that cover other content (toasts,
menus, dialogs) get one soft, offset shadow (`0 6px 18px` of black at half opacity).

### Named Rules

**The Flat Rack Rule.** Panels sit flush like units in a rack. No card shadows, no glow, no
nested cards.

## Shapes

Nearly square corners (2 px) on panels, rows, buttons and keys. Lines come in three widths: the
1 px hairline rule, the 3 px cable run on tabs and the 2 px focus ring, set 2 px off the control.
Tape strips have slightly slanted cut ends, like a real strip from a label maker. Progress (XP,
ticket steps) is drawn as tape segments whose number and length are the exact count, never as
rings or smooth bars.

## Icons

Own outline icons, drawn for this office (ADR 0086); no third-party icon set. Where the office
has its own object, the icon draws it: a ticket is a strip of label tape with slanted cut ends,
the handbook is a ring binder with a spine label, the terminal shows a prompt.

- **Grid:** one SVG per icon, `viewBox="0 0 24 24"`, drawn on whole-pixel coordinates; strokes
  and miter tips stay at least 1 unit inside the edge.
- **Size:** one cell (`--cell-block`, 24 px at the default size), never a fraction of a cell,
  because smaller icons blur at 100 % display scaling.
- **Stroke:** outlines only, 2 units, `currentColor`, no fill. Dots are 2 × 2 butt-capped
  strokes.
- **Corners:** square caps and miter joins; arcs only where the object is round.
- **Files:** one file per icon in `apps/ui/src/icons/`, in a fixed SVG form that the `Icon`
  component draws; tests check every rule above for every file (ADR 0087). The styleguide shows
  each icon at one cell and three times enlarged on its grid.

### Named Rules

**The Labelled Icon Rule.** An icon never stands alone: it sits next to a visible text label, or
its control has an accessible name. The icon itself is hidden from screen readers.

**The Icon Colour Rule.** An icon has the colour of its text. It takes its cable colour only
where it marks a kind of work or a state, such as a ticket row's kind or a solved ticket.

## Do's and Don'ts

### Do:

- **Do** print ticket IDs, the product name, the rank and toast titles on tape.
- **Do** give each kind of work its cable colour, consistently, on tabs, toasts and states.
- **Do** keep fibre orange for the player's active ticket, current step and current choice only.
- **Do** keep Debian's prompt colours in the terminal, and only there, and draw the terminal's
  cursor in its text colour (`terminal-cursor`, ADR 0101).
- **Do** build every screen from the tokens in `apps/ui/src/tokens.css`; a missing value becomes
  a new token, not a literal.
- **Do** let the one motion be the tape printing out, and show it at once when "reduce motion"
  is on.
- **Do** keep every control a standard, recognisable one: tabs, buttons, lists, inputs.

### Don't:

- **Don't** use the hacker cliché: green on black, matrix rain, neon glow, scanlines as the
  default look (scanlines stay an optional effect, ADR 0020). The green of Debian's prompt is the
  real system's, not a costume, and stays on `user@host`.
- **Don't** fall back to the category standard of charcoal rounded cards with one blue accent.
- **Don't** put tape on running text, buttons or every row; tape is for names and IDs.
- **Don't** use gradients, glass, glow or hard offset shadows; the optional glow and scanlines of
  the terminal are the only exceptions (ADR 0112).
- **Don't** write a colour, a gap or a duration directly in a component.
- **Don't** convey a state by colour alone; every cable colour comes with a label or icon.
