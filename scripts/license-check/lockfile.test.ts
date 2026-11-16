import { describe, expect, test } from "vitest";

import { LockfileError, readLockedPackages } from "./lockfile.ts";

function lockfile(packages: Record<string, unknown>, lockfileVersion: unknown = 3): string {
  return JSON.stringify({ name: "root", lockfileVersion, packages });
}

describe("readLockedPackages", () => {
  test("reads third-party packages with name, version, license and scope", () => {
    const text = lockfile({
      "": { name: "root", license: "MIT" },
      "packages/engine": { name: "@penguin-ops/engine", license: "MIT" },
      "node_modules/@penguin-ops/engine": { resolved: "packages/engine", link: true },
      "node_modules/react": { version: "19.0.0", license: "MIT" },
      "node_modules/vite": { version: "8.0.0", license: "MIT", dev: true },
      "node_modules/fsevents": { version: "2.0.0", license: "MIT", dev: true, optional: true },
      "node_modules/both": { version: "1.0.0", license: "ISC", devOptional: true },
      "node_modules/a/node_modules/@scope/nested": { version: "2.0.0", license: "ISC" },
      "packages/engine/node_modules/local": { version: "3.0.0", license: "0BSD", dev: true },
      "node_modules/alias": { name: "real-name", version: "1.2.3" },
    });

    expect(readLockedPackages(text)).toEqual([
      {
        name: "react",
        version: "19.0.0",
        license: "MIT",
        scope: "runtime",
        path: "node_modules/react",
      },
      {
        name: "vite",
        version: "8.0.0",
        license: "MIT",
        scope: "development",
        path: "node_modules/vite",
      },
      {
        name: "fsevents",
        version: "2.0.0",
        license: "MIT",
        scope: "development",
        path: "node_modules/fsevents",
      },
      {
        name: "both",
        version: "1.0.0",
        license: "ISC",
        scope: "runtime",
        path: "node_modules/both",
      },
      {
        name: "@scope/nested",
        version: "2.0.0",
        license: "ISC",
        scope: "runtime",
        path: "node_modules/a/node_modules/@scope/nested",
      },
      {
        name: "local",
        version: "3.0.0",
        license: "0BSD",
        scope: "development",
        path: "packages/engine/node_modules/local",
      },
      {
        name: "real-name",
        version: "1.2.3",
        license: undefined,
        scope: "runtime",
        path: "node_modules/alias",
      },
    ]);
  });

  test("accepts lockfile version 2", () => {
    expect(readLockedPackages(lockfile({}, 2))).toEqual([]);
  });

  test.each([
    ["{", /^not valid JSON: /],
    ["null", /^the lockfile must be a JSON object$/],
    [lockfile({}, 1), /^unsupported lockfileVersion 1; expected 2 or 3/],
    [JSON.stringify({ lockfileVersion: 3 }), /^the lockfile has no "packages" object$/],
    [lockfile({ "node_modules/x": "1.0.0" }), /^entry "node_modules\/x" must be an object$/],
    [
      lockfile({ "node_modules/x": { license: { type: "MIT" } } }),
      /^entry "node_modules\/x" has a license that is not a string$/,
    ],
  ])("rejects an invalid lockfile (%#)", (text, message) => {
    expect(() => readLockedPackages(text)).toThrow(LockfileError);
    expect(() => readLockedPackages(text)).toThrow(message);
  });
});
