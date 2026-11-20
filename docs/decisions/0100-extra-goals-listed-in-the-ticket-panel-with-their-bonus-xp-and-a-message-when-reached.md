# 0100. Extra goals listed in the ticket panel with their bonus XP and a message when reached

- Status: Accepted
- Date: 2026-11-20
- Supersedes: –

## Context

ROADMAP M3.5d shows the extra goals in the ticket panel, the last part of M3.5. ADR 0018 makes
extra goals the source of bonus XP: optional goals that reward curiosity, never a condition for
solving. Every extra goal has an ID, a rule and its XP in `level.yaml` and a description
`extra_goals.<id>` in each catalog (ADR 0071, ADR 0075). The level session reaches each extra goal
once, also after the ticket is solved, and reports it as the game event `extra-goal` with the ID
and the XP (ADR 0077); until now the ticket's progress ignored that event (ADR 0097). The
descriptions of the prototype levels are written as tasks ("Back up its configuration too"), so
the player has to see them before reaching them. Open were whether extra goals are visible from
the start, where they appear, how a reached one is shown and announced, and whether the XP is
shown before ranks and XP exist (M3.12).

## Decision

- **Visible from the start.** A ticket with extra goals shows a section "Extra goals" right after
  the ticket's text, before the hints and the messages, because extra goals belong to the ticket
  like its text. It lists every extra goal in the level's order as a list item: the description,
  then a muted row with the bonus XP ("+20 XP") and the state in words, "Open" or "Reached". A
  reached one shows the solved icon before "Reached" in the colour of success, so the state never
  depends on colour alone. A ticket without extra goals has no such section.
- **Announced as a message.** Reaching an extra goal adds a message of the new kind `extra-goal`
  (ID and XP) to the ticket's messages, in the polite live region of the updates (ADR 0097). Its
  visible label "Extra goal reached" with the bonus XP stands above the description in the muted
  label type of the hints, because the description alone reads like a task; the solved icon comes
  first in the colour of success. The list of extra goals itself is not a live region, so each
  extra goal is announced once.
- **Progress.** `TicketProgress.reachedExtraGoals` keeps the IDs of the reached extra goals in the
  order reached; `applyGameEvents` adds the ID and the message for every `extra-goal` event, also
  after solving. The level session already reaches each extra goal only once.
- **Texts.** `ticketTexts` also formats the extra goals' descriptions (`extraGoals`, with English
  where a further language lacks one, ADR 0074), and `extraGoalText` gives one by its ID. The UI
  catalogs get `ticket.extra-goals`, `ticket.xp` (`+{xp} XP`), `ticket.extra-goal-open`,
  `ticket.extra-goal-reached` and `ticket.extra-goal-done`.
- **XP shown before it counts.** The bonus XP is shown as a promise; ranks and XP (M3.12) award it.

## Alternatives considered

- **Extra goals hidden until reached, as a surprise:** the descriptions are tasks, and a player
  cannot aim for a goal they never see; achievements (M3.12) are the place for surprises.
- **Extra goals after the explanation or only after solving:** a player who solves the ticket
  first would never know of them in time, and goals like "Clean up without touching the current
  log" only make sense while the ticket is open.
- **Announcing the change of the state ("Reached") in a live region on the list:** a screen
  reader would read "Reached" without the goal it belongs to.
- **Only the state in the list, no message:** the updates read like the ticket's history; a
  reached extra goal belongs there too, and it is the announced place.
- **The XP on yellow tape:** DESIGN.md keeps tape for XP segments of the rank (M3.12); a muted
  text keeps the optional goals quieter than the ticket.

## Consequences

- The save system (M3.7) has to keep `reachedExtraGoals` with the rest of the ticket's progress.
- Ranks and XP (M3.12) add the XP of the reached extra goals and may show them as toasts.
- The screenshot tests of M3.15 cover the ticket panel with open and reached extra goals.
