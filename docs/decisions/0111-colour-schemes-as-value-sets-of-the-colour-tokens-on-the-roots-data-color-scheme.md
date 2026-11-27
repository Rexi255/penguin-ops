# 0111. Colour schemes as value sets of the colour tokens on the root's data-color-scheme

- Status: Accepted
- Date: 2026-11-27
- Supersedes: –

## Context

ADR 0020 asks for selectable colour schemes besides the default one: retro CRT, Solarized and high
contrast. The design tokens of ADR 0082 name what a colour is for, never what it looks like, so
that a scheme only swaps the values; `token-contrast.ts` lists every text and background pair
that must meet WCAG AA. The settings format of ADR 0108 has the setting `colorScheme` with these
four values, and ADR 0110 left the scheme choice out of the settings until it takes effect
(ROADMAP M3.9). "Reduce motion" is already an attribute of the root element that tokens.css reads.

Solarized is Ethan Schoonover's palette under the MIT license. Its accent colours have about
3:1 to 4:1 contrast on its own dark surfaces, and its body text colour base0 has less than 4.5:1
on base02, so the original values do not meet WCAG AA as the game uses them.

## Decision

- **A scheme is one rule in tokens.css.** `:root[data-color-scheme="<scheme>"]` redefines every
  colour token and nothing else; the default scheme is the `:root` rule itself and has no rule of
  its own. The game sets the attribute from the setting before the page is painted, like the font
  size and "reduce motion" (ADR 0110). Components keep reading only the tokens.
- **Every scheme passes the same contrast pairs.** The design token test checks every pair of
  `token-contrast.ts` in every scheme, and that every scheme's rule defines exactly the colour
  tokens of the default scheme.
- **High contrast asks for more.** Its text pairs need 7:1 (WCAG AAA, 1.4.6), and its dividers
  (`--color-rule`), decorative elsewhere, need 3:1 on every surface.
- **Retro CRT** is green phosphor on dark glass with amber as the player's colour; the four
  cables keep four hues, so that the kinds of work stay apart.
- **Solarized is the dark variant**, since the game's world is dark (ADR 0020). Its surfaces are
  base03 and base02. Accents keep their hue and are lightened until they meet WCAG AA; body text
  is base2 and secondary text base1. The prompt keeps the original green and blue, which pass on
  the terminal's surface. The palette is credited in THIRD-PARTY-LICENSES.md.
- **The settings offer the four schemes** as a group of choice cards between the display settings
  and "reduce motion"; a choice applies at once and is written to the settings file.
- **The styleguide page has a scheme switch** that sets the same attribute, so that every token,
  swatch and contrast pair can be seen and is tested in every scheme.
- The scheme names are translated, except "Solarized", which is a name.

## Alternatives considered

- **A stylesheet per scheme, loaded on demand:** the same values in more files, and the design
  token test would have to find and read every file; one rule per scheme keeps the values next to
  the defaults.
- **Solarized with its original values:** it would fail WCAG AA on most accent pairs, which the
  UI rules forbid in every scheme.
- **Solarized light:** a light scheme would be a new direction for the dark world of ADR 0020 and
  needs its own design pass; it can follow later as a scheme of its own.
- **A monochrome retro CRT with green cables:** the four kinds of work would differ only by their
  icons and texts; keeping four hues is closer to the default scheme's rules.
- **The system's high contrast mode (`forced-colors`) only:** Windows players who do not use it
  would have no high contrast choice, and the game's tape and cable colours would be replaced by
  system colours.

## Consequences

- A new colour token must get a value in every scheme rule; the design token test fails until it
  has one.
- The screenshot tests of M3.15 cover every scheme.
- The effects of M3.9b (glow and scanlines) may use scheme-specific values only through new
  colour tokens.
