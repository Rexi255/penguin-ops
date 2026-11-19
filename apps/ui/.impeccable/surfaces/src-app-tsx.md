---
version: 1
slug: "src-app-tsx"
primary_target: "src/app.tsx"
related_targets: []
---

# Surface brief: workplace screen

## Scope

The in-game workplace screen (ADR 0020): top bar, side panel with the tabs Tickets, Mail and
Handbook, the large terminal, toasts and the key-hint footer. The app entry `apps/ui/src/app.tsx`
stands in until the screen gets its own component in ROADMAP M3. Visitor mode: Operate.

## Audience and task

IT apprentices and complete beginners (see `PRODUCT.md`) read a ticket, work in the terminal,
take hints and follow their progress. Played in long sessions, evenings or before exams, mostly
on a Windows PC in fullscreen. Important states: an active ticket with steps, a new incident, a
new mail toast, a hint shown, a ticket solved, a rank-up.

## Direction contract

THESIS: The office is labelled the way admins label it: names and IDs on printed label-maker
tape, kinds of work on colour-coded patch cables. Refuses the category default of charcoal
rounded cards with one blue accent, and the hacker cliché of green on black.

OWN-WORLD: Matte rack-metal neutrals for the ground and panels. Yellow and white label tape with
black condensed caps for ticket IDs, panel names and the rank. Cable colours as the only other
colour: tickets blue, mail violet, handbook green, incidents red. Fibre orange (the logo's
prompt orange) only on the player's own prompt, cursor and active ticket. Square-ish corners
(2 px), hairline rules, no glow, no gradients.

STORY: The player understands at a glance which ticket is active, what kind each item is, and
where they are (chapter, ticket, step). They feel like a member of a real IT department, not a
student in a course, and want to open the next ticket.

FIRST VIEWPORT: 48 px top bar with tape-strip product name, guide words (chapter, ticket, step)
and on the right the day, rank tape and XP as tape segments. Left side panel about 430 px wide:
tabs with a 3 px cable run on top, ticket rows with tape IDs, the active row outlined in fibre
orange, the active ticket's text, step segments and the hint button below. The terminal fills
the rest at 16 px JetBrains Mono. Toasts print out as tape at the terminal's bottom right. A
32 px footer shows F-key hints.

FORM: Label tape and patch cables, position 3 of 7 on the grounded list. seed:47b9ba519771fb99

Signature interaction: new tickets, mails, ranks and achievements print out as a tape strip
(one motion grammar; nothing else animates on its own; "reduce motion" shows the strip at once).

Raises kept from the declined challengers: every size snaps to the terminal character cell
(Crouwel grid); colour lives only on tape and cable runs, and the top bar names the span you are
in (lexicon); XP and steps are tape segments whose length is the exact count (Labanotation); one
motion grammar (zoo map); fibre orange stays rare (monochrome product).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved decisions

- The type scale and the bundled font files: ROADMAP M3.0d-2 (the faces are chosen in ADR 0084:
  Barlow Condensed for tape, Inter for the interface, JetBrains Mono for the terminal).
- Icons: ROADMAP M3.0e. Logo colour alignment: ROADMAP M3.0f-2.
- How the cable colours map onto the colour schemes of ROADMAP M3.9 (retro CRT, Solarized, high
  contrast).
