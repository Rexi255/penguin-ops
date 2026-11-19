// The styleguide stays out of the app (ADR 0083): no source file outside src/styleguide/ imports
// from it, so the app's bundle, which starts at index.html and main.tsx, never contains it.
import { describe, expect, test } from "vitest";

const appSources = import.meta.glob<string>(
  ["../**/*.{ts,tsx,css}", "!./**", "!../**/*.test.{ts,tsx}"],
  { query: "?raw", import: "default", eager: true },
);
const appHtml = import.meta.glob<string>("../../index.html", {
  query: "?raw",
  import: "default",
  eager: true,
});

const STYLEGUIDE_IMPORT =
  /(?:from\s+|import\s*\(?\s*|@import\s+|src=)["'][^"']*styleguide[^"']*["']/;

describe("the app", () => {
  test("has source files to check", () => {
    expect(Object.keys(appSources)).toContain("../main.tsx");
    expect(Object.keys(appHtml)).toEqual(["../../index.html"]);
  });

  test("never imports the styleguide", () => {
    const offenders = Object.entries({ ...appSources, ...appHtml })
      .filter(([, source]) => STYLEGUIDE_IMPORT.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  test("detects an import of the styleguide", () => {
    expect(STYLEGUIDE_IMPORT.test('import { Styleguide } from "./styleguide/styleguide";')).toBe(
      true,
    );
    expect(STYLEGUIDE_IMPORT.test('import "./styleguide/styleguide.css";')).toBe(true);
    expect(STYLEGUIDE_IMPORT.test('<script type="module" src="./src/styleguide/main.tsx">')).toBe(
      true,
    );
    expect(STYLEGUIDE_IMPORT.test('import { App } from "./app";')).toBe(false);
  });
});
