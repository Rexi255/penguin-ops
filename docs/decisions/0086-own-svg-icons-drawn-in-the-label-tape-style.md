# 0086. Own SVG icons drawn in the label tape style

- Status: Accepted
- Date: 2026-11-19
- Supersedes: –

## Context

ROADMAP M3.0e asks for an icon style: rules for grid, stroke and corners, a choice between an
icon set with an allowed license and own SVG icons, and the first icons for the side panel tabs.
The visual world "Label Tape & Patch Cable" (ADR 0081) asks for icons that fit the tape and cable
world, and `DESIGN.md` requires that no state is conveyed by colour alone, so every cable colour
comes with a label or an icon.

Constraints:

- Icons must be under a license that `license-policy.json` and ADR 0005 allow, and they ship
  offline with the app.
- The owner plays on Windows, most likely at 100 % display scaling, so icons must stay sharp at
  one device pixel per CSS pixel.
- Every size snaps to the terminal's character cell (`--cell-block`, 24 px at the default size).
- Corners are nearly square (`--radius-corner`, 2 px); lines are 1 px rules, 3 px cable runs and
  the 2 px focus ring.

M3.0e was split into the choice (M3.0e-1, this record) and the build (M3.0e-2), like M3.0d. For
the choice, 14 icons the game needs (ticket, mail, handbook, incident, hint, solved, settings,
terminal, network map, server, user, locked, folder, close) were compared from four candidates,
rendered with the real tokens and fonts on a specimen page, in a mock-up of the side panel and
as a 1x capture enlarged three times:

| Candidate | License | Icons | Style |
|---|---|---|---|
| Lucide 1.70 | ISC, partly MIT | 2322 | 24 grid, 2 px, round caps and joins |
| Phosphor 2.1 | MIT | 1512 × 6 weights | 256 grid, 1.5 or 2.25 px at 24 px, round |
| IBM Carbon 11.92 | Apache-2.0 | 2646 | 32 grid, filled outlines, square |
| Own drafts | MIT (PenguinOps) | 14 | 24 grid, 2 px, square caps, miter joins |

Lucide's icons derived from Feather are under MIT; Phosphor was compared in Regular and Bold.

The 1x capture showed every candidate blurred at 18 px and the own drafts the sharpest at 24 px,
because their strokes sit on whole pixels.

## Decision

PenguinOps draws its own icons; it uses no third-party icon set. The owner chose them from the
comparison. The icons follow these rules, which `DESIGN.md` states as the icon style:

- **Grid:** each icon is one SVG with `viewBox="0 0 24 24"`, drawn on whole-pixel coordinates so
  that a 2 px stroke covers whole pixels at 100 % scaling. Strokes and miter tips stay at least
  1 unit inside the edge.
- **Size:** icons are shown at one cell (`--cell-block`, 24 px at the default size) and never at
  fractions of a cell, because smaller sizes blur at 100 % scaling.
- **Stroke:** outlines only, 2 units wide, `stroke="currentColor"`, `fill="none"`. A dot (the
  point of "!" or a status light) is a 2 × 2 butt-capped stroke, not a fill.
- **Corners:** square line caps and miter joins, matching the nearly square corners of the
  interface. Arcs only where the object itself is round (bulb, head, padlock shackle).
- **Metaphors from the world:** where the office has its own object, the icon draws it: a
  ticket is a strip of label tape with slanted cut ends, the handbook is a ring binder with a
  spine label, the terminal shows a prompt.
- **Colour:** icons take the colour of their text (`currentColor`). Under the Quarantine Rule an
  icon may take its cable colour only where it marks a kind of work or a state (a ticket row's
  kind, a solved ticket), never as decoration.
- **Never alone:** an icon always stands next to a visible text label, or its control has an
  accessible name; icons themselves are `aria-hidden`.
- **New icons:** drawn by Claude Code under these rules and shown to the owner in the styleguide
  before a screen uses them.

ROADMAP M3.0e-2 turns the drafts into the icon files with tests of these rules and shows them in
the styleguide. The drafts the owner chose from, as path data on the 24 grid (stroke 2, square
caps, miter joins; `butt` marks a butt-capped dot):

```text
ticket    M6 6h16l-4 12H2z  M8 12h7
mail      M3 5h18v14H3z  M3 7l9 6 9-6
handbook  M4 3h16v18H4z  M9 3v18  M13 8h4
incident  M12 4l9 16H3z  M12 9v3  butt: M12 15.5v2
hint      M9 17v-3a6 6 0 1 1 6 0v3z  M10 21h4
solved    M4 12l5 5L20 6
settings  M4 6h16M4 12h16M4 18h16  M8 4v4M16 10v4M11 16v4
terminal  M2 4h20v16H2z  M6 9l3 3-3 3  M12 15h5
network   M10 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z  M12 7v5M5 17v-5h14v5
server    M3 4h18v7H3zM3 13h18v7H3z  butt: M6 6.5v2M6 15.5v2  M11 7.5h7M11 16.5h7
user      circle 12 8 r4  M4 21v-5h16v5
lock      M4 11h16v10H4z  M8 11V7a4 4 0 0 1 8 0v4  M12 15v2
folder    M3 5h6l2 2h10v12H3z
close     M6 6l12 12M18 6L6 18
```

## Alternatives considered

- **Lucide:** the recommendation of the comparison: the same 2 px stroke, the largest actively
  maintained set and many IT icons for later levels (server, router, cable, plug). Its round caps
  and joins are the familiar look of many apps and do not carry the tape and cable world; the
  owner preferred a look of the game's own.
- **Phosphor:** six weights, and Bold fits the 2 px lines well. Regular is thin at 24 px, and the
  last release is from March 2024.
- **IBM Carbon:** square and technical, but uneven for this game (the server icon carries a
  globe, the network map looks like a molecule), designed on a 32 grid, and its npm package
  depends on IBM's telemetry library.
- **Lucide with own icons for the world's objects:** mixing round and square caps would look
  inconsistent, and the rules would have to allow two styles.

## Consequences

- No icon dependency and no third-party icon license: the icons are MIT as part of PenguinOps
  and need no row in `THIRD-PARTY-LICENSES.md`.
- Every new icon costs drawing and review work. Levels that need a new object (router, cable,
  printer) bring a new icon with them, drawn under these rules.
- The ticket as a tape strip is less obvious than the classic ticket stub; it is always shown
  with its text label, and M3.0e-2 checks it again in the styleguide.
- Icons are shown at one cell only; places that need something smaller (the 13 px key hints of
  the footer) use text instead of icons.
- When the font size setting of ROADMAP M3.8 changes the cell, icons scale with it and may lose
  some sharpness at sizes other than 24 px.
- ROADMAP M3.0e-2 adds the icon files, tests of the rules (view box, stroke, caps, joins,
  `currentColor`), the first icons for the side panel tabs and a styleguide section.
