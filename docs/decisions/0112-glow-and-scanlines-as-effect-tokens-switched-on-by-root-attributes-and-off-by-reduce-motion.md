# 0112. Glow and scanlines as effect tokens switched on by root attributes and off by reduce motion

- Status: Accepted
- Date: 2026-11-27
- Supersedes: –

## Context

ADR 0020 asks for two optional effects, glow and scanlines, and for "reduce motion" to turn
animations and effects off. The settings format of ADR 0108 already has `effects.glow` and
`effects.scanlines`, both off by default, and ADR 0110 left them out of the settings screen until
they take effect (ROADMAP M3.9b). "Reduce motion" and the colour scheme are attributes of the root
element that tokens.css reads (ADR 0110, ADR 0111); ADR 0111 allows the effects scheme-specific
values only through new colour tokens. DESIGN.md keeps scanlines and glow out of the default look.

A glow lights the ground around the text, and stripes behind the text change its ground, so both
lower the contrast that the UI rules require in every scheme. A glow in the text's own colour at
full strength lowers the contrast of the dimmer terminal colours below WCAG AA: Solarized's prompt
blue has 4.56:1 on its terminal and falls below 4.5:1 with any glow at all.

## Decision

- **Two effect tokens.** `--effect-glow` (a text shadow) and `--effect-scanlines` (a background
  image) are `none` on `:root`. The root's `data-glow="on"` and `data-scanlines="on"` turn them
  on, each with one rule in tokens.css that sets only its own token. The game sets both attributes
  to `on` or `off` from the settings before the page is painted, like the other page settings.
- **Reduce motion turns them off.** The two rules of "reduce motion" (`data-reduce-motion="on"`,
  and the system's setting unless the game's is `off`) set both effect tokens to `none` besides
  the motion durations. They come after the effect rules in tokens.css, so that they win.
- **The effects are only in the terminal.** `.terminal` reads both tokens.
- **The glow** is one soft shadow in the text's own colour, `0 0 0.375rem` at 60 percent opacity
  (`color-mix` with `currentColor`). It lights only the terminal's text colour: the prompt's
  colours, the game's notices, the character under the filled cursor and selected text set no
  shadow, because they would fall below their minimum.
- **The glow's contrast is checked against a measured bound.** At its brightest point, between
  the strokes of dense characters such as `#` and `@`, the blurred shadow covers the ground with
  about 41 percent of its colour (measured in Chromium). `GLOW_PEAK_COVERAGE` in token-contrast.ts
  is 0.45. The design token test checks, in every scheme and with its minimum, the terminal's text
  on the terminal and on the scanlines with that ground lit by the text colour at the glow's
  opacity times `GLOW_PEAK_COVERAGE`. The styleguide's browser test measures the real glow around
  dense characters and fails if any pixel of the ground is lit more than that.
- **The scanlines** are stripes of the new colour token `--color-terminal-scanline`, 0.125rem high
  every 0.25rem (six to a terminal line), behind the text; they stay in place while the text
  scrolls. Every colour shown on the terminal (text, notices, prompt, the cursor's frame) has a
  contrast pair on the stripes. The default, Retro CRT and High contrast schemes draw lighter
  stripes than their terminal; Solarized draws darker ones, because its prompt has no room for a
  lighter ground.
- **The settings** offer both effects as switches in a group "Effects" between the colour scheme
  and "reduce motion", with a help line that says they are only in the terminal and that "reduce
  motion" turns them off, also when the system asks for it. The switches keep their state while
  "reduce motion" hides the effects.
- **The styleguide** has an Effects section with the two switches and a few terminal lines drawn
  with the game's own classes.

## Alternatives considered

- **Effects through selectors in styles.css (`:root[data-glow="on"] .terminal`):** the logic of
  "reduce motion" would be split between tokens.css and styles.css, and the design token test
  could not check that "reduce motion" turns every effect off.
- **A glow on every colour of the terminal:** the prompt in Solarized fails WCAG AA with any glow,
  and the notices and the cursor lose contrast too.
- **A weaker glow for every colour:** even at a tenth of the strength, Solarized's prompt fails;
  a glow weak enough for every colour would hardly be seen.
- **Checking the glow against its full opacity:** the shadow never reaches its full opacity on the
  ground next to a character; that bound would rule out every visible glow.
- **Scanlines as dark stripes over the text:** they would darken the characters themselves, which
  the contrast pairs cannot describe.
- **Darker terminal grounds or a lighter prompt in Solarized:** they would change the scheme of
  ADR 0111 for an optional effect.
- **Disabling the switches while "reduce motion" is in effect:** the form would need the system's
  setting, and the player's choice would be hidden; the help line explains it instead.

## Consequences

- A new colour shown in the terminal needs a contrast pair on `--color-terminal-scanline`; a new
  element of the terminal in another colour than its text needs `text-shadow: none` or a glow pair.
- Changing the glow's blur needs a new measurement of `GLOW_PEAK_COVERAGE`; the browser test fails
  if the bound no longer holds.
- The settings form grows by one group; the screenshot tests of M3.15 should cover both effects.
- DESIGN.md's default look stays flat: glow and scanlines are optional and off by default.
