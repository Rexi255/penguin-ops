# 0089. Raster brand files drawn from the logo SVGs in Chromium

- Status: Accepted
- Date: 2026-11-19
- Supersedes: [0040](0040-logo-and-app-icon-taken-over-before-the-design-tokens.md) (only how the
  raster icons are made)

## Context

ADR 0088 changes two of the three logo colours. The SVGs in `assets/brand/svg/` only need their
hex values replaced, but 14 raster files carry the old colours too: the 1024 px base icon, nine
Linux icons and the Windows ICO in `apps/desktop/build/`, and the favicon ICO, the Apple touch icon
and the GitHub social preview in `assets/brand/web/`. ADR 0040 took them over as delivered by
the owner's separate chat, rejected generating them because that "needs an extra image tool",
assumed they were rasterised per size by hand, and planned to regenerate them outside the
repository. ADR 0088 left open how they are regenerated.

Two findings shaped the decision:

- The delivered icons at 16, 24, 32 and 48 px were compared, enlarged pixel by pixel, with the
  signet SVG drawn by Chromium at the same sizes. They are the same drawing with the same
  anti-aliasing; no size has hand-placed pixels. The social preview is the horizontal logo at
  3.1 times its view box, centred on 1280 × 640 px; the Apple touch icon and every app icon are the
  signet over the whole square.
- Playwright and its Chromium are already development dependencies (end-to-end and styleguide
  tests, ADR 0083). Chromium draws SVG to a canvas at any size and writes PNG files. An ICO file
  can store PNG images at every size (Windows Vista and later), so it needs only a 6-byte header
  and a 16-byte entry per image.

## Decision

- The colour SVGs are the only source of the logo. `npm run brand:rasters`
  (`scripts/generate-brand-rasters.ts`) draws every raster brand file from them in Playwright's
  Chromium and writes it into the repository. After any change to a colour SVG, the script runs
  and the SVGs and raster files are committed together.
- `scripts/brand/raster-plan.ts` lists every raster file: its path, the SVG it is drawn from, its
  size, its background (transparent for app icons and favicons, `#0f1114` for the Apple touch
  icon and the social preview) and its layout (the signet fills the square; the horizontal logo
  at 3.1x is centred). The ICO files hold PNG images: the Windows icon at 16, 20, 24, 32, 40, 48,
  64, 128 and 256 px, the favicon at 16, 32 and 48 px, as before.
- The SVG is given the drawn size as its width and height before it is drawn, so that Chromium
  rasterises the vector shapes at that size instead of scaling a bitmap.
- `scripts/brand-assets.test.ts` checks the raster files against the same plan without a browser:
  a small PNG reader (`scripts/brand/png.ts`) decodes every PNG and every image in the ICO files.
  The test checks the size, the background in all four corners, that the three brand colours of
  ADR 0088 appear as exact pixels, and that no opaque pixel has a channel more than one step
  outside the range of the brand colours. Anti-aliasing mixes neighbouring colours and Chromium
  rounds by up to one step; the old colours `#0d1117` (red 13) and `#ffffff` fall outside that
  range. The Windows icon must contain the same images, byte for byte, as the Linux icons of the
  same sizes.
- `tsconfig.tooling.json` includes the DOM library, like the other Playwright projects
  (`apps/desktop`, `apps/styleguide`), because the script passes a typed function that runs in the
  page. `@playwright/test` is added to the root development dependencies, where the script runs;
  the installed version does not change.
- The script runs by hand, not in CI or in the build. A machine without Playwright's Chromium
  runs `npx playwright install chromium` once or sets `STYLEGUIDE_CHROMIUM_PATH`, as for the
  styleguide tests.

## Alternatives considered

- **Image library such as sharp or resvg-js:** a new dependency with native or WebAssembly
  binaries only for a handful of files that change rarely, while Chromium is already installed.
- **Generate the files in the build (electron-builder) instead of committing them:** every build
  would need a browser, the README and GitHub need the files in the repository anyway, and the
  test could no longer check the committed files.
- **Regenerate the files outside the repository, as ADR 0040 planned:** the result could not be
  repeated or checked, and the next colour change would again depend on an external chat.
- **Compare the files byte for byte with a fresh rendering in the test:** needs a browser in the
  unit tests, and Chromium versions may anti-alias differently, so the test would break on
  browser updates without a real change. The pixel check catches every wrong colour without it.

## Consequences

- A colour change is now: edit the colour SVGs, run `npm run brand:rasters`, run the tests. Two
  runs on the same machine write identical bytes.
- The 16 px icons are no better than Chromium's rendering. If a size ever needs hand-placed
  pixels, the plan needs a source SVG for that size.
- The PNG files are larger than the delivered ones (the 1024 px icon 74 KB instead of 47 KB),
  because Chromium compresses less; the installer size hardly changes.
- The tooling scripts may use DOM types. They still run in Node.js, where `document` does not
  exist, so a script that touches the DOM outside a page fails at once when it runs.
