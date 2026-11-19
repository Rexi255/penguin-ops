# 0087. Icon files drawn by a strict SVG reader and checked by geometric rule tests

- Status: Accepted
- Date: 2026-11-19
- Supersedes: –

## Context

ADR 0086 chose own outline icons and set their rules: a 24 × 24 grid, whole-pixel coordinates
so that a 2 px stroke covers whole pixels, strokes and miter tips at least 1 unit inside the
edge, a 2 px stroke in `currentColor` without fill, square caps and miter joins, dots as
2 × 2 butt-capped strokes, and icons hidden from screen readers. ROADMAP M3.0e-2 turns the
14 drafts of ADR 0086 into files, tests the rules and shows the icons in the styleguide.

Two questions were open:

- How the app draws an icon file. The icon must take the colour of its text, so it has to be
  inline SVG in the page: an `<img>` cannot inherit `currentColor`. The renderer's Content
  Security Policy and the project's rules ask for no injected markup.
- How the rules are tested. A test of the attributes alone cannot see whether a coordinate is
  on a whole pixel or whether a miter tip reaches the edge.

Checking the drafts against the rules found three of them breaking the rules of ADR 0086
itself: the dot of `incident` and the dots and lines of `server` lay on half pixels, and the
slanted ends of `ticket` put the miter tips 0.61 units from the edge. The enlarged view in the
styleguide also showed the square caps of the `mail` flap reaching past the envelope's corners.

## Decision

- Each icon is one file `apps/ui/src/icons/<name>.svg` in a fixed form: one `<svg>` element with
  exactly the attributes `xmlns`, `viewBox="0 0 24 24"`, `fill="none"`,
  `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="square"` and
  `stroke-linejoin="miter"`, holding only empty `<path d>` and `<circle cx cy r>` elements. A
  path may set `stroke-linecap="butt"` and nothing else. No groups, transforms, titles, styles
  or comments.
- `icon-svg.ts` reads this form strictly and throws on anything else. `icon.tsx` bundles the
  files as text through Vite (`import.meta.glob` with `?raw`), reads them once when the module
  loads, and the `Icon` component draws the shapes as React elements inside an `<svg>` with the
  same attributes, `aria-hidden="true"` and `focusable="false"`. `ICON_NAMES` lists every icon;
  a name without a file or a file without a name stops the app at start.
- The `.icon` rule in `styles.css` sizes an icon to one cell (`--cell-block`).
- `path-data.ts` reads the path commands that outline icons need (M, L, H, V, A, Z, absolute and
  relative) and works out the stroke's bounds with its square caps and miter joins (SVG's
  default miter limit of 4). The rule tests use it to check every file: whole-number
  coordinates and radii, every stroke at least 1 unit inside the edge, butt caps only on
  straight 2 × 2 dots, arcs only circular and unrotated.
- The four drafts are corrected within the rules of ADR 0086, without changing what they show:
  `ticket` is `M7 6h14l-4 12H3z M9 12h6`, the `incident` dot is `M12 15v2`, `server` is
  `M3 4h18v6H3zM3 14h18v6H3z` with the dots `M6 6v2M6 16v2` and the lines `M11 7h7M11 17h7`,
  and the `mail` flap is `M4 7l8 6 8-6`. The other ten drafts are unchanged.
- The component is tested by rendering it to markup with `react-dom/server` and reading that
  markup with the same reader; the styleguide's browser tests check size, colour and
  `aria-hidden` in a real browser.

## Alternatives considered

- **Insert the file's markup with `dangerouslySetInnerHTML`:** shortest, but it puts unchecked
  markup into the page and hides the shapes from React; the component could not set
  `aria-hidden` on the `<svg>` itself without rewriting the string.
- **`<img src>` or a CSS mask with the file's URL:** an image cannot take `currentColor`; a mask
  can (`background-color: currentColor`), but it draws a filled box whose colour tests and
  accessibility checks cannot see as an icon, and it needs one CSS rule per icon.
- **Icons as path data in TypeScript, without SVG files:** easy to render, but the icons could no
  longer be opened in a browser or an editor, and ADR 0086 asks for SVG files.
- **A full SVG or XML parser as a dependency:** handles every form of SVG, which the icons must
  not use; the strict reader rejects exactly what the rules forbid, without a new dependency.
- **Test only the attributes:** misses the drafts that broke the pixel and margin rules.
- **Testing Library with jsdom for the component:** brings two dependencies and a DOM
  environment for a component without state or events; it comes with the first interactive
  component.

## Consequences

- A new icon is one SVG file in the fixed form and one entry in `ICON_NAMES`; the tests tell
  the author which rule a drawing breaks and where.
- SVG editors write extra attributes and elements; their output has to be reduced to the form
  by hand before it passes.
- The stroke bounds of arcs are computed on a fine polyline with exact extreme points; they are
  accurate to a thousandth of a unit, far below a pixel.
- `icon.tsx` reads the files at module load, so a broken icon file fails every test that imports
  the component and the app's start, not only the icon tests.
