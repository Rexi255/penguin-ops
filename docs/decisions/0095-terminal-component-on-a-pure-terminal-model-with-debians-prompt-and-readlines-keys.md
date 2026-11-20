# 0095. Terminal component on a pure terminal model with Debian's prompt and readline's keys

- Status: Accepted; partly superseded by
  [0101](0101-terminal-cursor-in-the-terminals-text-colour-like-gnome-terminal.md) (the colour of
  the terminal's cursor) and [0102](0102-a-text-of-its-own-for-every-game-notice.md) (the general
  text of game notices)
- Date: 2026-11-19
- Supersedes: [0094](0094-new-game-screen-with-choice-cards-and-games-kept-in-memory-until-the-save-system.md)
  (only the uses of fibre orange)

## Context

ROADMAP M3.3 adds the terminal to the game screen: the input line, coloured output, history,
Tab completion, Ctrl+C, Ctrl+L, Ctrl+A and Ctrl+E, and the scrollback. The engine already
computes completion (ADR 0065) and history navigation (ADR 0066), and the level session runs
complete inputs and reports incomplete ones (ADR 0077); both leave the keys and the screen to the
UI. ADR 0020 says the terminal behaves like bash, ADR 0056 makes the game's terminal an
`xterm-256color`, and ADR 0094 and `DESIGN.md` give the player's prompt and cursor the colour
fibre orange.
ADR 0092 left the focus on the game screen's menu key hint until the terminal takes it. Open were:
whether to build the terminal on a terminal emulator library or as an own component, what the
prompt shows, which keys the game simulates and how they reach the terminal on a Windows
keyboard, how clearing the screen and the scrollback work in a scrolling page, how game notices
look before ROADMAP M3.6 gives each its own text, and which level the terminal plays before the
campaign (M3.5) and the save system (M3.7) exist. The owner agreed to an own React component, to
the first level of the content and to one general notice text until M3.6. A first build drew the
prompt in fibre orange; the owner chose Debian's colours instead.

## Decision

- **An own React component on a pure model.** `apps/ui/src/terminal/terminal-model.ts` holds
  the whole state of a terminal as an immutable value: the level session, the game time, the
  screen (finished lines, the start of the page, the partial line), the input line and its
  cursor, the earlier lines of an incomplete input, the history navigation, whether the last
  key was a Tab without a change, and readline's question. Every key is a pure function from
  state to state. The game clock is created from the stored time for each input, so the model
  has no mutable state and runs twice under React's strict mode without side effects.
  `apps/ui/src/terminal/terminal.tsx` stores states and draws them; it is the only part that
  touches the DOM. No terminal emulator library (xterm.js) is used.
- **Prompt.** The new engine module `packages/engine/src/prompt.ts` gives the parts of Debian
  13's colour prompt `\u@\h:\w\$ `: `\w` from `PWD` (or the working directory if `PWD` is
  unset), shortened like bash's `polite_directory_format` (a `HOME` longer than one character
  becomes `~`), and `#` for user ID 0. Debian draws `user@host` and the directory in bold green
  and bold blue (`01;32` and `01;34`), the `:` and the sign in the default colour; the game does
  the same with the new tokens `prompt-user` (`#8ae234`) and `prompt-directory` (`#729fcf`), the
  bright Tango colours that GNOME Terminal shows for bold text. Tango's plain blue `#3465a4`
  would have only about 3:1 contrast on the terminal ground. Fibre orange is no longer a colour
  of the prompt; it stays on the cursor, the active ticket, the current step and the chosen
  choice card (this replaces the uses of fibre orange of ADR 0094). The continuation prompt is
  bash's default `PS2`, `> `. Changing `PS1`, `PS2` and `PROMPT_DIRTRIM` is not simulated. The gameplay package adds `levelPrompt`,
  `completeInput` (completion with the simulated commands as `COMMAND_NAMES`) and
  `interruptLevelInput`.
- **Output.** Standard output and standard error look the same, as in a real terminal. A line
  breaks at the last cell that fits, not between words. Tabs are laid out by the screen with tab
  stops every 8 cells. The bell makes no mark; other C0 control characters and DEL are shown in
  caret notation (`^[`, `^M`, `^?`), like readline shows them in the input line. Escape
  sequences and carriage returns are not interpreted yet. Output without a final line break
  (`echo -n`) leaves a partial line, and the next prompt follows it on the same line. The
  terminal's width in columns is the width of its page divided by the measured width of one
  cell of the monospace face, and follows the size of the window and the loaded font; 80 when it
  cannot be measured.
