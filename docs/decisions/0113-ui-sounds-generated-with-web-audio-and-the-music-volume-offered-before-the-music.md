# 0113. UI sounds generated with Web Audio, and the music volume offered before the music

- Status: Accepted
- Date: 2026-11-27
- Supersedes: [0108](0108-settings-file-read-setting-by-setting-with-defaults-and-stored-atomically-without-a-backup.md)
  (only the rule that a setting is offered once it takes effect, as far as the music volume goes)

## Context

ROADMAP M3.10 asks for UI sounds via the Web Audio API with the volume sliders master, music and
effects in the settings. ADR 0020 chose UI sounds generated in code (notification, success,
subtle clicks) without sound files, and calm background music later, from CC0 or CC-BY 4.0
sources that the owner chooses. The settings format of ADR 0108 holds the three volumes already
(default: master 80, music 50, effects 80) and ADR 0108 said that the settings screens offer a
value only when it takes effect. ADR 0095 left the bell of the terminal silent until M3.10.

Claude cannot listen to sounds, so the sounds must be described precisely enough to be tested as
data, and kept quiet and short so that a poor choice does no harm before the owner hears them.
The terminal must stay usable for long typing sessions, and Electron's default autoplay policy
lets a page play sound without a user gesture.

## Decision

- **Sounds generated in code.** `apps/ui/src/sounds/ui-sounds.ts` describes four sounds as
  recipes of tones (oscillator shape, pitch, start, duration, attack, peak): `click`,
  `notification` (two tones a fourth apart), `goal` (three rising tones of a major chord) and
  `solved` (a rising major chord that ends on the octave). Every sound is shorter than a second,
  the click at most 50 ms, the pitches lie between 200 and 2000 Hz, overlapping tones peak at
  0.5 at most, and a bigger moment has a longer sound. Tests check this.
- **The player.** `createSoundPlayer` builds each tone as an oscillator with a gain envelope on
  a Web Audio context that opens with the first sound heard and resumes when it is suspended.
  The gain is `(master/100 × effects/100)²`, so that the sliders feel even to the ear; at 0 the
  player opens no context at all. A click within 50 ms of the last click heard is skipped, so
  that a dragged slider does not buzz. A context that cannot open leaves the game silent and a
  failing sound is only logged: sounds never stop the game.
- **When the game sounds.** The owner chose the sounds of a solved ticket, of clicks in menus and
  of notifications. The game screen compares the open ticket's progress before and after each
  change and plays the biggest moment: `solved`, else `goal` for a reached extra goal, else
  `notification` for a completed step, a new message (step or tip) or a new hint (F1, its key
  hint or the game command `hint`). Opening a ticket, resuming a game and restarting it in
  another language are silent, and so is F1 after the last hint.
- **Clicks.** The app root listens on the document for `click`, `change` and `input` events and
  plays `click` for a pressed enabled button, a changed radio button or checkbox and a step of a
  slider. Its listeners run after React's, and it reads the volumes from the latest settings
  (`SettingsKeeper.current`), so that a volume slider clicks at its new volume and the player
  hears what they set. Typing in the terminal and in text fields is silent.
- **The terminal's bell stays silent.** The owner did not choose a bell sound; a completion
  without a match keeps making no sound.
- **The volumes in the settings.** A group "Sound" at the end of the settings form holds three
  sliders, master volume, music and sound effects, from 0 to 100 in steps of 5, with the value
  written out like the font size. The owner chose to offer the music volume now, before there is
  any music: its slider has a help line that says there is no music yet and that its volume
  applies once the music arrives. This replaces, for the music volume only, the rule of ADR 0108
  that a setting is offered only once it takes effect. The UI sounds follow the master and
  effects volumes; the music volume is stored for the music.
- **"Reduce motion" does not mute sounds.** Sounds are not motion; the volumes control them.

## Alternatives considered

- **Sound files (CC0) instead of generated sounds:** a richer sound, but every file needs a
  license check and a choice by the owner, and ADR 0020 chose generated sounds for the MVP.
- **Offer the music slider only with the music:** keeps the rule of ADR 0108, but the owner
  preferred the complete set of sliders now, with a help line that says so.
- **Explicit sound calls in every button's handler:** precise, but every screen would need its
  own calls and a new control could easily forget them; the listener on the document covers every
  control the same way.
- **Clicks on `click` events for radio buttons and checkboxes:** a click on a label clicks its
  control too, and arrow keys change a radio group without a click on the label; their `change`
  event fires exactly once for each change.
- **A linear volume curve:** the lower half of the slider would sound almost as loud as the top.
- **A sound for the terminal's bell:** like bash in a terminal, but a beep at every ambiguous Tab
  is easily annoying; the owner did not choose it.
- **A sound for a new ticket in the inbox:** it opens with the solved ticket, whose fanfare
  already marks the moment.

## Consequences

- The settings form offers every setting of the format. The music (ADR 0020) plays at
  `(master/100 × music/100)²` when it comes and needs no change of the settings.
- The owner hears the sounds for the first time on Windows; their recipes may need tuning after
  that, which changes only the data in `ui-sounds.ts`.
- New controls click without code of their own; a control that must stay silent needs a change
  of `controlSound`.
- The end-to-end tests do not check that a sound is heard, only that the sliders work and are
  stored; the player's behaviour is tested with a stand-in for the audio context.
- The screenshot tests of M3.15 cover the settings with the Sound group.
