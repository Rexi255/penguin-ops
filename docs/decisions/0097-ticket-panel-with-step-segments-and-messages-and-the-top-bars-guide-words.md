# 0097. Ticket panel with step segments and messages, and the top bar's guide words

- Status: Accepted; partly superseded by
  [0099](0099-chapter-inbox-chapter-titles-in-the-ui-catalogs-and-a-terminal-per-ticket.md) (the
  order in which Shift+Tab leaves the terminal)
- Date: 2026-11-20
- Supersedes: [0096](0096-side-panel-tabs-and-key-hints-of-the-workplace-layout.md) (only the empty
  tickets panel and the focus order)

## Context

ROADMAP M3.5 fills the tickets panel that ADR 0096 left empty and the top bar that names where the
player is (`DESIGN.md`). M3.5 is split into three packages: M3.5a shows the ticket being played and
its progress, M3.5b the hints with F1 and the explanation after solving, M3.5c the chapter inbox
and the extra goals. Before M3.5a the game showed none of the level session's game events (ADR
0077): the terminal model dropped them, so step messages and tips were written in every level but
never seen. Open were where the ticket's progress lives in the UI, how the steps look, where step
messages and tips appear, and what the top bar shows. The owner chose the ticket panel for step
messages and tips. The ticket texts of the test levels were wrapped by hand in their YAML files,
and ADR 0073 keeps every line break, so the panel showed breaks in the middle of its lines.

## Decision

- **Game events reach the game screen.** `TerminalState.gameEvents` holds the game events of the
  last input that ran; every input that runs sets a new list, every other change keeps it. The
  terminal component compares the lists by identity and calls `onGameEvents` with every new,
  non-empty list. The game screen keeps the ticket's progress as React state.
- **Progress as a pure model.** `apps/ui/src/tickets/ticket-progress.ts` adds up the events:
  `applyGameEvents` counts completed steps, marks the ticket solved and appends step messages
  (`say` of a step that has one) and tips in the order the game said them; extra goals change
  nothing until M3.5c. `stepPosition` gives the step the player works on (counting from 1), or
  nothing for a ticket with a single goal and for a solved ticket.
- **Ticket panel.** `apps/ui/src/tickets/ticket-panel.tsx` shows, in this order, inside an
  `article` named by its title:
  - the title as a level 2 heading in the heading role of the type scale;
  - a state row (`role="status"`, always present so that changes are announced): for a ticket
    with steps one tape segment per step, then "Step 1 of 2"; for a solved ticket the solved icon
    and "Solved" in the success colour (handbook green), after the segments if there are steps. A
    ticket with a single goal shows nothing until it is solved, and the row keeps its height;
  - the ticket text with its paragraphs and lists (`RichTextBlocks`, ADR 0073);
  - after a hairline rule, the heading "Updates" and the messages as an ordered list, oldest
    first, in a polite live region that is always present. A tip has the hint icon, a step
    message the solved icon in the success colour; a visually hidden label ("Tip", "Step done")
    says the kind to screen readers. The newest message is scrolled into view (`block:
    "nearest"`). The heading and the list appear only with the first message.
- **Step segments.** Each segment is three columns wide and half a cell high with the corner
  radius: printed yellow tape for a completed step, a fibre orange frame (choice width) for the
  current step, a control-border outline for the steps after it; all are printed once solved. The
  segments are hidden from screen readers, because the text next to them says the same.
- **Top bar guide words.** The top bar shows the ticket's title, then after a hairline rule the
  step ("Step 1 of 2") or the solved state with its icon in the success colour. It is not a live
  region, because the ticket panel announces the same changes. The chapter joins the guide words
  with the chapter inbox (M3.5c), because chapters have no titles yet.
- **Texts.** `ticketTexts` formats a level's title (which must be one paragraph) and ticket text in
  the player's language with the English fallback of ADR 0074; `messageText` formats a step
  message or tip by its key on demand, because the level's other texts also hold prose file
  contents, which are not catalog messages. The UI catalogs get `ticket.step`, `ticket.solved`,
  `ticket.updates`, `ticket.step-done` and `ticket.tip`.
- **One line per paragraph.** Level texts write each paragraph on one line; the UI wraps it.
  `docs/LEVEL-AUTHORING.md` says so, and the test levels' tickets, tips, step messages and
  explanations are rewritten that way. Prose file contents keep their lines, because they are
  files.
- **Focus order.** Every tab's panel has text now, so every panel takes the focus (`tabindex` 0).
  Shift+Tab from the terminal reaches the tickets panel first, so the keyboard can scroll the
  ticket, and a second Shift+Tab reaches the chosen tab. This replaces the empty tickets panel
  and the focus order "Shift+Tab from the terminal reaches the chosen tab" of ADR 0096.

## Alternatives considered

- **Step messages and tips as game notices in the terminal:** where the player looks, but they
  scroll away with the output and mix the game's voice into the shell's log; the panel keeps them
  readable next to the ticket, like comments in a real ticket.
- **Both, a notice in the terminal and the list in the panel:** says everything twice.
- **Deriving the progress from the level session instead of the events:** steps and the solved
  state could be read from the session, but the order of tips and step messages across inputs
  could not.
- **Moving the terminal's state up into the game screen:** the game screen would re-render on
  every key; the event callback gives it only what it needs.
- **Markdown-style soft line breaks (join lines with a space):** ADR 0073 rejected them, because
  mails and lists would lose their lines.
- **A "Ticket solved" message in the updates:** says the same as the state row and the top bar.
- **A progress bar or ring for the steps:** `DESIGN.md` draws progress as tape segments whose
  number is the exact count.

## Consequences

- M3.5b adds "F1 Hint" to the footer and the hints and the explanation to the ticket panel; M3.5c
  adds the chapter inbox, the chapter to the guide words and the extra goals.
- A live region in a hidden tab panel is not announced; when mail or the handbook is chosen, a
  new message waits in the tickets panel until the toasts of M3.11 announce game events.
- The save system (M3.7) has to keep the messages, or rebuild them, when it resumes a ticket at
  a checkpoint.
- The screenshot tests of M3.15 cover the ticket panel with a single goal, with steps, with
  messages and solved.
- Code spans in the panel can break after a hyphen in a path; ROADMAP Ideas holds the fix.
