# 0081. Label tape and patch cables as the visual world

- Status: Accepted; partly superseded by
  [0094](0094-new-game-screen-with-choice-cards-and-games-kept-in-memory-until-the-save-system.md)
  (the uses of fibre orange)
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0039 builds the design language before the game frame screens and keeps `PRODUCT.md` and
`DESIGN.md` in the repository root. ADR 0020 fixes the workplace layout, a modern dark base
style, selectable colour schemes and the fonts, but no visual world, colours or signature. The
only styles in `apps/ui` were four placeholder colours. ROADMAP M3.0b starts the design language
with `PRODUCT.md` and `DESIGN.md`.

ADR 0080 left open whether impeccable, which treats this repository as a monorepo and resolves
`apps/ui` as the project root, finds the two files in the repository root.

The owner's answers for `PRODUCT.md`: apprentices and complete beginners are equal primary
users, with the owner as the only player for now; play happens both relaxed and as focused
practice; PenguinOps should stand out by real game feel and realistic everyday IT work. For the
look, the owner wants it to feel like a modern Steam game, like other coding and programming
learning games there, but without the hacker cliché, and declared none of the existing visual
commitments (dark base, logo orange, layout) untouchable.

impeccable's new-work flow derived seven grounded directions from the audience's world, rolled
one of them as the assigned direction, dealt six catalog worlds as challengers and showed four
cards with sketches of the workplace screen on its decision page: label tape and patch cables
(assigned), a polar night field station (impeccable's pick), a split-flap departure board
(competitive challenger) and the category standard of dark coding games. Five challengers were
declined with the reason shown.

## Decision

- **Visual world:** the owner chose "Label Tape & Patch Cable". Names and IDs that matter
  (ticket IDs, the product name, panel names, the rank, toast titles) are printed on label-maker
  tape; each kind of work has its own patch cable colour (tickets, mail, handbook, incidents);
  the ground is matte rack metal. The logo's prompt orange becomes "fibre orange", used only for
  the player's own prompt, cursor and active ticket. The signature move is a tape strip printing
  out for new tickets, mails, ranks and achievements; nothing else animates on its own.
- The world lends only palette, type, density and that signature move. The workplace layout,
  navigation and controls of ADR 0020 stay unchanged, and so does the dark base style.
- **`PRODUCT.md`** in the repository root records the product truth from the owner's answers.
- **`DESIGN.md`** in the repository root is written as an impeccable seed: the chosen world,
  its rules and the sketch colours marked as provisional. It is regenerated from the code with
  `/impeccable document` once the design tokens exist.
- The workplace screen's direction contract is the surface brief
  `apps/ui/.impeccable/surfaces/src-app-tsx.md`, committed like impeccable recommends.
- impeccable finds the root files from `apps/ui` (`impeccable context --target apps/ui` reports
  `productPath: "PRODUCT.md"`), so no extra configuration is needed.

## Alternatives considered

- **Polar night field station:** night blue, ice and expedition orange, with a horizon that
  brightens with every chapter. Close to the logo, but navy plus orange is the look most dark
  developer tools already have, and it depends on one move to stand out.
- **Split-flap departure board:** strong game feel, but long ticket titles in condensed capitals
  read hard for beginners, and the flaps wear out as a novelty in long sessions.
- **The category standard (charcoal rounded panels, one blue accent):** safe and familiar, but
  indistinguishable from other games of the genre.
- **Declined catalog worlds** (grid type specimen, encyclopaedia page, dance notation, zoo guide
  map, monochrome product page): none of them is recognisable to the audience as a workplace or a
  game. Their strongest disciplines were kept in the chosen world: one grid based on the terminal
  character cell, colour only on tape and cables, guide words in the top bar, progress drawn as
  segments of exact length, one motion grammar and a rare player colour.
- **Writing `DESIGN.md` from the placeholder styles (impeccable's scan mode):** would have
  recorded four placeholder colours as the design system.

## Consequences

- ROADMAP M3.0b part 2 turns the provisional colours into semantic tokens in `apps/ui` and
  checks their contrast; the cable colours must also work in the colour schemes of M3.9.
- M3.0d chooses the tape typeface next to the UI and terminal fonts; M3.0e chooses icons that
  fit the tape and cable world; M3.0f-2 aligns the logo with fibre orange and the tokens.
- Every later screen follows `DESIGN.md`; the finish review of impeccable's flow and a
  regenerated `DESIGN.md` close the first real build of the workplace screen.
- The open question of ADR 0080 about the root files is answered.
- impeccable's runtime folders (`mocks/`, `questions/`, `review/`) keep the decision sketches
  local; they ignore themselves for git with their own `.gitignore`, which Prettier does not
  read, so `.prettierignore` skips them too. The project's own files are still checked.
