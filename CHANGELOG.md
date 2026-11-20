# Changelog

All player-visible changes are listed here, per version. Technical changes are in the git
history. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The game opens on a start screen with the PenguinOps logo, a main menu and the version. The
  menu has Play and Quit; Play has the keyboard focus, so Enter works at once. The game is in
  German when the system's language is German and in English otherwise.
- Play opens the save slot screen with three save slots. They are all empty until saving
  exists; choosing one starts a new game. Back or Esc returns to the start screen.
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
- A solved ticket explains what you learned: a short explanation, useful variants of the command
  and a command to try.
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
  you use something the game does not simulate yet, a note in the terminal says so. Ctrl+V
  pastes, and Ctrl+C copies selected text.
- A new game starts on the "New game" screen: type your name, and your Linux user name is
  filled in from it ("Jörg Müller" becomes `joerg-mueller`); you can change it. If a name
  cannot be used, the screen says why. Choose the mode on one of two cards, Career or Sandbox;
  the chosen card is framed in orange. The save slot then shows your name and the mode until
  you quit the game (saving comes later).
- Esc in the game, or a click on the "Esc Menu" hint, opens the pause menu: Continue (or Esc
  again) returns to the game, Main menu returns to the start screen.
- The game ships its own fonts and works the same on Windows and Linux: Inter for the
  interface, JetBrains Mono for the terminal and Barlow Condensed for label tape. The start
  screen uses them; their licenses are in the installed app's `resources/licenses/fonts` folder.
- Windows installer wizard (choice of folder, desktop and Start menu shortcuts, uninstaller
  that keeps save games) and a Linux AppImage. No release has been published yet.
- PenguinOps logo and app icon: the installer, the app, its shortcuts and the AppImage show
  the penguin with the shell prompt instead of the default Electron icon. Its black and white
  match the game's terminal background and text colour.
