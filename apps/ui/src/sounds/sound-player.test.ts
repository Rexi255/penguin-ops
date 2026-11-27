// Tests of the sound player (ADR 0113) on a recording stand-in for a Web Audio context: the
// tones it builds with their envelopes, the volumes, silence without opening a context, the
// context opened once and resumed when suspended, the click's shortest gap, and errors that never
// reach the game.
import { DEFAULT_SETTINGS, type Volumes } from "@penguin-ops/gameplay";
import { describe, expect, test, vi } from "vitest";

import {
  type AudioContextLike,
  type AudioNodeLike,
  type AudioParamLike,
  createSoundPlayer,
  effectsGain,
  type GainNodeLike,
  MIN_CLICK_GAP,
  type OscillatorNodeLike,
  SILENT_PLAYER,
} from "./sound-player";
import { SOUND_RECIPES } from "./ui-sounds";

/** What happened to an audio parameter, in order. */
type ParamCall = readonly [method: string, value: number, time: number];

class FakeParam implements AudioParamLike {
  readonly calls: ParamCall[] = [];
  setValueAtTime(value: number, time: number) {
    this.calls.push(["set", value, time]);
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push(["linear", value, time]);
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.calls.push(["exponential", value, time]);
  }
}

class FakeNode implements AudioNodeLike {
  connectedTo: AudioNodeLike | undefined;
  connect(destination: AudioNodeLike) {
    this.connectedTo = destination;
  }
}

class FakeGain extends FakeNode implements GainNodeLike {
  readonly gain = new FakeParam();
}

class FakeOscillator extends FakeNode implements OscillatorNodeLike {
  type: OscillatorType = "sine";
  readonly frequency = new FakeParam();
  started: number | undefined;
  stopped: number | undefined;
  start(time: number) {
    this.started = time;
  }
  stop(time: number) {
    this.stopped = time;
  }
}

