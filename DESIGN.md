---
name: PenguinOps
description: The IT office labelled the way admins label it, with label-maker tape and patch cable colours.
---

<!-- SEED: established with the user before implementation; re-run /impeccable document once there's code to capture the actual tokens and components. -->

# Design System: PenguinOps

This is a seed. The owner chose the visual world on 2026-11-18 from four directions (ROADMAP
M3.0b, ADR 0081). Exact tokens follow in M3.0b part 2 and replace the provisional values below;
typography follows in M3.0d and icons in M3.0e. Product truth lives in `PRODUCT.md`; the
workplace screen's direction contract lives in `apps/ui/.impeccable/surfaces/src-app-tsx.md`.

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

**Key Characteristics:**

- Dark, matte rack-metal ground with hairline rules; no glow, no gradients, no glass.
- Label tape (yellow and white, black condensed caps) for ticket IDs, panel names, the rank and
  toasts.
- Cable colours carry the kind of work: tickets, mail, handbook, incidents.
- Fibre orange belongs to the player: their prompt, cursor and active ticket.
- One grid: every size is a multiple of the terminal's character cell.

## Colors

A restrained neutral ground with a full set of meaningful cable colours; colour always means
something.

The values below come from the chosen sketch and are provisional until the design tokens of
M3.0b part 2 check them for WCAG AA contrast and name them as semantic tokens.

### Primary

- **Fibre Orange** (sketch: #e0701a, the logo's prompt orange): the player's own colour. Only the
  shell prompt, the cursor, the outline of the active ticket and the current step.

### Secondary

- **Label Tape Yellow** (sketch: #f2c230) with **Tape Ink** (sketch: #141414): printed tape for
  ticket IDs, the product name and highlights such as XP segments.
- **Label Tape White** (sketch: #f1ede4) with Tape Ink: secondary tape, such as the rank and
  waiting tickets.

### Tertiary

The cable colours, one per kind of work. They appear as a 3 px cable run on tabs, as tape
colour for typed toasts, and as state colour. Never as large fills.

- **Ticket Cable Blue** (sketch: #2f7fd6): tickets.
- **Mail Cable Violet** (sketch: #8a63d2): mail.
- **Handbook Cable Green** (sketch: #3fa35a): the handbook and success.
- **Incident Cable Red** (sketch: #d8453b): incidents and real errors.

### Neutral

- **Rack Black** (sketch: #16191d): the page ground.
- **Panel Metal** (sketch: #1d2126) and **Raised Metal** (sketch: #23282e): panels and the
  active row.
- **Rule** (sketch: #2e343b): hairline dividers.
- **Terminal Ground** (sketch: #0f1114): the terminal, one step darker than the ground.
- **Paper Text** (sketch: #e8e6e1) and **Muted Text** (sketch: #a3a8ae): body and secondary text.

### Named Rules

**The Quarantine Rule.** Colour lives only on tape and cable runs. Grounds, panels and text stay
neutral. If a colour appears somewhere else, it needs a meaning.

**The Fibre Rule.** Fibre orange marks only what the player is doing right now. It never
decorates.

**The Scheme Rule.** Every colour is a semantic token, so the colour schemes of ROADMAP M3.9
(retro CRT, Solarized, high contrast) only swap values and never require a screen change.

## Typography

**Display/Tape Font:** a condensed grotesque in bold caps for tape strips [to be resolved in
M3.0d; the sketch used Barlow Condensed].
**Body Font:** a workhorse UI sans [to be resolved in M3.0d; ADR 0020 names Inter].
**Mono Font:** a code monospace for the terminal, file names and commands [to be resolved in
M3.0d; ADR 0020 names JetBrains Mono].

**Character:** The tape face is loud but small, like a real label; the UI face stays quiet and
readable; the mono face is reserved for real code and terminal output.

### Named Rules

**The Real-Code Rule.** Monospace only for terminal output, commands, paths and file names,
never as a "technical" costume for labels or headings.

**The Label Rule.** Tape type is set in caps and only on tape. Running text is never in caps.

## Layout

The workplace layout of ADR 0020: a top bar, a side panel of about 430 px with tabs, the
terminal filling the rest, and a footer with F-key hints. The top bar names where the player is
(chapter, ticket, step), like the guide words at the head of a dictionary page.

Every size and gap snaps to the terminal's character cell (width and line height of the mono
face at the terminal size), so the panels and the terminal share one grid. Density is medium:
rows of about 40 px, generous space between groups, tight space within them.

## Elevation & Depth

Flat. Depth comes from tonal steps of the rack-metal neutrals (ground, panel, raised panel,
terminal) and hairline rules, not from shadows. Only floating elements that cover other content
(toasts, menus, dialogs) get a soft, offset shadow.

### Named Rules

**The Flat Rack Rule.** Panels sit flush like units in a rack. No card shadows, no glow, no
nested cards.

## Shapes

Nearly square corners (2 px) on panels, rows, buttons and keys. Tape strips have slightly
slanted cut ends, like a real strip from a label maker. Progress (XP, ticket steps) is drawn as
tape segments whose number and length are the exact count, never as rings or smooth bars.

## Do's and Don'ts

### Do:

- **Do** print ticket IDs, the product name, the rank and toast titles on tape.
- **Do** give each kind of work its cable colour, consistently, on tabs, toasts and states.
- **Do** keep fibre orange for the player's prompt, cursor and active ticket only.
- **Do** let the one motion be the tape printing out, and show it at once when "reduce motion"
  is on.
- **Do** keep every control a standard, recognisable one: tabs, buttons, lists, inputs.

### Don't:

- **Don't** use the hacker cliché: green on black, matrix rain, neon glow, scanlines as the
  default look (scanlines stay an optional effect, ADR 0020).
- **Don't** fall back to the category standard of charcoal rounded cards with one blue accent.
- **Don't** put tape on running text, buttons or every row; tape is for names and IDs.
- **Don't** use gradients, glass, glow or hard offset shadows.
- **Don't** convey a state by colour alone; every cable colour comes with a label or icon.
