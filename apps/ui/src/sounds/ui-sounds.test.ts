// Tests of the UI sound recipes (ADR 0113): every sound is short, audible and quiet enough to
// leave headroom where its tones overlap, and the bigger the moment, the longer its sound.
import { describe, expect, test } from "vitest";

import { SOUND_RECIPES, soundDuration, type SoundRecipe, UI_SOUNDS } from "./ui-sounds";

/** The loudest the overlapping tones of `recipe` add up to at their peaks. */
function loudestOverlap(recipe: SoundRecipe): number {
  return Math.max(
    ...recipe.map((tone) => {
      const peakTime = tone.start + tone.attack;
      return recipe
        .filter((other) => other.start <= peakTime && peakTime < other.start + other.duration)
        .reduce((sum, other) => sum + other.peak, 0);
    }),
  );
}

describe("SOUND_RECIPES", () => {
  test.each(UI_SOUNDS)("gives %s at least one well-formed tone", (sound) => {
    const recipe = SOUND_RECIPES[sound];
    expect(recipe.length).toBeGreaterThan(0);
    for (const tone of recipe) {
      expect(tone.start).toBeGreaterThanOrEqual(0);
      expect(tone.attack).toBeGreaterThan(0);
      expect(tone.attack).toBeLessThan(tone.duration);
      expect(tone.peak).toBeGreaterThan(0);
      // Pitches a laptop speaker plays well and that never shrill.
      expect(tone.frequency).toBeGreaterThanOrEqual(200);
      expect(tone.frequency).toBeLessThanOrEqual(2000);
    }
  });

  test.each(UI_SOUNDS)("keeps %s quiet where its tones overlap", (sound) => {
    expect(loudestOverlap(SOUND_RECIPES[sound])).toBeLessThanOrEqual(0.5);
  });

  test.each(UI_SOUNDS)("keeps %s under a second", (sound) => {
    expect(soundDuration(SOUND_RECIPES[sound])).toBeLessThan(1);
  });

  test("makes a click shorter than any keystroke", () => {
    expect(soundDuration(SOUND_RECIPES.click)).toBeLessThanOrEqual(0.05);
  });

  test("gives a bigger moment a longer sound", () => {
    const durations = UI_SOUNDS.map((sound) => soundDuration(SOUND_RECIPES[sound]));
    expect(durations).toEqual([...durations].sort((a, b) => a - b));
  });

  test("lasts until its last tone ends", () => {
    expect(
      soundDuration([
        { wave: "sine", frequency: 440, start: 0, duration: 0.5, attack: 0.01, peak: 0.1 },
        { wave: "sine", frequency: 440, start: 0.1, duration: 0.2, attack: 0.01, peak: 0.1 },
      ]),
    ).toBe(0.5);
    expect(soundDuration([])).toBe(0);
  });
});
