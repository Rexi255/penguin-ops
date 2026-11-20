# 0106. Saving and resuming games with autosave, slot details and a slot menu

- Status: Accepted
- Date: 2026-11-20
- Supersedes: –

## Context

ADR 0013 decided autosave after every solved ticket, after every completed step and on exit, and
that a ticket resumes at its checkpoint. ADR 0104 fixed the save format and left to M3.7c how the
game is built from a save, what happens when an update removed a level, a step or an extra goal,
and what the game does when the content's worlds now reserve a save's user name. ADR 0105 stores
the files as texts in the main process. Until now the game screen started every game from the
first ticket and the slots lived only in memory.

The slot screen also needs a way to remove a game, so that a player can start over without
exporting (ADR 0013), and it has to show slots whose save the game cannot play. The owner chose
the deletion with a confirmation, locked slots that leave the file alone, and a menu behind a
button with three dots next to each slot instead of separate buttons.

## Decision

- **Reading the slots.** At start the renderer reads every slot's save and backup
  (`apps/ui/src/saves/save-slots.ts`). It uses the save when it can be read. A save that a newer
  game wrote locks the slot and the backup is never used for it. Otherwise a readable backup is
  used and restored as the save (`restoreBackup`); a save of an older format version is written
  again in the current one. A slot whose files are missing is empty; one whose files cannot be
  read is locked as damaged. If the slots cannot be read at all, every slot is shown as damaged,
  so that no new game is written over a save that may be fine.
- **Fitting a save to the content.** `fitSaveToContent` (gameplay) drops tickets whose level is no
  longer in a chapter, checkpoints that are no longer a step of their level, and reached extra
  goals that their level no longer has; a solved ticket with steps gets its last step as the
  checkpoint. A current ticket that was dropped or is not open becomes the first unsolved ticket
  of the open chapters, or the first open ticket. A save whose user name the content's worlds now
  reserve locks the slot ("user-name-taken"); the player can still delete it.
- **Resuming.** `resumeTicket` (gameplay) starts a ticket at its checkpoint, solved if it was
  solved and with the extra goals the player had reached. The game screen gets the fitted save:
  it rebuilds every ticket's progress (completed steps from the checkpoint, the messages of the
  completed steps and the reached extra goals, the hints shown) and resumes the current ticket.
  A ticket of the save that the player opens later is resumed the same way. The terminal starts
  empty; tips are not saved.
- **One game time.** The game screen keeps one game time for the game (ADR 0104): it starts at the
  save's game time, every resumed or new ticket starts its clock there, a terminal the player
  comes back to goes on from the game time, and the game time is the latest time of any terminal.
  Replaying a checkpoint moves it on.
- **Autosave.** The game screen reports the game (game time, current ticket, ticket records)
  whenever it changes. A change of the progress (step, solved, hint, extra goal) or of the open
  ticket asks for an autosave, the first one when the game appears; a game time that only moved
  on is kept for the next save. The app root saves a new game when it starts, every autosave,
  when the player leaves the game for the main menu and before the window closes. Saves are
  written one after the other.
- **Play time and last played.** The app root takes the real time from an injected clock. Each
  save adds the real time since the game screen appeared to the play time the save had then, and
  sets "last played" to the real time.
- **Saving on exit.** The main process holds every close of the window back
  (`apps/desktop/src/main/close-guard.ts`), asks the page to get ready (`app:close-requested`)
  and closes the window when the page answers (`app:close-ready`) or after five seconds. The
  page's close handler (`DesktopApi.setCloseHandler`) saves the game being played and waits for
  every save.
- **A failed save** is logged; the game screen's footer shows an alert ("Not saved: …") until a
  save works again.
- **Slot details.** A slot with a game shows the player's name and the mode, and below them the
  number of solved tickets, the play time in hours and minutes and the date and time last played
  in the player's language (`Intl.DateTimeFormat`). The details describe the slot's button; its
  name stays the visible "Slot 1 Max · Career". A locked slot says why and has
  `aria-disabled="true"`.
- **Slot menu.** Every slot has a button with three dots (the new icon `more`) next to it that
  opens the slot's menu after the WAI-ARIA menu button pattern: Enter, Space or Down open it on the
  first entry, Up on the last; Up, Down, Home and End move and wrap; Esc closes it and returns the
  focus without leaving the screen; Tab and a click outside close it. A slot with a save, playable
  or locked, has the entry Delete; Export and Import are ADR 0107.
- **Deleting** asks first in a modal alert dialog ("Delete slot 1?") that names the player's game;
  Cancel has the focus and Esc cancels. After deleting, the slot is empty, a status message says
  so and the slot has the focus; a failed deletion keeps the slot and says that it could not be
  deleted.

## Alternatives considered

- **Restart every ticket from the beginning:** simpler, but ADR 0013 promises checkpoints for
  multi-step tickets.
- **Refuse a save that does not fit the content:** an update that removes one level would lock a
  player out of the whole game; fitting keeps everything that still exists.
- **Let the player pick a new user name when the worlds now reserve the old one:** friendlier, but
  it needs its own screen for a case that cannot happen before the first release; deleting or a
  later work package covers it.
- **Autosave after every input:** it would also save the game time of every command, but writes a
  file for every keystroke that runs; the game time is saved with the next autosave and on exit.
- **Save on `beforeunload` in the page:** the page cannot wait for an IPC answer there; the close
  guard in the main process can.
- **Separate Delete, Export and Import buttons next to each slot:** more visible, but the owner
  preferred one menu, which keeps the slot list calm and has room for more actions.
- **Use the backup when the save is too new:** it would silently replace the newer game with an
  older one when the player starts an older version of the game.

## Consequences

- ADR 0107 adds Export and Import to the slot menu; an import into a slot with a save asks first.
- The game time moves on a little every time a ticket is resumed at a checkpoint, because the
  replay runs its inputs.
- The play time counts the time the game screen is shown, also while the pause menu is open.
- The slot screen has no screenshot tests yet (M3.15).
