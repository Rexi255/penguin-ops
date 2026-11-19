# 0082. Semantic design tokens in CSS custom properties with a WCAG AA contrast test

- Status: Accepted
- Date: 2026-11-19
- Supersedes: –

## Context

ADR 0039 builds the design language before the game frame screens, and ADR 0081 chose the
visual world "Label Tape & Patch Cable". The seed `DESIGN.md` listed the colours of the chosen
sketch as provisional until ROADMAP M3.0b part 2 checks their contrast and names them as tokens.
ADR 0020 requires selectable colour schemes (default, retro CRT, Solarized, high contrast), and
the UI rules require WCAG AA contrast in every scheme and no ad-hoc colours. `apps/ui` had only
four placeholder variables in `styles.css`.

Measured against WCAG 2.2, the sketch colours passed as text on every surface except three of
the four cable colours: ticket blue (3.63:1 on the raised surface), mail violet (3.39:1) and
incident red (3.42:1) were too dark to serve as state text, and mail violet (4.21:1) and incident
red (4.24:1) were too dark as tape under black tape ink.

## Decision

- **Where:** the design tokens are CSS custom properties on `:root` in
  `apps/ui/src/tokens.css`, imported before `styles.css`. Screens and components use only these
  variables; they never write a colour of their own and never define tokens.
- **Names:** every token is named by its purpose, never by its look (`--color-player`, not
  `--orange`). There is one layer of semantic tokens and no separate palette layer: a colour
  scheme of ROADMAP M3.9 redefines the same variables with its own values.
- **Groups:**
  - Colours (`--color-*`), written as `#rrggbb`: the surfaces ground, panel, raised, terminal
    and selection; the rule; text and muted text; the player's colour (fibre orange); the focus
    ring; primary and secondary tape and tape ink; one cable colour each for tickets, mail, the
    handbook and incidents.
  - The terminal's character cell (`--cell-block`, `--cell-inline`) and spacing in quarter
    steps of the cell's height (`--space-1` to `--space-8`), so that every gap lines up with
    the terminal's lines. Until M3.0d settles the type scale, the cell is 1.5rem by 0.6rem.
  - One corner radius (2 px), line widths (rule, cable run, focus ring), one shadow for floating
    elements only, and motion: the tape print (480 ms, linear) and state changes (120 ms,
    exponential ease-out). With `prefers-reduced-motion: reduce`, every duration is 0 ms; the
    game's own setting follows in M3.8.
  - The two font stacks stay as they were until M3.0d.
- **Colour changes against the sketch:** ticket blue becomes `#4392ea`, mail violet `#a17aec`
  and incident red `#f35e51`; each was lightened in OKLCH with its hue and chroma kept, to about
  the lightness of handbook green, which already passed. All four cable colours now have about
  the same lightness, so no kind of work looks louder than another. Every other sketch colour,
  including the logo's fibre orange `#e0701a`, is kept. Selected text gets its own surface
  `#353d47`.
- **Contrast pairs:** `apps/ui/src/token-contrast.ts` lists every pair of a foreground and a
  background token with its use: "text" needs 4.5:1 (WCAG 1.4.3), "non-text" needs 3:1 (WCAG
  1.4.11). The ratio is compared unrounded. Text and muted text are checked on every surface,
  fibre orange on the terminal and the side panel, every cable colour on the ground, panel and
  raised surfaces and under tape ink, tape ink on both tapes, and the focus ring on every
  surface. The rule is the only colour without a minimum, because it is decorative.
- **Tests:** `apps/ui/src/design-tokens.test.ts` reads `tokens.css` and `styles.css` with Vite's
  `?raw` imports (ESLint keeps Node APIs out of `apps/ui`, tests included) and checks that every
  pair passes, that every colour token is in a pair or listed as decorative, that the
  stylesheets read only defined tokens, that no declaration outside the token definitions writes
  a hex value, a colour function or a named colour, that `styles.css` defines no tokens and that
  reduce motion sets every duration to 0 ms. A small reader for the project's own stylesheets
  (`css-rules.ts`) supports the test; it is not a general CSS parser.
- `apps/ui` is split into `tsconfig.lib.json` (renderer code) and `tsconfig.test.json` (tests
  with Node types), like the other workspaces (ADR 0030), and has its own Vitest project, which
  processes CSS so that `?raw` imports return the file content.
- `DESIGN.md` is regenerated from the tokens with `/impeccable document`; its frontmatter carries
  the token values, and `apps/ui/.impeccable/design.json` carries what the frontmatter cannot
  hold (shadow, motion and the narrative).

## Alternatives considered

- **Tokens in a TypeScript module that generates the CSS:** the values would be easy to import in
  tests, but the build would need a generation step and the CSS would no longer be the single
  source that impeccable and the browser read.
- **A palette layer under the semantic tokens (`--orange-500` and `--color-player:
  var(--orange-500)`):** a common pattern, but every scheme would have to redefine both layers or
  break the mapping; with one layer, a scheme is one list of values.
- **Keeping the sketch colours and using the cable colours only as 3 px runs:** they pass 3:1 as
  non-text, but `DESIGN.md` also uses them as state colour and as toast tape, where they are text
  or carry text.
- **Darkening the tape ink or lightening only the failing pairs' backgrounds:** the ink is already
  close to black, and lighter surfaces would weaken the rack-metal ground the world is built on.
- **Spacing in plain pixels (4 px or 8 px steps):** familiar, but it would not follow the
  terminal's character cell that `DESIGN.md` makes the one grid.
- **Reading the stylesheets with `node:fs` in the test:** the package boundary rules forbid Node
  APIs in `apps/ui`, tests included; an exception would weaken a lint rule.

## Consequences

- Screens and components of M3 are built only from these tokens; the test catches ad-hoc colours
  and undefined variables.
- The colour schemes of M3.9 must define every colour token and pass the same contrast pairs; the
  test then runs once per scheme.
- M3.0d replaces the cell size and adds type scale tokens; the spacing follows the cell
  automatically.
- M3.0f-2 aligns the logo with the tokens; fibre orange is unchanged, so only the other logo
  colours may need to move.
- A new colour token needs a contrast pair or a reason to be decorative, or the test fails.
- Whether the player's font size setting (M3.8) scales the cell for the whole interface or only
  for the terminal is decided in M3.8.
