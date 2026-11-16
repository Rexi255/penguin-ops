# 0020. UI: workplace layout, style, audio and accessibility

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The game should feel like a real game and like an IT workplace, stay clear for beginners,
be testable with screenshots, and be usable without a mouse.

## Decision

**Layout: workplace layout with fixed areas**

```
┌──────────────────────────────────────────────────────────────┐
│ Week 1 · Monday           Intern [####------] 340 XP         │
├──────────────────────────────────────────────────────────────┤
│ Tickets│Mail│Handbook│ user@host:~$ cat tickets/handover.txt │
│ ─────────────────────│ ...                                   │
│ #1002 Printer floor 2│ user@host:~$ _                        │
│ [Hint 1/3]           │                                       │
├──────────────────────────────────────────────────────────────┤
│ F1 Hint · F2 Handbook · Tab Complete · Esc Menu              │
└──────────────────────────────────────────────────────────────┘
```

- The terminal is always large and visible. A side panel has tabs (Tickets, Mail, Handbook;
  later e.g. a network map). A top bar shows in-game day and progress; a footer shows key
  hints. Full-screen programs (`nano`, `less`, `top`) take over the terminal area.

**Flow and details**

- Start screen → save slot screen (three slots; new game asks for name and mode) → game.
  Esc opens the pause menu (continue, settings, handbook, save and quit).
- Fullscreen on first start; F11 or settings toggle it.
- Onboarding: chapter 0 is the tutorial; the trainer introduces the UI step by step; short
  first-time tooltips; no separate tutorial screen.
- Keys: the terminal behaves like bash (Tab, arrow keys, Ctrl+C, Ctrl+L, Ctrl+A/E, later
  Ctrl+R). Game functions use F-keys and Esc (F1 hint, F2 handbook, …), shown in the footer.
- Handbook: every learned command with a translated explanation, options table and examples;
  searchable; grows as the player learns.
- Notifications (new mail, new ticket) appear as small toasts and never interrupt typing.

**Visual style**

- Modern dark base (like the prototype), plus selectable terminal colour schemes (default,
  retro CRT, Solarized, high contrast) and optional effects (glow, scanlines).
- Fonts: JetBrains Mono (terminal) and Inter (UI), bundled for offline use, SIL OFL 1.1.

**Audio**

- MVP: UI sounds (notification, success, subtle clicks) generated in code with the Web Audio
  API; no asset files.
- Later: calm background music (lo-fi or office ambient) from CC0 or CC-BY 4.0 sources with an
  in-game credits screen. Claude cannot listen: Claude pre-filters license-safe candidates and
  the owner chooses the tracks.
- Separate volume sliders (master, music, effects).

**Accessibility (basic level)**

- Full keyboard control, scalable font size, "reduce motion" (turns off animations and
  effects), high-contrast scheme, information never conveyed by colour alone.
- Automated accessibility checks (axe-core) in the test suite.
- Screen reader support is a later milestone, once the UI is stable.

## Alternatives considered

- **Fixed split like the prototype (ticket left, terminal right):** clear, but feels like a
  learning app; mail and handbook have no natural place.
- **Fake desktop with free-floating windows:** most immersive, but overlapping windows confuse
  beginners, window management is costly and screenshots become unreliable.
- **Retro CRT only:** atmospheric but tiring to read and bad for accessibility.
- **Screen reader support from the start:** a terminal with full-screen programs is hard to
  make accessible while the UI still changes.

## Consequences

- Every colour scheme and main screen is covered by screenshot tests in both languages.
- Music needs the owner's time to choose tracks.
