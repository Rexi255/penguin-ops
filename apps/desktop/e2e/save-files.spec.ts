// End-to-end tests of the save slot files (ROADMAP M3.7b, ADR 0105): the preload API stores a
// slot's save in the per-user data folder, keeps the save it replaces as the backup, reads both
// back, restores and deletes them, and the main process rejects a wrong slot.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SaveFilesApi } from "@penguin-ops/ui";

import { expect, test } from "./app";

/** The page's window with the preload API; only types, so it can be used inside `evaluate`. */
type AppWindow = Window & { readonly penguinOps: { readonly saves: SaveFilesApi } };

test("uses the per-user data folder it was started with", async ({ electronApp, userDataDir }) => {
  const folder = await electronApp.evaluate(({ app }) => app.getPath("userData"));
  expect(folder).toBe(userDataDir);
});

test("writes, reads, restores and deletes a save slot", async ({ page, userDataDir }) => {
  const saves = join(userDataDir, "saves");
  await page.evaluate(async () => {
    const api = (window as unknown as AppWindow).penguinOps.saves;
    await api.writeSlot(1, "first\n");
    await api.writeSlot(1, "second\n");
  });
  expect(await readFile(join(saves, "slot-2.json"), "utf8")).toBe("second\n");
  expect(await readFile(join(saves, "slot-2.backup.json"), "utf8")).toBe("first\n");

  await writeFile(join(saves, "slot-2.json"), "{ broken");
  const slots = await page.evaluate(async () => {
    const api = (window as unknown as AppWindow).penguinOps.saves;
    await api.restoreBackup(1);
    return api.readSlots();
  });
  expect(slots).toEqual([
    { save: { kind: "missing" }, backup: { kind: "missing" } },
    { save: { kind: "text", text: "first\n" }, backup: { kind: "text", text: "first\n" } },
    { save: { kind: "missing" }, backup: { kind: "missing" } },
  ]);

  await page.evaluate(() => (window as unknown as AppWindow).penguinOps.saves.deleteSlot(1));
  expect(await readdir(saves)).toEqual([]);
});

test("rejects a slot that does not exist", async ({ page, userDataDir }) => {
  const error = await page.evaluate(async () => {
    try {
      await (window as unknown as AppWindow).penguinOps.saves.writeSlot(3, "x");
      return "written";
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  });
  expect(error).toContain("The save slot must be a whole number from 0 to 2.");
  expect(await readdir(userDataDir)).not.toContain("saves");
});
