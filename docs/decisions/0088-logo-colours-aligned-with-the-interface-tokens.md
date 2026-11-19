# 0088. Logo colours aligned with the interface tokens

- Status: Accepted
- Date: 2026-11-19
- Supersedes: [0040](0040-logo-and-app-icon-taken-over-before-the-design-tokens.md) (only the logo
  colours)

## Context

The owner's brand package was taken over before the design tokens existed (ADR 0040). Its three
colours were marked as provisional until ROADMAP M3.0f aligns them with the tokens of M3.0b:

| Logo colour | Hex | Nearest token |
|---|---|---|
| Black (body, text on light backgrounds) | `#0d1117` | `surface-terminal` `#0f1114` |
| White (belly, eye, outline, text on dark backgrounds) | `#ffffff` | `text` `#e8e6e1` |
| Orange (the prompt `>_`) | `#e0701a` | `player` `#e0701a` |

The orange is already the token `player`, which `DESIGN.md` describes as "the logo's prompt
orange". The black is GitHub's dark background, and pure white appears nowhere in the interface,
whose brightest text is `text` `#e8e6e1`.

M3.0f-2 was split like M3.0d and M3.0e: the choice (M3.0f-2a, this record) and the build
(M3.0f-2b). For the choice, the horizontal logo and the signet at 16, 24, 32 and 48 px were
recoloured into three variants and rendered on the four surface tokens and on two light
backgrounds (pure white as on GitHub's light theme, and `tape-secondary`), at 2x and at 1x:

| Variant | Black | White | Contrast outline / body | Contrast white / `surface-ground` |
|---|---|---|---|---|
| A: unchanged | `#0d1117` | `#ffffff` | 18.9:1 | 17.6:1 |
| B: interface tokens | `#0f1114` (`surface-terminal`) | `#e8e6e1` (`text`) | 15.2:1 | 14.1:1 |
| C: label tape tokens | `#141414` (`tape-ink`) | `#f1ede4` (`tape-secondary`) | 15.8:1 | 15.1:1 |

The prompt orange keeps a contrast of at least 5.7:1 on the body in every variant.

## Decision

- The logo uses variant B: black is `#0f1114` (the token `surface-terminal`), white is `#e8e6e1`
  (the token `text`), and orange stays `#e0701a` (the token `player`).
- The values are copied into the brand files, not referenced: the SVGs, the web icons and the
  app icons carry the hex values above, because they are used outside the app (README, installer,
  desktop) where the tokens do not exist. A raster file that has a background in the old black
  (`apple-touch-icon.png`, `social-preview.png`) gets `#0f1114` as its background.
- The mono variants keep pure `#ffffff` and `#000000`: they are meant for single-colour use, not
  for the interface.
- The logo does not follow the colour schemes of M3.9. Its colours are fixed brand values that
  were taken from the default dark scheme once.
- M3.0f-2b regenerates all colour brand files and app icons together (ADR 0040), updates
  `assets/brand/README.md` and the colour list of `scripts/brand-assets.test.ts`, and shows the
  logo in the styleguide. How the raster files are regenerated is decided there.

## Alternatives considered

- **A: keep the colours unchanged:** the logo would stay independent artwork and nothing would
  have to be regenerated, but the pure white wordmark is brighter than every text in the
  interface, and the start screen of M3.1 would show two different whites side by side.
- **C: label tape tokens:** ties the logo to the tape world, but the warm white of the tape is
  meant for the tape as an object; on the dark surfaces the wordmark would no longer match the
  interface text, and the tape ink is lighter than the terminal surface.

## Consequences

- The wordmark on the start screen and in the styleguide matches the interface text exactly; the
  logo body matches the terminal surface.
- The contrasts drop slightly (outline on body from 18.9:1 to 15.2:1) but stay far above every
  WCAG threshold, also for the app icon at 16 px.
- If the default dark scheme's `text` or `surface-terminal` token changes later, the logo does
  not change with it; a new decision record is needed to realign it.
- M3.0f-2b has to regenerate the five colour SVGs in `assets/brand/svg/`, the four files in
  `assets/brand/web/` and the eleven app icon files in `apps/desktop/build/`; the six mono SVGs
  stay as they are.
