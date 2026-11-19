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
- The game screen shows the workplace: a top bar, the side panel, the terminal area and a
  footer with key hints. The areas are still empty; the terminal, tickets and mail come next.
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
