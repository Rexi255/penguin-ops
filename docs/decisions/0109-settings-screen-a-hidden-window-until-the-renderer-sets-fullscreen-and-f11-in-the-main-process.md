# 0109. Settings screen, a hidden window until the renderer sets fullscreen, and F11 in the main process

- Status: Accepted
- Date: 2026-11-26
- Supersedes: –

## Context

ROADMAP M3.8b adds the settings screen with the language and fullscreen. ADR 0020 reaches the
settings from the main menu and the pause menu, starts the game in fullscreen and lets F11 or
the settings toggle it. ADR 0012 restarts the ticket after a confirmation when the language
changes during a ticket, so that the translated files stay consistent. ADR 0108 left two
questions open: when the settings file is written, and how the window learns the fullscreen
setting, which only the renderer can read, before the player sees it.

Electron's default application menu, which the app keeps, toggles fullscreen on F11 in its View
menu. The window manager of the system can change fullscreen too.

## Decision

- **Where the settings are.** The start screen's menu gets the entry Settings between Play and
  Quit; it opens a settings screen. The pause menu gets Settings between Continue and Main menu;
  it opens a settings dialog in place of the pause menu, over the inert game. Both show the same
  settings form. Back and Esc return to the menu they came from, with the focus on its Settings
  entry. The chosen language's radio button has the focus when the settings appear.
- **What M3.8b offers.** The language (the system's language, English, Deutsch) and fullscreen.
  Each language is named in itself, as language choices usually are; the system's language names
  the language it gives in the player's language, such as "System language (German)".
- **Every change is written at once.** A change takes effect immediately and the whole settings
  file is written right away (ADR 0108), one write after the other, so that the latest change
  wins. A change that changes nothing writes nothing. A write that fails is logged, and the
  settings form shows an alert until a write works again; the settings still apply until the game
  closes.
- **The language.** Outside a game, a new language applies at once: the app creates the UI texts
  of the new language and sets the page's `lang`. In the game, a language setting that changes the
  game's language asks first ("Switch the language?", Cancel focused). Confirmed, the game is
  saved and started again in the new language from the save: every ticket goes on from its
  checkpoint (ADR 0104, ADR 0106), and the open ticket's terminal has the focus. A language
  setting that keeps the game's language, such as the system's language when it is the language
  being played, changes without a question.
- **The window starts hidden** and appears with the first fullscreen request of the renderer,
  which the app sends once it has read the settings and rendered its first screen; the window is
  set to fullscreen or not before it shows, so the player never sees it switch. A renderer that
  never asks shows the window 5 seconds after its first paint (`SHOW_TIMEOUT`), so that a broken
  page still appears. The main process needs no part of the settings format.
- **F11 belongs to the main process.** Electron's `before-input-event` catches F11 without
  modifiers before the page and the application menu see it, on every screen and in every dialog.
  It toggles fullscreen and reports the new state to the renderer; held down, F11 toggles once.
  The main process keeps the state it last set or that the window manager reported, so that F11
  toggles correctly where the window manager reports nothing.
- **Changes by the system are reported too.** The window's `enter-full-screen` and
  `leave-full-screen` events go to the renderer, which stores the state in the settings without
  sending it back to the window.
- **The desktop API** gets `display` with `setFullscreen(on)`, which the main process validates
  (only a boolean, only from the app's own page), and `setFullscreenListener(listener)`, which
  replaces the listener before, like `setCloseHandler`.

## Alternatives considered

- **Read the fullscreen setting in the main process before the window is created:** the window
  could be created in the right mode, but the main process would parse the settings format,
  which belongs to the gameplay package that `apps/desktop` may not import (ADR 0006, ADR 0033),
  or duplicate a part of it.
- **Show the window at once and switch to fullscreen later:** the player would see a window that
  jumps to fullscreen at every start.
- **Handle F11 in the renderer:** the key would only work while the page has the focus, the
  default menu would toggle fullscreen a second time, and every screen and dialog would need to
  let it through.
- **Remove the application menu:** would remove the menu's F11 as well, but also its other
  shortcuts; that is a decision of its own, outside this work package.
- **Ask before every language change:** outside a game no ticket restarts, and a question there
  would only slow the player down.
- **Keep the settings dialog open after a restart in a new language:** the game screen starts
  again, so the dialog would have to be restored over a new game; returning to the game with the
  terminal focused is what the player wants after the question.

## Consequences

- M3.8c adds its settings to the same form; they take effect the same way and need no new
  desktop API.
- The window stays hidden for the time the renderer needs to read the content, the settings and
  the save slots; the background colour of the window stays as before.
- The default application menu still holds its other shortcuts; whether the game keeps it is
  open (ROADMAP ideas).
- A failed write of the settings costs the player only the settings after the game closes, which
  the alert says.
