# 0110. Font size and reduce motion in the settings, and the other settings with their effects

- Status: Accepted
- Date: 2026-11-26
- Supersedes: –

## Context

ROADMAP M3.8c was to add the font size, reduce motion, the volume sliders, the colour scheme and
the effects to the settings screen of ADR 0109. ADR 0020 asks for a scalable font size and a
"reduce motion" setting that turns off animations and effects. ADR 0108 defined every setting in
the settings format already, but also decided that the settings screens offer a value only when
it works. The sounds come with M3.10, the colour schemes other than the default and the effects
with M3.9.

Every size of the design is written in rem on the grid of the terminal's character cell
(ADR 0082, ADR 0085), and the terminal measures its cell in the page. The game screen's side
panel is 45 columns wide (DESIGN.md), and the smallest window is 960 × 600 px. tokens.css set
every motion duration to 0 ms under `prefers-reduced-motion: reduce`.

## Decision

- **M3.8c offers the font size and reduce motion.** The volume sliders join the settings with
  the sounds in M3.10, the colour schemes and the effects with M3.9, each when it takes effect.
  The owner agreed to this change of the work packages.
- **Font size.** A slider from 80 to 200 percent in steps of 10, in the Display group, with its
  value written out next to its label ("120%", "120 %") and as `aria-valuetext`. The setting sets
  the root element's font size in percent (none at 100 percent), so that every rem of the design
  grows with it, the terminal's character cell included, like a zoom of the interface. It applies
  before the page is painted.
- **The game screen at large font sizes.** The side panel is 45 columns wide but at most 45 % of
  the window, so that the terminal keeps a useful width; at the default font size, 45 columns
  always fit and nothing changes. The side panel's tabs wrap into further rows when they no longer
  fit side by side.
- **Reduce motion.** Three choices: like the system (the default), on and off. The setting is the
  root element's `data-reduce-motion` attribute. tokens.css sets every motion duration to 0 ms for
  `on`, and for the system's `prefers-reduced-motion: reduce` unless the attribute is `off`. A
  page without the attribute, such as the styleguide, follows the system. M3.9 turns the effects
  off the same way.

## Alternatives considered

- **Offer every setting of the format in M3.8c, with notes that the volumes, schemes and effects
  work later:** the player would move sliders that change nothing, which ADR 0108 rules out.
- **Scale only the text sizes, not the layout:** the type scale and the spacing are built on the
  same cell, so text would no longer line up with the terminal's lines and the spacing scale.
- **Electron's zoom (`webContents.setZoomFactor`):** the same effect for the layout, but it
  needs a new desktop API; a root font size stays in the renderer and is tested in jsdom and the
  browser.
- **Fixed steps such as small, normal, large:** fewer choices, but the slider covers the whole
  range of the settings format with the same keyboard operation.
- **A media query for reduce motion only, setting a class for `on`:** the setting `off` could
  not override the system's setting.

## Consequences

- The colour schemes (M3.9) and the volumes (M3.10) add their controls to the same settings
  form.
- At 200 percent in a small window the game screen is cramped: the side panel's tabs take
  several rows and the terminal has about 27 columns. A layout for large font sizes in small
  windows is part of the accessibility work of M3.14.
- The screenshot tests of M3.15 should cover a large font size.
