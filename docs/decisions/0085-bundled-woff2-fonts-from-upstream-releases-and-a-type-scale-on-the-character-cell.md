# 0085. Bundled WOFF2 fonts from upstream releases and a type scale on the character cell

- Status: Accepted
- Date: 2026-11-19
- Supersedes: –

## Context

ADR 0084 chose Barlow Condensed for label tape, Inter for the interface and JetBrains Mono for
the terminal, and left the weights, the file format, the source of the files and the type scale
to ROADMAP M3.0d-2. Until now the font tokens used system faces.

Constraints:

- The game runs offline and the Content Security Policy only allows `font-src 'self'`
  (ADR 0014), so every face ships inside the app.
- Fonts must be under the SIL OFL 1.1 (ADR 0005). The OFL asks for the license text next to
  every copy of the font.
- npm dependencies must have a license from `license-policy.json`; OFL-1.1 is not on that list,
  because the list is for code.
- The terminal face needs the box-drawing characters U+2500 to U+257F and an advance width of
  0.6 em, which the character cell (`--cell-inline`) is built on.
- Screenshots must be deterministic (`.claude/rules/ui.md`), so the first frame must already use
  the real faces.
- The spacing scale is quarter steps of the cell height (6 px); text should line up with it.

The owner agreed to this proposal: files from the official upstream releases instead of an npm
package, few weights, and a type scale in the design tokens.

## Decision

**Files.** The fonts are WOFF2 files, unchanged, taken from the official upstream sources and
committed to `apps/ui/src/fonts/<family>/`, each folder with the family's license text as
`ofl.txt`:

| Family | Version and source | Files | Size |
|---|---|---|---|
| Inter | 4.1, release `v4.1` of rsms/inter, `web/InterVariable.woff2` | one variable file, weights 100 to 900 | 344 KiB |
| JetBrains Mono | 2.304, release `v2.304` of JetBrains/JetBrainsMono, `fonts/webfonts/` | Regular (400), Bold (700) | 182 KiB |
| Barlow Condensed | 1.422, commit `dc2940e` of jpt/barlow, `fonts/woff2/` | Bold (700) | 60 KiB |

Measured from these files: JetBrains Mono has all 128 box-drawing characters and an advance
width of 600/1000 em; all three have the German umlauts and ß; Inter has the capital sharp s,
Barlow Condensed does not (ADR 0084). None of the three licenses names a Reserved Font Name.

**Weights.** Inter is variable, so the interface can use every weight; the tokens use 400 (body),
500 (controls), 600 (headings). JetBrains Mono ships 400 for terminal output and 700 for bold
terminal output. Barlow Condensed ships 700 only, for the print on tape.

**Faces.** `apps/ui/src/fonts/fonts.css` declares one `@font-face` per file with
`font-display: block` and is imported by the app and by the styleguide before `tokens.css`. The
font tokens `--font-ui`, `--font-mono` and the new `--font-tape` name the bundled family first;
system faces follow only as a fallback for a file that cannot be read. Every rule that sets
`--font-mono` also sets `font-variant-ligatures: none` (ADR 0084).

**Licenses in the installed app.** Vite bundles the font files into `app.asar`. electron-builder
copies every `ofl.txt` as a plain file to `resources/licenses/fonts/<family>/ofl.txt`, where
players can read it. `THIRD-PARTY-LICENSES.md` lists the three families.

**Type scale.** `tokens.css` gets weight tokens (`--font-weight-body`, `-control`, `-heading`,
`-strong`) and, per role, a size and a line height (`--text-<role>-size`,
`--text-<role>-leading`):

| Role | Size | Line height |
|---|---|---|
| hint (key hints, footer, meta data) | 13 px | 18 px |
| tape | 15 px | 18 px |
| body (running text) | 16 px | 24 px |
| terminal | 16 px | `var(--cell-block)`, 24 px |
| heading | 20 px | 24 px |
| title (screen titles) | 28 px | 36 px |
| display (start screen, rank-ups) | 40 px | 48 px |

Sizes are in rem. Every line height is a whole number of quarter cells (6 px), so text lines up
with the terminal lines and the spacing scale. Stylesheets set faces, sizes, weights and line
heights only through these tokens.

**Checks.** `fonts.test.ts` checks that every face points to a bundled WOFF2 file, every file
has a face, every folder has its OFL text, `THIRD-PARTY-LICENSES.md` has a row per family, the
tokens name the bundled families first, and every role's weights exist as faces.
`design-tokens.test.ts` checks the type scale and that the stylesheets use the tokens and turn
off ligatures with the monospace face. The styleguide's browser tests check that every face
loads and that the line heights measure in quarter cells; the desktop end-to-end tests check
that every face loads in the app under its Content Security Policy and that the packaged app
has the license files.

## Alternatives considered

- **`@fontsource` npm packages:** convenient and versioned by npm, but they are under OFL-1.1,
  which `license-policy.json` does not allow for npm dependencies; an exception would need the
  owner's approval for three packages that add nothing but the files. Their files are split into
  Google Fonts' unicode-range subsets, and none of the subsets of `@fontsource/jetbrains-mono`
  has the box-drawing characters that `tree` needs.
- **TTF files (for example from the google/fonts repository):** the same outlines, but two to
  three times larger than WOFF2. Electron's Chromium reads WOFF2 natively.
- **Static Inter files per weight:** three static files (400, 500, 600) are about as large as the
  variable file, which also covers every other weight and Inter's optical size axis for the
  display sizes.
- **Subsetting the fonts to the needed characters:** smaller files, but the game's texts are not
  final, a missing glyph would fall back silently to a system face, and a subset is a Modified
  Version under the OFL. The files are small enough for a desktop app.
- **Barlow Condensed release `v1.408`:** the newest tag, but older than the default branch, which
  has version 1.422; the commit is pinned instead of the branch.
- **`font-display: swap`:** shows a system face while the file loads, which would make the first
  frame and screenshots depend on timing. Local files load in a moment, so `block` costs
  nothing.
- **A type scale with steps by ratio (for example 1.25):** gives line heights that do not fall on
  the 6 px grid of the cell; sizes per role with line heights on the grid keep text and spacing
  aligned with the terminal.

## Consequences

- Text looks the same on Windows and Linux, and the character cell no longer depends on the
  operating system's monospace face.
- The app grows by about 590 KiB of font files.
- New fonts or weights follow the same pattern: an unchanged upstream file in a folder with its
  `ofl.txt`, an `@font-face` in `fonts.css`, a row in `THIRD-PARTY-LICENSES.md`; the tests fail
  until all are there.
- Updating a font is a deliberate work package: replace the file, update the version in
  `fonts.css`, `THIRD-PARTY-LICENSES.md` and this record's successor.
- The screens of ROADMAP M3.1 and later use the type scale tokens; a new role needs a size and a
  line height on the grid.
- The owner checks the rendering on Windows, which draws fonts slightly heavier than Linux
  (ADR 0084).
