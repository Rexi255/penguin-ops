# 0084. Barlow Condensed, Inter and JetBrains Mono as the typefaces

- Status: Accepted
- Date: 2026-11-19
- Supersedes: –

## Context

ADR 0020 named JetBrains Mono for the terminal and Inter for the interface, both under the SIL
OFL 1.1, without comparing them with alternatives. The visual world "Label Tape & Patch Cable"
(ADR 0081) added a third role: label tape, a condensed grotesque in bold caps for ticket IDs,
panel names, the rank and toast titles. The seed `DESIGN.md` left all three faces open until
ROADMAP M3.0d; until then the tokens `--font-ui` and `--font-mono` use system fonts.

Constraints:

- The game runs offline, so every face is bundled (ADR 0014, `PRODUCT.md`).
- Fonts must be under the SIL OFL 1.1 (ADR 0005).
- The terminal needs a monospace face with the box-drawing characters of `tree` and other
  programs (U+2500 to U+257F), German umlauts for player-facing text around it, clearly
  distinct `0 O o` and `1 l I |`, no ligatures, because the player has to see the characters
  they type, and an advance width that fits the character cell of the design tokens
  (`--cell-inline`, 0.6 em).
- The interface face carries German and English running text in a side panel of 432 px.
- The tape face has to stay short on narrow tape strips, also with German words such as
  "POSTEINGANG", "BEFÖRDERUNG!" or "ÜBERGABE".

M3.0d was split into the choice (M3.0d-1, this record) and the bundling with the type scale
(M3.0d-2). For the choice, three candidates per role were compared in a specimen page and in a
mock-up of the workplace screen, rendered with the real design tokens; the owner chose from
the screenshots. All nine candidates are under the SIL OFL 1.1. Measured from the TrueType
files in the google/fonts repository:

| Role | Candidate | x-height | Advance (em) | Box drawing | Note |
|---|---|---|---|---|---|
| Terminal | JetBrains Mono | 0.55 | 0.600 | 128/128 | ligatures in `calt` |
| Terminal | Geist Mono | 0.53 | 0.600 | 128/128 | face of the logo wordmark |
| Terminal | Cascadia Mono | 0.52 | 0.586 | 128/128 | 4319 glyphs, Reserved Font Name |
| Interface | Inter | 0.55 | – | – | `tnum`, `case`, 2933 glyphs |
| Interface | IBM Plex Sans | 0.52 | – | – | width axis 75–100 %, Reserved Font Name |
| Interface | Atkinson Hyperlegible Next | 0.50 | – | – | slashed zero by default, 392 glyphs |
| Tape | Barlow Condensed | 0.51 | – | – | `tnum`, no capital sharp s |
| Tape | Archivo (width 70 %) | 0.53 | – | – | width axis 62–125 % |
| Tape | IBM Plex Sans Condensed | 0.53 | – | – | Reserved Font Name |

Atkinson Hyperlegible Mono was also checked for the terminal and dropped before the comparison,
because it has no box-drawing characters.

## Decision

PenguinOps uses three typefaces, each for one role (the roles and rules are in `DESIGN.md`):

- **Barlow Condensed** for label tape only: bold, in caps, with slight tracking. The capital
  sharp s is missing, which does not matter, because uppercasing turns "ß" into "SS".
- **Inter** for the interface: running text, headings, tabs, buttons, menus and key hints.
- **JetBrains Mono** for the terminal and for real code in the interface (commands, paths, file
  names and data), always with ligatures turned off (`font-variant-ligatures: none`).

All three are bundled with the app under the SIL OFL 1.1 and listed in
`THIRD-PARTY-LICENSES.md`. ROADMAP M3.0d-2 chooses the weights, the file format and the source
of the files, and adds the type scale tokens; until then the system font stacks stay in place.

## Alternatives considered

- **Geist Mono for the terminal:** the logo wordmark `Penguin>_Ops` is set in it, so the prompt
  would match the logo. At 16 px on the dark terminal ground it looks thinner than JetBrains
  Mono and has a lower x-height; the logo is an SVG, so it does not need the face at runtime.
- **Cascadia Mono for the terminal:** the owner knows it from Windows Terminal. Its advance width
  of 0.586 em would change the character cell, the file is several times larger, and its
  Reserved Font Name forbids a subset under the original name.
- **IBM Plex Sans and IBM Plex Sans Condensed (one family for interface and tape, with Geist
  Mono):** coherent, but the condensed cut is the widest tape candidate, and the Reserved Font
  Name "Plex" makes subsetting harder.
- **Atkinson Hyperlegible Next for the interface:** built for legibility, with clearly distinct
  `I l 1 0 O`. It runs wider in the 432 px side panel, shows a slashed zero in every number of
  the interface (XP, times), and has far fewer glyphs. The confusable characters matter most in
  commands and paths, which are always set in JetBrains Mono.
- **Archivo at 70 % width for tape:** sharp and compact, but harder and less like the printed
  tape of a label maker than Barlow Condensed, which the sketch of ADR 0081 already used.
- **Keeping the system fonts:** they differ between Windows and Linux, and the character cell
  would depend on the operating system.

## Consequences

- The fonts of ADR 0020 stay; Barlow Condensed is added as the third face for the tape role of
  ADR 0081.
- Inter shows `I` and `l` alike. Commands, paths and user names in the interface must therefore
  be set in JetBrains Mono (the Real-Code Rule of `DESIGN.md`).
- JetBrains Mono's advance width of 0.6 em matches `--cell-inline`, so the character cell stays
  as it is.
- ROADMAP M3.0d-2 bundles the three faces for offline use, adds their licenses to
  `THIRD-PARTY-LICENSES.md`, adds the type scale tokens and shows the faces in the styleguide.
- The screenshots were rendered by Chromium on Linux; Windows renders fonts slightly heavier.
  The owner checks the bundled fonts on Windows in M3.0d-2.
