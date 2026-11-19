// @vitest-environment jsdom
// Tests of the navigation between the screens (ADR 0091, ADR 0092): the app opens on the start
// screen, Play opens the save slot screen, Back and Esc return, an empty slot starts the game,
// the pause menu leads back to the start screen, and the keyboard focus follows.
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { App } from "./app";
import { loadBundledContent } from "./content/bundled-content";
import { createTexts } from "./texts/ui-texts";

const { uiCatalogs } = loadBundledContent();

function renderApp() {
  const onQuit = vi.fn<() => void>();
  render(
    <App
      info={{ name: "PenguinOps", version: "1.2.3" }}
      texts={createTexts(uiCatalogs, "en")}
      onQuit={onQuit}
    />,
  );
  return onQuit;
}

function startScreenTitle() {
  return screen.queryByRole("heading", { level: 1, name: "PenguinOps" });
}

function saveSlotTitle() {
  return screen.queryByRole("heading", { level: 1, name: "Choose a save slot" });
}

function gameTitle() {
  return screen.queryByRole("heading", { level: 1, name: "Workplace" });
}

afterEach(() => {
  cleanup();
});

describe("App", () => {
  test("opens on the start screen", () => {
    renderApp();
    expect(startScreenTitle()).not.toBeNull();
    expect(saveSlotTitle()).toBeNull();
  });

  test("opens the save slot screen with Play and gives the first slot the focus", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(saveSlotTitle()).not.toBeNull();
    expect(startScreenTitle()).toBeNull();
    expect(screen.getByRole("button", { name: "Slot 1 New game" })).toBe(document.activeElement);
  });

  test("goes there and back with the keyboard alone", async () => {
    renderApp();
    await userEvent.keyboard("{Enter}");
    expect(saveSlotTitle()).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(startScreenTitle()).not.toBeNull();
    // The focus is back on Play, so Enter opens the save slot screen again.
    expect(screen.getByRole("button", { name: "Play" })).toBe(document.activeElement);
    await userEvent.keyboard("{Enter}");
    expect(saveSlotTitle()).not.toBeNull();
  });

  test("returns to the start screen with Back", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(startScreenTitle()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Play" })).toBe(document.activeElement);
  });

  test("starts the game in an empty slot", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Slot 2 New game" }));
    expect(gameTitle()).not.toBeNull();
    expect(saveSlotTitle()).toBeNull();
    expect(screen.getByRole("button", { name: "Esc Menu" })).toBe(document.activeElement);
  });

  test("goes into the game and back to the start screen with the keyboard alone", async () => {
    renderApp();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    expect(gameTitle()).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeDefined();
    // Continue has the focus; one Tab reaches Main menu.
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Main menu" })).toBe(document.activeElement);
    await userEvent.keyboard("{Enter}");
    expect(startScreenTitle()).not.toBeNull();
    expect(gameTitle()).toBeNull();
    expect(screen.getByRole("button", { name: "Play" })).toBe(document.activeElement);
  });

  test("stays in the game when Esc closes the pause menu", async () => {
    renderApp();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    expect(gameTitle()).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("ignores Esc on the start screen", async () => {
    const onQuit = renderApp();
    await userEvent.keyboard("{Escape}");
    expect(startScreenTitle()).not.toBeNull();
    expect(onQuit).not.toHaveBeenCalled();
  });

  test("quits from the start screen", async () => {
    const onQuit = renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Quit" }));
    expect(onQuit).toHaveBeenCalledExactlyOnceWith();
  });
});
