---
paths:
  - "apps/**"
---

# Rules for the UI and the desktop app

Reasons: ADR 0014, 0015, 0020.

## Texts

- No hard-coded player-facing strings. Every text comes from `content/ui/<lang>.yaml` (German
  and English both required) or from level catalogs.

## Accessibility

- Everything is reachable and usable with the keyboard alone, with a visible focus.
- Every control has an accessible name; dynamic regions (terminal output, toasts) are
  announced appropriately.
- Contrast meets WCAG AA in every colour scheme. Information is never conveyed by colour
  alone.
- Respect the "reduce motion" setting: no animations or effects when it is on.

## Visual tests

- Use the design tokens (CSS variables) of the colour schemes; no ad-hoc colours.
- Every new screen or visible state gets screenshot tests in both languages and all colour
  schemes.
- Screenshots must be deterministic: bundled fonts, fixed game clock, animations off in test
  mode.
- Update approved screenshots only for intentional changes, with before/after images in the
  pull request description.

## Keys and sound

- Terminal keys behave like bash (Tab, arrow keys, Ctrl+C, Ctrl+L, Ctrl+A/E). Game functions
  use F-keys and Esc. Never capture keys the terminal needs.
- UI sounds are generated with the Web Audio API and respect the volume settings. Audio files
  need a license check first.

## Electron security

- Keep the security baseline: context isolation, sandbox, no Node integration in the
  renderer, strict Content Security Policy, no remote content, no network requests.
- Every native capability is a typed preload function whose inputs are validated in the main
  process. Never open external URLs from game content.
- Use Electron APIs (`app.getPath`) for file locations; never hard-code paths. Windows is the
  primary platform.
