// The settings while the game runs (ROADMAP M3.8b, ADR 0108, ADR 0109): a change takes effect at
// once and is written to the settings file right away, the whole file with every setting
// (ADR 0108). The writes run one after the other, so that the latest change is the one the file
// keeps. A write that fails is logged and reported, and the settings still apply until the game
// closes.

import { type Settings, serializeSettings } from "@penguin-ops/gameplay";
import { useCallback, useRef, useState } from "react";

import type { SettingsFileApi } from "../desktop-api";

/** The settings and how to change them. */
export interface SettingsKeeper {
  readonly settings: Settings;
  /**
   * Changes the settings to what `change` makes of the latest settings, and writes them unless
   * nothing changed.
   */
  readonly update: (change: (current: Settings) => Settings) => void;
  /** Whether the latest write failed; a write that works again clears it. */
  readonly saveFailed: boolean;
  /**
   * The latest settings, also right after a change that React has not rendered yet: for event
   * listeners outside React, such as the sounds of the controls (ADR 0113).
   */
  readonly current: () => Settings;
}

/**
 * Keeps the settings, starting with `initial`, and writes every change through `file`; `onError`
 * gets every write that failed, for the log.
 */
export function useSettings(
  initial: Settings,
  file: Pick<SettingsFileApi, "write">,
  onError: (error: unknown) => void,
): SettingsKeeper {
  const [settings, setSettings] = useState(initial);
  const [saveFailed, setSaveFailed] = useState(false);
  // The latest settings, for changes that come in before React rendered the one before.
  const latest = useRef(initial);
  const writing = useRef<Promise<void>>(Promise.resolve());

  const update = useCallback(
    (change: (current: Settings) => Settings) => {
      const before = latest.current;
      const next = change(before);
      const text = serializeSettings(next);
      if (text === serializeSettings(before)) {
        return;
      }
      latest.current = next;
      setSettings(next);
      writing.current = writing.current.then(() =>
        file.write(text).then(
          () => {
            setSaveFailed(false);
          },
          (error: unknown) => {
            onError(error);
            setSaveFailed(true);
          },
        ),
      );
    },
    [file, onError],
  );

  const current = useCallback(() => latest.current, []);

  return { settings, update, saveFailed, current };
}