- **Game notices.** The events `unsupported`, `notice` and `syntax-unsupported` show one line
  in the UI face with the hint icon and the text `terminal.notice` ("PenguinOps does not
  simulate this yet, so the input stopped here."). A partial line is finished first. ROADMAP
  M3.6 gives each kind its own text; the screen keeps the whole event for that.
- **Keys.** `apps/ui/src/terminal/terminal-keys.ts` maps a key press to an action: Enter runs
  the line; Backspace and Delete delete; Left, Right, Home, End, Ctrl+A and Ctrl+E move the
  cursor by one character (a surrogate pair counts as one); Up and Down are readline's history
  keys; Tab completes, and a Tab right after a Tab that left the line unchanged lists the
  matches below the line and shows the prompt and the line again, after readline's question
  `Display all N possibilities? (y or n)` from 100 matches on (y, Y or space list; n, N or
  Backspace do not; other keys wait); Ctrl+C echoes `^C`, drops the line and an incomplete
  input and sets the exit status to 130 (bash's `throw_to_top_level`); Ctrl+L clears the screen
  and draws the prompt and the line at the top; Shift+PageUp and Shift+PageDown scroll by a
  page. Every other Ctrl+letter is swallowed, so that readline keys the game does not simulate
  yet (Ctrl+W, Ctrl+R, Ctrl+U, Ctrl+D) change nothing and do not reach Electron's default menu,
  whose Ctrl+W closes and Ctrl+R reloads the window. Left to the browser and the game screen:
  Esc and the F-keys (the game's functions), Shift+Tab (so the focus can leave the terminal for
  the footer), Ctrl+V and Ctrl+Shift+V (paste, as in Windows Terminal, instead of readline's
  `quoted-insert`), and every combination with Alt or Meta. With text selected, Ctrl+C copies
  it instead of interrupting, as in Windows Terminal.
- **Typing.** The player types into a transparent text field that lies on the cursor. Typed
  text is taken from its input events, never from key codes, so dead keys, AltGr (which Windows
  reports as Ctrl+Alt) and input methods work on every keyboard layout; text of a composition is
  taken when the composition ends. A paste keeps its line breaks (`\r\n` and `\r` become `\n`) in
  the line, as with bash's bracketed paste, and Enter runs it all. A click into the terminal
  puts the focus back into the input line, unless the player selected text.
- **Screen and scrollback.** The terminal is a scrolling log (`role="log"`, named
  `terminal.output`); the input line inside it is not announced. The page after the last
  screen clear is at least as high as the terminal, so a clear moves the prompt to the top and
  the lines before stay in the scrollback above it, like `clear -x` in a terminal emulator that
  keeps cleared lines. `clear` without `-x` empties the scrollback too. Every change scrolls to
  the bottom. The terminal keeps the newest 10,000 lines, the default of GNOME Terminal on
  Debian. The cursor is a fibre orange block that does not blink (the One Motion Rule); without
  the focus only its frame remains. The character under it has the terminal ground's colour, a
  new contrast pair.
- **Focus and level.** The game screen gives the terminal's input line (`terminal.input`) the
  focus when it appears and when the pause menu closes, as ADR 0092 planned. Until the campaign
  and the save system exist, the game screen starts the first level of the first chapter
  (`startingLevelId`) for the slot's player at `GAME_START_TIME` (Monday, 2026-01-05, 08:00
  UTC, which the reference solutions now use too), built with `levelSetup`, and starts it again
  whenever the game screen appears. Game events (solved, steps, tips) are not shown yet (M3.5).
- **Not simulated yet:** the bell's sound (M3.10), the list pager `--More--` for lists longer
  than the screen, readline's other keys (Ctrl+U, Ctrl+K, Ctrl+W, Ctrl+Y, Ctrl+D, Ctrl+R,
  Ctrl+B and Ctrl+F, Ctrl+P and Ctrl+N, word movement with Alt or Ctrl and the arrows), Ctrl+G
  in readline's question, escape sequences and carriage returns in the output, and a screen
  reader reading of the input line. Behaviour not measured on a real Debian 13 is marked
  `@differential` in the tests (Ctrl+C while readline asks its question).

## Alternatives considered

- **xterm.js:** a complete terminal emulator under the MIT license, used by VS Code. It expects a
  byte stream with escape sequences from a pseudo terminal and draws into its own canvas or
  DOM, so the game would have to turn its structured events back into escape sequences, game
  notices could not use the UI face and icons, the design tokens would need a mapping to its
  theme, and Testing Library could not read its screen. Its accessibility mode is separate from
  the drawn text. The game needs a small part of an emulator and full control over the drawing.
- **Taking typed characters from key events:** simpler, but `event.key` is `Dead` for a dead
  key, AltGr characters arrive with Ctrl and Alt pressed, and input methods give no single key.
  A German keyboard could not type `^`, `~` or `|` reliably.
- **The prompt in fibre orange:** the first build followed the Fibre Rule, which made the
  prompt the player's own place. The owner preferred the colours of the real Debian system, which
  players see again when they work on a real machine; the green stays on `user@host` and is not
  the green-on-black costume `DESIGN.md` refuses.
- **The plain Tango or xterm colours:** Tango's blue `#3465a4` and xterm's `#0000ee` fail the
  4.5:1 contrast of WCAG AA on the terminal ground.
- **Removing Electron's default menu instead of swallowing Ctrl keys:** it would also stop the
  menu keys outside the terminal, but it is a change of the desktop app beyond this work package
  and would not keep readline keys that the game does not simulate from reaching the text field
  (Ctrl+A would select all, Ctrl+Z would undo). Both may still happen later.
- **Keeping the terminal's state per slot until the save system:** the save system restores a
  level at its checkpoint and does not keep the screen either (ADR 0013), so keeping more now
  would be thrown away in M3.7.

## Consequences

- The terminal's behaviour is tested without a DOM in the model's tests; the component tests
  only check the drawing and the key mapping, and the end-to-end tests check typing, Tab,
  Ctrl+C, Ctrl+L and scrolling in the real app.
- Keys sent through Playwright never reach Electron's menu, so no test shows that Ctrl+W and
  Ctrl+R stay in the terminal. The owner checked them by hand on Windows: neither closes nor
  reloads the window.
- M3.5 shows the game events of an input; M3.6 replaces the general notice text; M3.10 makes the
  bell audible; M3.9's colour schemes need the new tokens and contrast pairs. The other readline keys, the
  list pager and the interpretation of escape sequences are ideas in `docs/ROADMAP.md`.
