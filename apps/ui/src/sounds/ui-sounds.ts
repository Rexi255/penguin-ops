// The UI sounds (ROADMAP M3.10, ADR 0020, ADR 0113): every sound is a short list of tones that the
// sound player builds with the Web Audio API, so that the game ships no sound files. A tone is an
// oscillator with an envelope: it rises from silence to its peak in `attack` seconds and fades
// away until it ends. The recipes are data, so that their tests check their length, their pitch
// and their loudness without a browser that plays them.
//
// The sounds are quiet and short, so that they never get in the way of typing: a click for the
// controls of the menus and dialogs, a notification when the ticket panel shows something new, a
// rising figure for a reached extra goal and a small fanfare for a solved ticket.

/** The UI sounds, from the smallest to the biggest moment. */
export const UI_SOUNDS = ["click", "notification", "goal", "solved"] as const;

export type UiSound = (typeof UI_SOUNDS)[number];

/** The oscillator shapes the recipes use: soft (`sine`) and a little brighter (`triangle`). */
export type ToneWave = "sine" | "triangle";

/** One tone of a sound. Times are in seconds from the start of the sound. */
export interface Tone {
  readonly wave: ToneWave;
  /** The pitch in hertz. */
  readonly frequency: number;
  /** When the tone starts. */
  readonly start: number;
  /** How long the tone lasts, its fade included. */
  readonly duration: number;
  /** How long the tone takes to rise to its peak. */
  readonly attack: number;
  /** The tone's loudness at its peak at full volume, from 0 to 1. */
  readonly peak: number;
}

/** A sound: tones that may overlap. */
export type SoundRecipe = readonly Tone[];

// The pitches of the recipes, in hertz (equal temperament, A4 = 440 Hz).
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;
const E6 = 1318.51;
const G6 = 1567.98;

/** The recipe of every UI sound. */
export const SOUND_RECIPES: Readonly<Record<UiSound, SoundRecipe>> = {
  // A soft tick, shorter than a keystroke on a quiet keyboard.
  click: [
    { wave: "triangle", frequency: 1200, start: 0, duration: 0.03, attack: 0.002, peak: 0.12 },
  ],
  // Two gentle tones a fourth apart, like a message arriving.
  notification: [
    { wave: "sine", frequency: E5, start: 0, duration: 0.22, attack: 0.01, peak: 0.2 },
    { wave: "sine", frequency: A5, start: 0.1, duration: 0.3, attack: 0.01, peak: 0.2 },
  ],
  // Three quick rising tones of a major chord.
  goal: [
    { wave: "sine", frequency: C6, start: 0, duration: 0.18, attack: 0.008, peak: 0.16 },
    { wave: "sine", frequency: E6, start: 0.07, duration: 0.18, attack: 0.008, peak: 0.16 },
    { wave: "sine", frequency: G6, start: 0.14, duration: 0.3, attack: 0.008, peak: 0.16 },
  ],
  // A rising major chord that ends on the octave and rings out.
  solved: [
    { wave: "triangle", frequency: C5, start: 0, duration: 0.2, attack: 0.01, peak: 0.15 },
    { wave: "triangle", frequency: E5, start: 0.09, duration: 0.18, attack: 0.01, peak: 0.15 },
    { wave: "triangle", frequency: G5, start: 0.18, duration: 0.22, attack: 0.01, peak: 0.15 },
    { wave: "triangle", frequency: C6, start: 0.27, duration: 0.6, attack: 0.01, peak: 0.2 },
  ],
};

/** How long `recipe` lasts, in seconds: until its last tone ends. */
export function soundDuration(recipe: SoundRecipe): number {
  return Math.max(0, ...recipe.map((tone) => tone.start + tone.duration));
}
