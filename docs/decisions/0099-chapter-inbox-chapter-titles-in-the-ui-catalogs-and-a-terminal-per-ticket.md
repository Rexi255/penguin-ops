# 0099. Chapter inbox, chapter titles in the UI catalogs and a terminal per ticket

- Status: Accepted; partly superseded by
  [0104](0104-save-game-format-version-1-and-one-game-time-per-game.md) (the game time of a ticket
  opened for the first time)
- Date: 2026-11-20
- Supersedes: [0097](0097-ticket-panel-with-step-segments-and-messages-and-the-top-bars-guide-words.md)
  (only the order in which Shift+Tab leaves the terminal)

## Context

ROADMAP M3.5c brings the chapter inbox of ADR 0017: chapters offer several tickets that can be
solved in any order, Story mode opens the chapters one after another and Sandbox mode opens all of
them. Until now the game screen played only the first level. ADR 0070 left the chapter titles to
the translation catalogs, and ADR 0097 left the chapter in the top bar's guide words to this
package. Open were where the unlock rules live, where the chapter titles live, how the inbox and
the ticket share the Tickets tab, what happens to a ticket the player leaves, and what follows a
solved ticket. The owner decided that a ticket the player leaves goes on where they left it when
they come back. M3.5 was split again: M3.5c is the inbox, M3.5d the extra goals.

## Decision

- **Inbox model in `packages/gameplay`.** `inbox.ts` is pure and works on the content's chapters
  and two sets of level IDs, the levels started and the levels solved (`CampaignProgress`), so
  the save system (M3.7) only has to keep these sets. `openChapters` gives the open chapters:
  every chapter in Sandbox mode; in Story mode the first chapter and each chapter whose earlier
  chapters have every ticket solved. `inbox` lists the open chapters with the state of each
  ticket (`new`, `started`, `solved`); `isTicketOpen`, `chapterOf` and `ticketState` answer the
  single questions. Until levels have kinds that are optional (side tickets, M4), every ticket of
  a chapter counts for opening the next one.
- **The next ticket.** `nextTicket` gives the first unsolved ticket of an open chapter after the
  solved one in game order, or else the first unsolved one before it, and `undefined` when every
  ticket of the open chapters is solved. Solving the last ticket of a Story chapter therefore
  offers the first ticket of the chapter it opened.
- **Chapter titles in the UI catalogs.** Each chapter's title is the UI text `chapters.<id>` in
  `content/ui/<language>.yaml` (`chapterTitleKey`). The content loader reports a chapter without
  an English title at its ID in `content/chapters.yaml`, and an English title of a chapter that
  does not exist, or one that is a group of texts, at the title; the existing completeness checks
  of the UI catalogs carry this over to German and further languages. `Texts.chapterTitle` formats
  a title, which must be one paragraph. The test that the UI catalogs hold exactly the keys the
  code uses leaves the `chapters` group out, because the titles are content.
- **Two views in the Tickets tab.** The tab shows the ticket being played, below a quiet button
  "Back to the inbox", or the inbox. The inbox has the heading "Inbox" and, for each open chapter
  in game order, a region named by the chapter's title with "1 of 3 solved" and its tickets as a
  list of rows. A row is a button with the ticket icon in the ticket cable colour, the ticket's
  title and its state in words ("New", "In progress", "Solved" with the solved icon in the colour
  of success). The ticket being played is framed in fibre orange on the raised surface and has
  `aria-current="true"`. Rows sit flush with hairline rules between them.
- **Focus.** Opening a ticket, from the inbox or as the next ticket, shows it and gives its
  terminal the focus. "Back to the inbox" gives the current ticket's row the focus. F1 also brings
  the ticket back from the inbox. The view and every ticket start at the top of the panel; the
  ticket panel then scrolls to its hints or explanation as before. Shift+Tab from the terminal now
  reaches the last control of the Tickets tab first: "Back to the inbox" while the ticket is open,
  the next ticket's row once it is solved; the next Shift+Tab reaches the panel with the ticket.
  This replaces "Shift+Tab from the terminal reaches the tickets panel first" of ADR 0097.
- **What follows a solved ticket.** Below the explanation, a section "Next ticket" shows the next
  ticket as a row. When solving opened a chapter, the sentence "A new chapter is open:" with its
  title in bold comes before the row. When every ticket of the open chapters is solved, the
  section says "Every ticket in your inbox is solved." instead.
- **A terminal per ticket.** The game screen keeps the latest terminal state of every ticket the
  player opened (the terminal reports it with `onStateChange`), and the progress of every opened
  ticket (steps, messages, hints). A ticket the player comes back to goes on where they left it:
  its screen, history, input line and world. A ticket opened for the first time starts at the
  game's start time with a new world. The terminal and the ticket panel are keyed by the level, so
  each ticket gets its own instance.
- **Guide words.** The top bar shows the chapter's title in muted text, then the ticket's title and
  its step or state, each after a hairline rule.
- **Until the save system.** The game screen takes the content, the game's mode, the user name and
  the first ticket. The game lives in the game screen and starts again with the first ticket
  whenever the screen appears (M3.7).

## Alternatives considered

- **Unlock rules in the UI:** they decide what a save offers and must be the same for the save
  system and later the playground; pure functions in `packages/gameplay` are testable without a
  DOM.
- **Chapter titles in their own catalog files (`content/chapters/<language>.yaml`):** a new kind
  of catalog would need its own loader and completeness checks, and `CLAUDE.md` names the German
  files allowed in the repository; the UI catalogs already have both, and ADR 0070 asked for the
  titles in the translation catalogs.
- **The inbox above the ticket in one view:** with 5 to 8 tickets per chapter the list would push
  the ticket's text below the fold of a 45-column panel; two views keep the ticket at the top.
- **The inbox as a fourth side panel tab:** the inbox and the ticket are the same kind of work and
  share the ticket cable colour; a tab of its own would split them and break the tabs of ADR 0020.
- **Restarting a ticket the player leaves:** the owner chose to go on where they left it; a
  restart would throw away work and feel like failing, which ADR 0018 rules out.
- **Keeping every opened terminal mounted and hidden:** hidden terminals would keep measuring
  their width and hold a log each for screen readers to skip; one mounted terminal with its state
  kept is simpler.
- **Opening the next ticket automatically after solving:** the player would lose the explanation
  of the solved ticket; the row lets them read first and go on when they want.
- **Unlocking the next Story chapter only after its incident:** ADR 0017 ends every chapter with an
  incident, but the levels have no kind that marks it yet; all tickets of a chapter count until
  the story workshop (M4) adds side tickets.

## Consequences

- The save system (M3.7) stores the started and solved levels, the progress and the terminal state
  (or a checkpoint) of every opened ticket, and resumes the game at the ticket the player had open.
- Each opened ticket keeps its own game clock, which starts at the game's start time; M3.7 or the
  story workshop decides how game time runs across tickets.
- The extra goals (M3.5d) join the ticket panel and the inbox rows.
- Optional side tickets (M4) must not block the next chapter; `openChapters` then counts only the
  tickets that are not optional.
- The screenshot tests of M3.15 cover the inbox, the next ticket and the top bar with a chapter.
- A long game will have many rows; a later package may fold finished chapters.
