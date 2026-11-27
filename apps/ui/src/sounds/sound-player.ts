// The sound player (ROADMAP M3.10, ADR 0113): it plays the UI sounds of `ui-sounds.ts` on a Web
// Audio context at the volumes of the settings. The context opens with the first sound that is
// heard, so that a game whose sounds are turned off never opens one. Sounds are never worth an
// error: a context that cannot open leaves the game silent, and a sound that fails is only
// logged.
//
// The volumes are percentages; the player's loudness follows their square, so that the slider
// feels even to the ear: half way down is clearly quieter, not only a little. The master volume
// scales every sound. The music volume belongs to the background music, which comes later
// (ADR 0020); the UI sounds follow the effects volume.

import type { Volumes } from "@penguin-ops/gameplay";

import { SOUND_RECIPES, type Tone, type UiSound } from "./ui-sounds";

/** The parts of a Web Audio parameter that the player uses. */
export interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

/** The parts of a Web Audio node that the player uses. */
export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
}

/** The parts of a Web Audio gain node that the player uses. */
export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

/** The parts of a Web Audio oscillator that the player uses. */
export interface OscillatorNodeLike extends AudioNodeLike {
  type: OscillatorType;
  readonly frequency: AudioParamLike;
  start(time: number): void;
  stop(time: number): void;
}

/** The parts of a Web Audio context that the player uses; a browser's `AudioContext` has them. */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
}

/** Plays the UI sounds. */
export interface SoundPlayer {
  /** Plays `sound` at `volumes`; nothing at all if the volumes make it silent. */
  play(sound: UiSound, volumes: Volumes): void;
}

/** A player that plays nothing, for screens and tests without sound. */
export const SILENT_PLAYER: SoundPlayer = {
  play() {
    // Silence.
  },
};

/**
 * The shortest time between two clicks, in seconds: dragging a slider changes it many times a
 * second, and the clicks would blur into a buzz.
 */
export const MIN_CLICK_GAP = 0.05;

/** The level an envelope fades to before the tone stops: inaudible, but above 0 for the ramp. */
const SILENT_LEVEL = 0.0001;

/** The gain of the UI sounds at `volumes`, from 0 (silent) to 1 (both volumes at 100 %). */
export function effectsGain(volumes: Volumes): number {
  const level = (volumes.master / 100) * (volumes.effects / 100);
  return level * level;
}

/**
 * A player that opens its context with `openContext` when the first sound is heard. `onError`
 * gets every error, for the log: a context that cannot open (the player then stays silent), a
 * context that cannot resume, and a sound that fails.
 */
export function createSoundPlayer(
  openContext: () => AudioContextLike,
  onError: (error: unknown) => void,
): SoundPlayer {
  let context: AudioContextLike | "closed" | undefined;
  let lastClick = Number.NEGATIVE_INFINITY;

  /** The open context, or `undefined` if it cannot open. */
  function audio(): AudioContextLike | undefined {
    if (context === undefined) {
      try {
        context = openContext();
      } catch (error) {
        context = "closed";
        onError(error);
      }
    }
    return context === "closed" ? undefined : context;
  }

  return {
    play(sound, volumes) {
      const gain = effectsGain(volumes);
      if (gain === 0) {
        return;
      }
      const output = audio();
      if (output === undefined) {
        return;
      }
      try {
        // A context opened without a user gesture may start suspended.
        if (output.state === "suspended") {
          output.resume().catch(onError);
        }
        const now = output.currentTime;
        if (sound === "click") {
          if (now - lastClick < MIN_CLICK_GAP) {
            return;
          }
          lastClick = now;
        }
        for (const tone of SOUND_RECIPES[sound]) {
          playTone(output, tone, now, gain);
        }
      } catch (error) {
        onError(error);
      }
    },
  };
}

/** Plays `tone` on `context`, with the sound starting at `start` and its loudness scaled by `gain`. */
function playTone(context: AudioContextLike, tone: Tone, start: number, gain: number): void {
  const begin = start + tone.start;
  const end = begin + tone.duration;
  const level = tone.peak * gain;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, begin);
  envelope.gain.linearRampToValueAtTime(level, begin + tone.attack);
  // The fade always goes down, also for a tone that is barely audible at a low volume.
  envelope.gain.exponentialRampToValueAtTime(Math.min(SILENT_LEVEL, level / 100), end);
  envelope.connect(context.destination);
  const oscillator = context.createOscillator();
  oscillator.type = tone.wave;
  oscillator.frequency.setValueAtTime(tone.frequency, begin);
  oscillator.connect(envelope);
  oscillator.start(begin);
  oscillator.stop(end);
}