class FakeContext implements AudioContextLike {
  currentTime = 10;
  state: AudioContextState = "running";
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly oscillators: FakeOscillator[] = [];
  resumes = 0;
  resumeError: Error | undefined = undefined;
  resume() {
    this.resumes += 1;
    return this.resumeError === undefined ? Promise.resolve() : Promise.reject(this.resumeError);
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

const FULL: Volumes = { master: 100, music: 100, effects: 100 };

function player(context: FakeContext = new FakeContext()) {
  const open = vi.fn(() => context);
  const onError = vi.fn<(error: unknown) => void>();
  return { context, open, onError, sounds: createSoundPlayer(open, onError) };
}

describe("effectsGain", () => {
  test.each([
    [{ master: 100, music: 0, effects: 100 }, 1],
    [{ master: 50, music: 100, effects: 100 }, 0.25],
    [{ master: 100, music: 100, effects: 50 }, 0.25],
    [{ master: 80, music: 50, effects: 80 }, 0.4096],
    [{ master: 0, music: 100, effects: 100 }, 0],
    [{ master: 100, music: 100, effects: 0 }, 0],
  ] as const)("follows the square of the master and effects volumes at %o", (volumes, gain) => {
    expect(effectsGain(volumes)).toBeCloseTo(gain, 10);
  });

  test("ignores the music volume", () => {
    expect(effectsGain({ ...FULL, music: 0 })).toBe(effectsGain(FULL));
  });
});

describe("createSoundPlayer", () => {
  test("builds every tone of a sound with its envelope, from the context's time", () => {
    const { context, sounds } = player();
    sounds.play("solved", FULL);
    const recipe = SOUND_RECIPES.solved;
    expect(context.oscillators).toHaveLength(recipe.length);
    recipe.forEach((tone, index) => {
      const begin = 10 + tone.start;
      const end = begin + tone.duration;
      const oscillator = context.oscillators[index];
      const envelope = context.gains[index];
      expect(oscillator?.type).toBe(tone.wave);
      expect(oscillator?.frequency.calls).toEqual([["set", tone.frequency, begin]]);
      expect(oscillator?.started).toBe(begin);
      expect(oscillator?.stopped).toBe(end);
      expect(oscillator?.connectedTo).toBe(envelope);
      expect(envelope?.connectedTo).toBe(context.destination);
      expect(envelope?.gain.calls).toEqual([
        ["set", 0, begin],
        ["linear", tone.peak, begin + tone.attack],
        ["exponential", 0.0001, end],
      ]);
    });
  });

  test("scales the peaks by the volumes", () => {
    const { context, sounds } = player();
    sounds.play("notification", { master: 50, music: 100, effects: 100 });
    const peaks = context.gains.map((gain) => gain.gain.calls[1]?.[1]);
    expect(peaks).toEqual(SOUND_RECIPES.notification.map((tone) => tone.peak * 0.25));
  });

  test("fades a barely audible tone further down, never up", () => {
    const { context, sounds } = player();
    sounds.play("click", { master: 1, music: 100, effects: 1 });
    const [, rise, fade] = context.gains[0]?.gain.calls ?? [];
    expect(rise?.[1]).toBeGreaterThan(0);
    expect(fade?.[1]).toBeLessThan(rise?.[1] ?? 0);
  });

  test.each([
    { master: 0, music: 100, effects: 100 },
    { master: 100, music: 100, effects: 0 },
  ])("plays nothing and opens no context at %o", (volumes) => {
    const { open, sounds } = player();
    sounds.play("solved", volumes);
    expect(open).not.toHaveBeenCalled();
  });

  test("opens its context once, with the first sound heard", () => {
    const { context, open, sounds } = player();
    expect(open).not.toHaveBeenCalled();
    sounds.play("goal", FULL);
    sounds.play("solved", FULL);
    expect(open).toHaveBeenCalledOnce();
    expect(context.oscillators).toHaveLength(
      SOUND_RECIPES.goal.length + SOUND_RECIPES.solved.length,
    );
  });

  test("resumes a suspended context and plays the sound", () => {
    const context = new FakeContext();
    context.state = "suspended";
    const { sounds } = player(context);
    sounds.play("notification", FULL);
    expect(context.resumes).toBe(1);
    expect(context.oscillators).toHaveLength(SOUND_RECIPES.notification.length);
  });

  test("logs a context that cannot resume", async () => {
    const context = new FakeContext();
    context.state = "suspended";
    context.resumeError = new Error("not allowed");
    const { onError, sounds } = player(context);
    sounds.play("click", FULL);
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledExactlyOnceWith(context.resumeError);
    });
  });

  test("stays silent and logs once when the context cannot open", () => {
    const error = new Error("no audio device");
    const open = vi.fn((): AudioContextLike => {
      throw error;
    });
    const onError = vi.fn<(error: unknown) => void>();
    const sounds = createSoundPlayer(open, onError);
    expect(() => {
      sounds.play("click", FULL);
      sounds.play("solved", FULL);
    }).not.toThrow();
    expect(open).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  });

  test("logs a sound that fails and goes on playing the next", () => {
    const context = new FakeContext();
    const error = new Error("node failed");
    const createOscillator = vi.spyOn(context, "createOscillator").mockImplementationOnce(() => {
      throw error;
    });
    const { onError, sounds } = player(context);
    expect(() => {
      sounds.play("click", FULL);
    }).not.toThrow();
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    context.currentTime += 1;
    sounds.play("notification", FULL);
    expect(createOscillator).toHaveBeenCalledTimes(1 + SOUND_RECIPES.notification.length);
  });

  test("skips a click that follows the last one too closely", () => {
    const { context, sounds } = player();
    sounds.play("click", FULL);
    context.currentTime += MIN_CLICK_GAP / 2;
    sounds.play("click", FULL);
    expect(context.oscillators).toHaveLength(1);
    context.currentTime += MIN_CLICK_GAP;
    sounds.play("click", FULL);
    expect(context.oscillators).toHaveLength(2);
  });

  test("plays other sounds right after a click", () => {
    const { context, sounds } = player();
    sounds.play("click", FULL);
    sounds.play("notification", FULL);
    expect(context.oscillators).toHaveLength(1 + SOUND_RECIPES.notification.length);
  });

  test("counts a skipped click's gap from the last click heard", () => {
    const { context, sounds } = player();
    sounds.play("click", FULL);
    for (let step = 0; step < 4; step += 1) {
      context.currentTime += MIN_CLICK_GAP * 0.4;
      sounds.play("click", FULL);
    }
    // 0.4, 0.8 skipped; 1.2 heard; 1.6 skipped (0.4 after it).
    expect(context.oscillators).toHaveLength(2);
  });
});

describe("SILENT_PLAYER", () => {
  test("plays nothing", () => {
    expect(() => {
      SILENT_PLAYER.play("solved", DEFAULT_SETTINGS.volumes);
    }).not.toThrow();
  });
});
