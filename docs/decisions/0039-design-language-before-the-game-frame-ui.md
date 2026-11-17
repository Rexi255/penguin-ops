# 0039. Design language before the game frame UI

- Status: Accepted
- Date: 2026-11-17
- Supersedes: –

## Context

ADR 0020 fixes the layout, the dark base style, the colour schemes and the fonts, and ADR 0021
says that the logo is an own penguin drafted by Claude and chosen by the owner. Neither record
defines concrete colours, spacing, an icon style or a visual tone, and the roadmap planned the
logo only for the release (M5.1). Without a design language, each screen of M3 would invent
its own details, and the logo would not match the interface it appears in.

The owner has no design background, and Claude cannot judge its own visual work reliably. An
external design vocabulary and review tool helps both. The owner proposed
[impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0), a skill for coding agents
with design commands (`critique`, `audit`, `polish`, `typeset` and others), context files
(`PRODUCT.md`, `DESIGN.md`) and a deterministic detector for typical generated-design flaws.
Its README notes that its design hook runs outside the model's approval, that it fetches visual
directions from impeccable.style when a new design starts, and that its live mode can start an
agent without permission checks.

## Decision

- The design language is built before the game frame screens, as ROADMAP packages M3.0a–f:
  impeccable setup, visual tone and design tokens, styleguide page, typography, icon style,
  logo. M3.1 and later screens use only the tokens and icons from M3.0.
- impeccable is used as follows:
  - installed for this project only, as the skill without the design hook;
  - pinned to a fixed version and updated deliberately, not automatically;
  - telemetry turned off in the shared project configuration;
  - live mode is not used;
  - its working files follow its own `.gitignore` recommendation.
- `PRODUCT.md` and `DESIGN.md` live in the repository root, where impeccable expects them, and
  are linked from `CLAUDE.md`. All other documentation stays in `docs/`.
- The owner drafts the logo with Claude in a separate chat, from a project briefing that
  repeats the rules of ADR 0021 (own penguin, not Tux, no "Linux" in the logo, OFL fonts only,
  clean SVG, works in one colour and at 16 px). M3.0f takes over the chosen logo, aligns its
  colours with the design tokens and shows it in the styleguide.
- M5.1 keeps only the final app icon files (ico, icns, png in all sizes) and the polish of the
  logo.
- ADR 0020 and ADR 0021 stay valid. If M3.0d chooses other fonts than JetBrains Mono and Inter,
  that package records a new decision that partly supersedes ADR 0020.

## Alternatives considered

- **Design language along the way, as before:** cheaper at first, but every screen would set
  its own colours and spacing, and the colour schemes of M3.9 would need a refactoring of all
  screens.
- **Design language without impeccable:** no extra tool, but no independent review of the
  visual result and no shared design vocabulary between the owner and Claude.
- **impeccable with the design hook:** catches flaws on every edit, but runs outside the
  model's approval and downloads a binary on first use. It can be added later as a deliberate
  decision, together with the detector as a check.
- **`PRODUCT.md` and `DESIGN.md` in `docs/`:** consistent with the other documents, but needs a
  non-standard configuration that may break with impeccable updates.
- **Logo draft in this repository session:** keeps everything in one place, but the many
  visual iterations of a logo would crowd the working session; a chat with direct SVG previews
  suits them better.
- **Logo only at the release (M5.1):** the logo would not influence or match the design
  language.

## Consequences

- M3 starts with six small design packages before the first screen, so playable screens come
  later.
- The setup package M3.0a must verify that impeccable works in cloud sessions (network access
  to its engine download and catalog) and on Windows; if it does not, a new record decides how
  to continue without it.
- The logo colours are provisional until M3.0f aligns them with the tokens.
- The styleguide page joins the screenshot tests of M3.15.
