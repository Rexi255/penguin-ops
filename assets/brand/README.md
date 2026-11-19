# PenguinOps logo and brand

The logo was drafted by the owner with Claude in a separate chat and taken over in
[ADR 0040](../../docs/decisions/0040-logo-and-app-icon-taken-over-before-the-design-tokens.md).
It follows the rules of [ADR 0021](../../docs/decisions/0021-name-and-branding.md): an
own penguin, not Tux, and no "Linux" in the logo.

## Idea

A slim, upright penguin in profile whose beak is the `>` of a shell prompt; the cursor `_`
waits right behind it for the next input. The penguin is itself the terminal in which the
player learns, and the wordmark `Penguin>_Ops` repeats the same prompt.

## Colours

The colours are copied from the design tokens of the default dark scheme
([ADR 0088](../../docs/decisions/0088-logo-colours-aligned-with-the-interface-tokens.md)). They
are fixed brand values: the logo does not follow the colour schemes of the game.

| Name | Hex | Token | Used for |
|---|---|---|---|
| Black | `#0f1114` | `surface-terminal` | Body of the penguin, text on light backgrounds |
| White | `#e8e6e1` | `text` | Belly, eye, outline, text on dark backgrounds |
| Orange | `#e0701a` | `player` | The prompt `>_` (contrast 3.2:1 on white, 5.8:1 on `#0f1114`) |

Mono variants use pure `#ffffff` (on dark backgrounds) or `#000000` (on light backgrounds).

## Font

The wordmark is set in **Geist Mono Bold** (© The Geist Project Authors, SIL Open Font License
1.1). The text is converted to paths, so the font does not need to be installed or shipped. It
is listed in [THIRD-PARTY-LICENSES.md](../../THIRD-PARTY-LICENSES.md).

## Files

`-dark` means "for dark backgrounds", `-light` means "for light backgrounds".

| File | Purpose |
|---|---|
| `svg/logo-signet.svg` | The penguin alone, square; works on light and dark backgrounds |
| `svg/logo-signet-mono-dark.svg`, `svg/logo-signet-mono-light.svg` | Signet in white or black only |
| `svg/logo-wordmark-dark.svg`, `svg/logo-wordmark-light.svg` | Wordmark for dark or light backgrounds |
| `svg/logo-wordmark-mono-dark.svg`, `svg/logo-wordmark-mono-light.svg` | Wordmark in one colour |
| `svg/logo-horizontal-dark.svg`, `svg/logo-horizontal-light.svg` | Signet and wordmark for dark or light backgrounds |
| `svg/logo-horizontal-mono-dark.svg`, `svg/logo-horizontal-mono-light.svg` | Signet and wordmark in one colour |
| `web/favicon.svg`, `web/favicon.ico` | Favicons for a project website |
| `web/apple-touch-icon.png` | 180 px on `#0f1114` |
| `web/social-preview.png` | 1280 × 640 px, for GitHub → Settings → Social preview |

The app icons live where electron-builder reads them while packaging
(`apps/desktop/build/`, see `apps/desktop/electron-builder.config.ts`):

| File | Purpose |
|---|---|
| `apps/desktop/build/icon.ico` | Windows app, shortcut and installer icon (16–256 px, each size rasterised separately, stored as PNG) |
| `apps/desktop/build/icon.png` | 1024 px base icon |
| `apps/desktop/build/icons/NxN.png` | Linux icons from 16 to 1024 px (electron-builder naming scheme); the 256 px file is also the window icon on Linux |

## Regenerating the raster files

The colour SVGs are the only source of the logo
([ADR 0089](../../docs/decisions/0089-raster-brand-files-drawn-from-the-logo-svgs-in-chromium.md)).
Every PNG and ICO file above is drawn from them by

```bash
npm run brand:rasters
```

which renders the SVGs in Playwright's Chromium (install it once with
`npx playwright install chromium`). `scripts/brand/raster-plan.ts` lists each raster file with
its source SVG, size, background and layout. After changing a colour SVG, run the script and
commit the SVGs and the raster files together.

`scripts/brand-assets.test.ts` checks that all files exist, that the SVGs contain only paths
and a title (no scripts, text, images or external references) and use only the colours above,
and that every raster file matches the plan: its size, its background, and pixels only in the
brand colours and their anti-aliased mixes. A new or renamed file needs an update of the plan,
that test and this table.

## Rules

- Minimum size of the signet: 16 px. Wordmark not smaller than 12 px cap height.
- Clear space around the logo: at least the width of the `>`.
- Do not distort or recolour (except with the mono variants); no shadows or gradients.
- The word "Linux" is not part of the logo.
