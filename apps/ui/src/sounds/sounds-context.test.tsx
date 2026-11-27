// @vitest-environment jsdom
// Tests of the sounds for the screens (ADR 0113): the provider's function reaches the screens, a
// screen outside it plays nothing, and `controlSound` names the click of a pressed button, a
// changed radio button or checkbox and a moved slider, and nothing for other events.
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  CONTROL_SOUND_EVENTS,
  controlSound,
  type PlaySound,
  SoundsProvider,
  useSounds,
} from "./sounds-context";
import type { UiSound } from "./ui-sounds";

afterEach(() => {
  cleanup();
});

function SolveButton() {
  const play = useSounds();
  return (
    <button
      type="button"
      onClick={() => {
        play("solved");
      }}
    >
      Solve
    </button>
  );
}

describe("useSounds", () => {
  test("plays through the provider's function", async () => {
    const play = vi.fn<PlaySound>();
    render(
      <SoundsProvider play={play}>
        <SolveButton />
      </SoundsProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Solve" }));
    expect(play).toHaveBeenCalledExactlyOnceWith("solved");
  });

  test("plays nothing outside a provider", async () => {
    render(<SolveButton />);
    await userEvent.click(screen.getByRole("button", { name: "Solve" }));
    // Nothing to hear and nothing thrown.
    expect(screen.getByRole("button", { name: "Solve" })).toBeDefined();
  });
});

describe("controlSound", () => {
  /** The sounds `controlSound` names for the events on the page while `act` runs. */
  async function soundsDuring(act: () => Promise<void>): Promise<(UiSound | undefined)[]> {
    const heard: (UiSound | undefined)[] = [];
    const listener = (event: Event) => {
      const sound = controlSound(event);
      if (sound !== undefined) {
        heard.push(sound);
      }
    };
    for (const type of CONTROL_SOUND_EVENTS) {
      document.addEventListener(type, listener);
    }
    try {
      await act();
    } finally {
      for (const type of CONTROL_SOUND_EVENTS) {
        document.removeEventListener(type, listener);
      }
    }
    return heard;
  }

  test("clicks once for a pressed button, also for a click on its icon", async () => {
    render(
      <button type="button">
        <span data-testid="icon" /> Back
      </button>,
    );
    expect(
      await soundsDuring(async () => {
        await userEvent.click(screen.getByTestId("icon"));
      }),
    ).toEqual(["click"]);
  });

  test("clicks for a button pressed with Enter or Space", async () => {
    render(<button type="button">Play</button>);
    screen.getByRole("button", { name: "Play" }).focus();
    expect(
      await soundsDuring(async () => {
        await userEvent.keyboard("{Enter}");
        await userEvent.keyboard(" ");
      }),
    ).toEqual(["click", "click"]);
  });

  test("stays silent for a disabled button", async () => {
    render(
      <button type="button" disabled>
        Continue
      </button>,
    );
    expect(
      await soundsDuring(async () => {
        await userEvent.click(screen.getByRole("button", { name: "Continue" }));
      }),
    ).toEqual([]);
  });

  test("clicks once for a checkbox clicked on its label", async () => {
    render(
      <label>
        <input type="checkbox" /> <span>Glow</span>
      </label>,
    );
    expect(
      await soundsDuring(async () => {
        await userEvent.click(screen.getByText("Glow"));
      }),
    ).toEqual(["click"]);
  });

  test("clicks for a radio button chosen with the arrow keys", async () => {
    render(
      <fieldset>
        <label>
          <input type="radio" name="scheme" defaultChecked /> Default
        </label>
        <label>
          <input type="radio" name="scheme" /> Solarized
        </label>
      </fieldset>,
    );
    screen.getByRole("radio", { name: "Default" }).focus();
    expect(
      await soundsDuring(async () => {
        await userEvent.keyboard("{ArrowDown}");
      }),
    ).toEqual(["click"]);
  });

  test("clicks for a step of a slider and stays silent while typing", async () => {
    render(
      <>
        <input type="range" aria-label="Volume" min={0} max={100} defaultValue={50} />
        <input type="text" aria-label="Name" />
      </>,
    );
    const slider = screen.getByRole("slider", { name: "Volume" });
    expect(
      await soundsDuring(async () => {
        // jsdom does not move a slider with the keyboard, so the test sends its input event.
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "ada");
      }),
    ).toEqual(["click"]);
  });

  test("stays silent for a click outside any control and a change of a text field", () => {
    render(
      <>
        <p>Text</p>
        <input type="text" aria-label="Name" />
      </>,
    );
    expect(controlSound(new MouseEvent("click"))).toBeUndefined();
    const text = screen.getByText("Text");
    const click = new MouseEvent("click", { bubbles: true });
    text.dispatchEvent(click);
    expect(controlSound(click)).toBeUndefined();
    const change = new Event("change", { bubbles: true });
    screen.getByRole("textbox", { name: "Name" }).dispatchEvent(change);
    expect(controlSound(change)).toBeUndefined();
    const keydown = new KeyboardEvent("keydown", { bubbles: true });
    text.dispatchEvent(keydown);
    expect(controlSound(keydown)).toBeUndefined();
  });
});
