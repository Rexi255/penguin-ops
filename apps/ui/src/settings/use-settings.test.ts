// @vitest-environment jsdom
// Tests of the settings while the game runs (ADR 0109): a change applies at once and is written
// as the whole settings file, the writes run in order, a change that changes nothing writes
// nothing, and a failed write is logged and reported until a write works again.
import { DEFAULT_SETTINGS, serializeSettings, type Settings } from "@penguin-ops/gameplay";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { SettingsFileApi } from "../desktop-api";
import { useSettings } from "./use-settings";

function setup(write: SettingsFileApi["write"] = () => Promise.resolve()) {
  const file = { write: vi.fn<SettingsFileApi["write"]>(write) };
  const onError = vi.fn<(error: unknown) => void>();
  const hook = renderHook(() => useSettings(DEFAULT_SETTINGS, file, onError));
  return { file, onError, hook };
}

const GERMAN: Settings = { ...DEFAULT_SETTINGS, language: "de" };

describe("useSettings", () => {
  test("starts with the settings it gets and writes nothing", () => {
    const { file, hook } = setup();
    expect(hook.result.current.settings).toBe(DEFAULT_SETTINGS);
    expect(hook.result.current.saveFailed).toBe(false);
    expect(file.write).not.toHaveBeenCalled();
  });

  test("applies a change at once and writes the whole settings file", async () => {
    const { file, hook } = setup();
    act(() => {
      hook.result.current.update(() => GERMAN);
    });
    expect(hook.result.current.settings).toEqual(GERMAN);
    await vi.waitFor(() => {
      expect(file.write).toHaveBeenCalledExactlyOnceWith(serializeSettings(GERMAN));
    });
  });

  test("builds each change on the change before, even before React rendered it", async () => {
    const { file, hook } = setup();
    act(() => {
      hook.result.current.update((current) => ({ ...current, language: "de" }));
      hook.result.current.update((current) => ({ ...current, fullscreen: false }));
    });
    const both: Settings = { ...GERMAN, fullscreen: false };
    expect(hook.result.current.settings).toEqual(both);
    await vi.waitFor(() => {
      expect(file.write.mock.calls).toEqual([
        [serializeSettings(GERMAN)],
        [serializeSettings(both)],
      ]);
    });
  });

  test("writes one change after the other, so that the latest one wins", async () => {
    let finishFirst: (() => void) | undefined;
    const written: string[] = [];
    const { hook } = setup(
      (text) =>
        new Promise<void>((resolve) => {
          if (finishFirst === undefined) {
            finishFirst = () => {
              written.push(text);
              resolve();
            };
          } else {
            written.push(text);
            resolve();
          }
        }),
    );
    act(() => {
      hook.result.current.update(() => GERMAN);
      hook.result.current.update(() => DEFAULT_SETTINGS);
    });
    await Promise.resolve();
    expect(written).toEqual([]);
    finishFirst?.();
    await vi.waitFor(() => {
      expect(written).toEqual([serializeSettings(GERMAN), serializeSettings(DEFAULT_SETTINGS)]);
    });
  });

  test("writes nothing for a change that changes nothing", () => {
    const { file, hook } = setup();
    act(() => {
      hook.result.current.update((current) => ({ ...current }));
    });
    expect(file.write).not.toHaveBeenCalled();
  });

  test("reports a failed write and logs it, and clears it when a write works", async () => {
    const { file, onError, hook } = setup();
    file.write.mockRejectedValueOnce(new Error("disk full"));
    act(() => {
      hook.result.current.update(() => GERMAN);
    });
    await vi.waitFor(() => {
      expect(hook.result.current.saveFailed).toBe(true);
    });
    expect(onError).toHaveBeenCalledExactlyOnceWith(new Error("disk full"));
    // The change applies all the same.
    expect(hook.result.current.settings).toEqual(GERMAN);
    act(() => {
      hook.result.current.update(() => DEFAULT_SETTINGS);
    });
    await vi.waitFor(() => {
      expect(hook.result.current.saveFailed).toBe(false);
    });
  });
});
