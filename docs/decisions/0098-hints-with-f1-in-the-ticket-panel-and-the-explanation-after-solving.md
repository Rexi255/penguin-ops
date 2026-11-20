# 0098. Hints with F1 in the ticket panel and the explanation after solving

- Status: Accepted
- Date: 2026-11-20
- Supersedes: –

## Context

ROADMAP M3.5b shows the hints and the explanation that every level already holds (`hints`,
`explanation`; `docs/LEVEL-AUTHORING.md`). ADR 0018 makes hints free and unlimited, three per
ticket: a tip, a concrete tip and the solution. ADR 0020 puts the hint on F1 and draws it in the
side panel ("[Hint 1/3]"); ADR 0096 and ADR 0097 left "F1 Hint" in the footer and the hints and the
explanation in the ticket panel to M3.5b. Open were where the hint count lives, where hints and
the explanation appear, what F1 does when another tab is chosen or every hint is shown, and
whether hints stay visible after solving. The owner agreed that hints stay visible after solving.

## Decision

- **Hint count in the ticket's progress.** `TicketProgress.hintsShown` (0 to `HINT_COUNT`, 3) sits
  next to the steps and messages of ADR 0097 in `apps/ui/src/tickets/ticket-progress.ts`.
  `showNextHint` adds one hint and returns the same progress once all three are shown. Hints stay
  available after the ticket is solved, and game events never change the count.
- **F1 and its key hint.** On the game screen, F1 shows the next hint wherever the focus is,
  except while the pause menu is open; a held F1 acts once, like Esc. The footer starts with "F1
  Hint", a button that does the same (ADR 0096), in the order of ADR 0020: F1 Hint, Tab Complete,
  Esc Menu. F1 also brings the tickets panel to the front, so the game screen keeps the chosen
  side panel tab (`SidePanel` takes `selected` and `onSelect`). The focus stays where it was, so
  the player keeps typing. Once every hint is shown, F1 still brings the tickets panel to the
  front and changes nothing else.
- **Hints in the ticket panel.** After the ticket's text, a section "Hints" lists the hints shown
  so far as an ordered list, oldest first, each with the hint icon, the label "Hint 1 of 3" in the
  muted hint type and the hint's text. It sits in its own polite live region, apart from the
  messages, so that a new hint is announced; the newest hint is scrolled into view (`block:
  "nearest"`). Hints come before the messages, because they belong to the ticket and keep their
  order, while messages follow the player's inputs.
- **Explanation after solving.** Once the ticket is solved, a section "What you learned" follows
  the messages: the explanation's text, the heading "Useful variants" with the options as a
  definition list named by that heading (the command as code, then what it does, in two columns),
  and "Try it:" with the example as code. Variants and example appear only when the level has
  them. The section is not a live region, because the state row already announces "Solved" and
  the explanation is long; it is scrolled into view from its heading (`block: "start"`), after
  any message of the same input.
- **Sections share one look.** The hints, the messages and the explanation are each a
  `ticket__section` after a hairline rule with a muted section title. An empty live region takes
  back the gap after it, so that it adds no space.
- **Texts.** `ticketTexts` also formats the three hints and the explanation (with English where a
  further language lacks them, ADR 0074). The UI catalogs get `keys.f1`, `game.hint`,
  `ticket.hints`, `ticket.hint`, `ticket.explanation`, `ticket.options` and `ticket.example`.

## Alternatives considered

- **The hint count in `packages/gameplay`:** the level session knows nothing of hints, and the
  ticket's other progress already lives in the UI model of ADR 0097; the save system (M3.7) stores
  them together.
- **Hints as messages in the updates list:** they would mix with tips and step messages in the
  order of inputs, and the three hints would no longer read as one growing answer.
- **Hints as game notices in the terminal:** ADR 0097 keeps the game's voice out of the shell's
  log; the game command `hint` (M3.6) may print them there later.
- **A disabled key hint once every hint is shown:** a disabled button loses the focus and says
  nothing about why; the label "Hint 3 of 3" already says that no more hints follow.
- **Hiding the hints after solving:** the owner wanted them to stay; they show the way the player
  took.
- **Announcing the explanation:** a long text read out after every solved ticket would talk over
  the player; "Solved" is announced and the explanation is the next section.
- **The explanation's options as a table with column headers:** headers such as "Option" and
  "Meaning" add words without adding information; a definition list pairs each command with its
  description.

## Consequences

- The save system (M3.7) has to keep `hintsShown` with the rest of the ticket's progress.
- The game command `hint` (M3.6) should call `showNextHint`, so that F1 and the command count the
  same hints.
- The handbook (M3.11) can reuse the explanation's look for a learned command.
- The screenshot tests of M3.15 cover the ticket panel with hints and with the explanation.
- F2 for the handbook joins the footer with M3.11, between F1 and Tab.
