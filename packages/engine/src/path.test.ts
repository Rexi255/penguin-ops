import { describe, expect, test } from "vitest";

import { joinAbsolute, splitPath } from "./path";

describe("splitPath", () => {
  test("splits an absolute path", () => {
    expect(splitPath("/etc/hostname")).toEqual({
      absolute: true,
      components: ["etc", "hostname"],
      trailingSlash: false,
    });
  });

  test("splits a relative path and keeps . and ..", () => {
    expect(splitPath("./docs/../notes.txt")).toEqual({
      absolute: false,
      components: [".", "docs", "..", "notes.txt"],
      trailingSlash: false,
    });
  });

  test("drops empty names from repeated slashes and remembers a trailing slash", () => {
    expect(splitPath("//etc///ssh//")).toEqual({
      absolute: true,
      components: ["etc", "ssh"],
      trailingSlash: true,
    });
  });

  test("splits the root and the empty path", () => {
    expect(splitPath("/")).toEqual({ absolute: true, components: [], trailingSlash: true });
    expect(splitPath("")).toEqual({ absolute: false, components: [], trailingSlash: false });
  });

  test("keeps a tilde as an ordinary name", () => {
    expect(splitPath("~/notes").components).toEqual(["~", "notes"]);
  });
});

describe("joinAbsolute", () => {
  test("joins components to an absolute path", () => {
    expect(joinAbsolute(["home", "alice"])).toBe("/home/alice");
  });

  test("gives the root for no components", () => {
    expect(joinAbsolute([])).toBe("/");
  });
});
