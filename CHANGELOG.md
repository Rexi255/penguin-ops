# Changelog

All player-visible changes are listed here, per version. Technical changes are in the git
history. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The game opens on a start screen with the PenguinOps logo, a main menu and the version. The
  menu has Play, Settings and Quit; Play has the keyboard focus, so Enter works at once. The game
  is in German when the system's language is German and in English otherwise, until you choose a
  language in the settings.
- Settings, in the main menu and in the pause menu, let you choose the language (your system's
  language, English or Deutsch) and switch fullscreen on and off. Every change applies at once
  and is remembered for the next start. Changing the language during a game asks first: your
  tickets then start again in the new language from their last checkpoint, and your progress is
  kept.
- The game starts in fullscreen, or in a window if you switched fullscreen off. F11 switches
  fullscreen on and off on every screen, and the settings remember it.
- The settings have a font size slider from 80 % to 200 %, which makes the whole interface
  larger or smaller, the terminal included, and a "Reduce motion" choice: like your system, on or
  off.
- Four colour schemes in the settings: the default one, Retro CRT (green phosphor on dark glass),
  Solarized (dark) and High contrast. A scheme applies at once to every screen and is remembered.
- Two optional effects for the terminal in the settings: a soft glow around its text and
  scanlines like an old monitor. Both are off by default, and "Reduce motion" turns them off.
- Play opens the save slot screen with three save slots. An empty slot starts a new game; a slot
  with a game shows your name, the mode, how many tickets you have solved, how long you have
  played and when you last played, and continues the game. Back or Esc returns to the start
  screen.
- The game saves itself: when a game starts, after every solved ticket, finished step, hint and
  ticket you open, when you go back to the main menu and when you close the window. A ticket with
  several steps continues after the last finished step; the terminal starts empty. If saving
  fails, the footer says so. A damaged save, or one from a newer version of PenguinOps, is
  shown as such and left alone.
- The button with three dots next to a slot opens its menu. Export saves the slot's game as a
  file wherever you choose, for a backup or another PC; Import loads such a file into the slot,
  after asking if it would replace a game. Delete removes the game after you confirm it.
- The game screen shows the workplace: a top bar, the side panel, the terminal and a footer
  with key hints. The side panel has the tabs Tickets, Mail and Handbook: click one, or press
  Shift+Tab in the terminal twice and switch with the arrow keys. Mail and the handbook are
  still empty. The footer shows "F1 Hint", "Tab Complete" and "Esc Menu".
- The Tickets tab shows the ticket you are working on: its title, its text and, for a ticket
  with several steps, one tape segment per step with "Step 1 of 2". When you finish a step or
  make a typical mistake, a message or a tip appears under the ticket in "Updates". A solved
  ticket says "Solved". The top bar always shows the ticket's title and its step or state.
- Stuck? Press F1 or click "F1 Hint" for a hint. Each press shows one more, up to three: a tip, a
  concrete tip and the solution. Hints are free, you keep typing in the terminal, and the Tickets
  tab comes to the front to show them.
- Type `help` in the terminal for an overview of the game commands, the keys and every command
  you can use, and `help ls` (or any other command) for what a command does. `hint` shows the
  ticket's next hint right in the terminal and in the Tickets tab; it counts together with F1.
- A solved ticket explains what you learned: a short explanation, useful variants of the command
  and a command to try.
- Some tickets have optional extra goals for bonus XP. The Tickets tab lists them under the
  ticket's text with their XP and whether you have reached them; reaching one, also after
  solving, adds "Extra goal reached" to the ticket's updates.
- The Tickets tab has an inbox: "Back to the inbox" lists the tickets of every open chapter with
  their state (New, In progress, Solved) and how many of each chapter you have solved. Click a
  ticket to work on it; a ticket you left goes on where you left it, terminal included. In Career
  mode the next chapter opens once every ticket of the chapter is solved; in Sandbox mode every
  chapter is open. A solved ticket offers the next one and says when it opened a new chapter.
  The top bar now also shows the chapter.
- The terminal works like bash on Debian: type commands after the prompt `you@itdesk:~$` and
  see their output. The first ticket's files are there. Up and Down bring back earlier
  commands, Tab completes commands and file names (twice lists the choices), Ctrl+C cancels
  the line, Ctrl+L clears the screen, Ctrl+A and Ctrl+E jump to the start and the end, and
  Shift+PageUp and Shift+PageDown scroll back. An open quote continues on the next line. When
  you use something the game does not simulate yet, a note in the terminal says what it was (the
  option, the variable or the shell feature, such as here strings `<<<`). Ctrl+V
  pastes, and Ctrl+C copies selected text. The prompt and the block cursor have the colours of Debian's
  terminal.
- A new game starts on the "New game" screen: type your name, and your Linux user name is
  filled in from it ("Jörg Müller" becomes `joerg-mueller`); you can change it. If a name
  cannot be used, the screen says why. Choose the mode on one of two cards, Career or Sandbox;
  the chosen card is framed in orange. The save slot then shows your name and the mode until
  you quit the game (saving comes later).
- Esc in the game, or a click on the "Esc Menu" hint, opens the pause menu: Continue (or Esc
  again) returns to the game, Settings opens the settings, Main menu returns to the start screen.
- The game ships its own fonts and works the same on Windows and Linux: Inter for the
  interface, JetBrains Mono for the terminal and Barlow Condensed for label tape. The start
  screen uses them; their licenses are in the installed app's `resources/licenses/fonts` folder.
- Windows installer wizard (choice of folder, desktop and Start menu shortcuts, uninstaller
  that keeps save games) and a Linux AppImage. No release has been published yet.
- PenguinOps logo and app icon: the installer, the app, its shortcuts and the AppImage show
  the penguin with the shell prompt instead of the default Electron icon. Its black and white
  match the game's terminal background and text colour.
