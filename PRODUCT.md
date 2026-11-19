# Product

<!-- impeccable:product-schema 1 -->

This file holds the product truth that design work builds on. It is read by the impeccable
design skill (ADR 0039, ADR 0080) and by everyone who designs a screen. Visual decisions live in
`DESIGN.md`; the reasons behind product decisions live in `docs/decisions/`.

## Platform

web

PenguinOps is a desktop game built with Electron (ADR 0002, ADR 0003): a web interface
(`apps/ui`, React) inside its own window, fullscreen by default. Windows is the primary
platform, Linux (AppImage) the secondary one, macOS is not supported. The design language is
the same on every operating system; it does not follow native OS conventions.

## Users

- **Primary users, with equal weight:**
  - IT apprentices and career changers (for example the German "Fachinformatiker" apprenticeship)
    who know general IT but little Linux and need it for training, work or exams.
  - Complete beginners without an IT background who have never used a terminal.
- **Today:** the owner, an IT specialist apprentice (system integration), is the first and for
  now the only player. Others may play after the first release.
- **Situations:** both relaxed play in the evening or at the weekend at the player's own PC, and
  focused practice, for example next to vocational school or before an exam. Sessions are
  voluntary; nobody is forced to play.

## Product Purpose

PenguinOps teaches Linux commands through play. The player starts as an intern in the IT
department of a fictional company and solves support tickets in a simulated Debian terminal:
find a lost file, clean up a full disk, read the logs. Over the chapters the player grows into
an admin, and a quiet mystery about the previous admin unfolds.

Success means that the player can use the learned commands on a real Linux system afterwards,
and enjoyed getting there.

## Positioning

- **A real game, not a course.** Story, ranks, promotions, achievements, extra goals, menus,
  save slots and sound make it feel like a game from a store, not like a tutorial with a
  terminal attached (ADR 0002, ADR 0017, ADR 0018).
- **Realistic everyday IT work.** Every command is learned in the context of real admin work:
  tickets from colleagues, incidents, review tickets, side tickets, mail and a handbook. The
  simulated shell behaves like bash 5.2 and GNU coreutils on Debian 13, down to the error
  messages (ADR 0004).

## Operating Context

- Workplace layout (ADR 0020): a large terminal that is always visible, a side panel with tabs
  (Tickets, Mail, Handbook), a top bar with the in-game day and progress, and a footer with key
  hints. Full-screen programs (`nano`, `less`, `top`) take over the terminal area.
- Flow: start screen, save slot screen (three slots), game; Esc opens the pause menu.
- The keyboard is the main input. The terminal behaves like bash (Tab, arrow keys, Ctrl+C,
  Ctrl+L and others); game functions use F-keys and Esc. Notifications appear as small toasts
  and never interrupt typing.
- Chapter 0 is the tutorial: a trainer introduces the interface step by step. There is no
  separate tutorial screen.
- Modes: Story mode, and Sandbox mode (free play and a playground) (ADR 0017).

## Capabilities and Constraints

- Works fully offline; no network access at runtime (ADR 0014). Fonts and all other assets are
  bundled.
- Bilingual: German and English for all interface and story text. Everything inside the
  simulated Linux world (paths, commands, output, user and host names) is English in both
  languages (ADR 0012).
- No time pressure, no failure, no game over; help comes as free hints (ADR 0018).
- Visual style commitments (ADR 0020): a modern dark base style; selectable terminal colour
  schemes (default, retro CRT, Solarized, high contrast) and optional effects (glow,
  scanlines). Colour schemes must only swap token values, never require changes to screens.
- Fonts per ADR 0084: Barlow Condensed for label tape, Inter for the interface and JetBrains
  Mono for the terminal, all SIL OFL 1.1 and bundled.
- Audio: UI sounds generated in code; calm background music later (ADR 0020).
- Every dependency, font, image and sound must pass the license policy (ADR 0005).
- Undecided: company name, internal domain, characters and other setting details are decided
  in the story workshop (ROADMAP M4.1, `docs/STORY.md`).

## Brand Commitments

- Name: **PenguinOps** (ADR 0021). Not affiliated with Linux; "Linux" never appears in the logo,
  and the mascot is an own penguin, not Tux.
- Logo (ADR 0040, `assets/brand/`): a slim, upright penguin in profile whose beak is the `>` of
  a shell prompt, followed by a waiting `_` cursor; wordmark `Penguin>_Ops` in Geist Mono Bold.
  Colours `#0d1117`, `#ffffff` and the prompt orange `#e0701a`. The logo colours are provisional
  until ROADMAP M3.0f-2 aligns them with the design tokens.
- Voice (ADR 0023, `docs/STORY.md`): friendly, relaxed and humorous, with humour from real IT
  life (absurd requests, quirky colleagues, ancient hardware, "it worked yesterday"). The player
  is never the butt of the joke for making mistakes; hints are encouraging. No threats, no dark
  themes, no mocking of real companies, products or people. German texts use "du". Ticket texts
  stay short, because the terminal is the main stage.

## Evidence on Hand

- The logo package in `assets/brand/` (SVG in colour and mono variants, app icons, favicons,
  social preview).
- Five prototype levels as test content in `content/levels/`; their texts are provisional
  until the story workshop (ROADMAP M4).
- No player testimonials, reviews, download numbers or press exist. Do not invent any.

## Product Principles

1. **The terminal is the main stage.** Everything else supports the work in the terminal and
   never covers or interrupts it.
2. **A safe place to try things.** Mistakes are part of learning: no pressure, no punishment,
   only encouraging help.
3. **Real skills, real behaviour.** What the player learns must work the same way on a real
   Debian system.
4. **A game, not homework.** Progress, story and humour should make the player want to open the
   next ticket.
5. **Clear for beginners, credible for apprentices.** Someone who has never seen a terminal must
   find their way, and someone who knows IT must not feel talked down to.

## Accessibility & Inclusion

Basic level per ADR 0020: full keyboard control, scalable font size, a "reduce motion" setting
that turns off animations and effects, a high-contrast colour scheme, information never
conveyed by colour alone, and automated axe-core checks in the test suite. Text and background
colour pairs meet WCAG 2.2 AA contrast (ROADMAP M3.0b). Screen reader support follows in a later
milestone, once the interface is stable.
