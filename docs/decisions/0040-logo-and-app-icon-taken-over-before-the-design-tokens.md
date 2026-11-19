# 0040. Logo and app icon taken over before the design tokens

- Status: Accepted; partly superseded by
  [0088](0088-logo-colours-aligned-with-the-interface-tokens.md) (the logo colours) and
  [0089](0089-raster-brand-files-drawn-from-the-logo-svgs-in-chromium.md) (how the raster icons are
  made)
- Date: 2026-11-17
- Supersedes: [0039](0039-design-language-before-the-game-frame-ui.md) (only the order of the logo
  package)

## Context

ADR 0039 plans the logo as the last design package (M3.0f), after the design tokens (M3.0b),
so that the logo colours can be aligned with the tokens, and leaves the app icon files to the
release (M5.1). The owner finished the logo in a separate chat earlier than planned and
delivered a brand package: the signet, the wordmark and the horizontal logo as SVG in colour
and mono variants for dark and light backgrounds, app icons (ICO with 9 sizes, PNG from 16 to
1024 px), favicons and a GitHub social preview image. Until now, the installer, the AppImage and
the window show the default Electron icon.

The logo: a slim, upright penguin in profile whose beak is the `>` of a shell prompt, followed
by a waiting `_` cursor. The wordmark `Penguin>_Ops` repeats the prompt. Colours: `#0d1117`
(body, text on light backgrounds), `#ffffff` (belly, eye, outline, text on dark backgrounds)
and `#e0701a` (the prompt). The wordmark is set in Geist Mono Bold (SIL OFL 1.1), converted to
paths. This fulfils the rules of ADR 0021: an own penguin, not Tux, and no "Linux" in the logo.

## Decision

- The owner's brand package is the PenguinOps logo. Its source files live in `assets/brand/`
  (SVG and web icons) with a `README.md` that describes the idea, colours, files and usage
  rules.
- The app icon files are used now: `apps/desktop/build/icon.ico` for the Windows executable,
  shortcuts, installer and uninstaller; `apps/desktop/build/icons/NxN.png` for the AppImage;
  the 256 px PNG as the window icon on Linux. electron-builder reads them from its build
  resources folder `apps/desktop/build/`.
- The repository README shows the horizontal logo, with the variant for dark or light GitHub
  themes.
- M3.0f is split: taking over the logo and its variants is done now; aligning its colours with
  the design tokens and showing it in the styleguide stay in M3.0f and follow M3.0b and M3.0c.
  If the tokens change a logo colour, the SVGs and the raster icons are regenerated together.
- M5.1 is split the same way: the ICO and PNG app icons are done now; the final polish of the
  logo stays in M5.1. No `.icns` file is made, because macOS is not officially supported
  (ADR 0002).
- A test (`scripts/brand-assets.test.ts`) guards the files: SVGs contain only paths and a
  title, no scripts, text, images or external references, and use only the brand colours; the
  raster icons have the expected sizes.
- Geist Mono is listed in `THIRD-PARTY-LICENSES.md`, because the wordmark contains its glyph
  outlines. The font itself is not shipped and is not a UI font; ADR 0020 still decides the UI
  fonts.

## Alternatives considered

- **Keep the order of ADR 0039 and leave the logo in the brand package until M3.0f:** the logo
  is finished, and the installer would keep showing the default Electron icon for several
  milestones for no gain; aligning colours later is cheap.
- **Take over only the SVGs, not the app icons:** the app icons are the most visible use of the
  logo, and electron-builder needs only a configuration line for each platform.
- **Generate the raster icons in the build from the SVG:** needs an extra image tool as a
  dependency; the delivered icons are rasterised per size by hand and are better at 16 px. The
  test checks that the files are complete instead.

## Consequences

- The installer, the installed app, its shortcuts and the AppImage show the PenguinOps icon.
- The logo colours are provisional until M3.0f; if they change, the brand files are
  regenerated outside the repository and replaced as a whole.
- The owner sets `assets/brand/web/social-preview.png` as the social preview image in the
  GitHub repository settings by hand.
- On Linux, desktops link the running window to the AppImage's desktop entry through the
  window class; electron-builder warns that `desktopName` is not set. This is recorded as an
  idea in the ROADMAP and not part of this decision.
