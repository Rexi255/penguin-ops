import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { changedFiles } from "./git.ts";

let repo: string;

function git(...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd: repo, encoding: "utf8" },
  ).trim();
}

/** Writes the files and commits them; returns the new commit id. */
function commit(files: Record<string, string>): string {
  for (const [path, text] of Object.entries(files)) {
    const file = join(repo, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  git("add", "--all");
  git("commit", "--quiet", "--message", "change");
  return git("rev-parse", "HEAD");
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "docs-duty-"));
  git("init", "--quiet", "--initial-branch", "main");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("changedFiles", () => {
  test("lists the files of all commits of a push, with forward slashes", () => {
    const before = commit({ "README.md": "a" });
    commit({ "apps/ui/src/app.tsx": "b" });
    const after = commit({ "docs/STATUS.md": "c" });
    expect(changedFiles(before, after, repo).sort()).toEqual([
      "apps/ui/src/app.tsx",
      "docs/STATUS.md",
    ]);
  });

  test("compares a pull request with its merge base, ignoring newer commits on main", () => {
    commit({ "README.md": "a" });
    git("switch", "--quiet", "--create", "feature");
    const head = commit({ "content/ui/en.yaml": "b" });
    git("switch", "--quiet", "main");
    const newerMain = commit({ "docs/STATUS.md": "c" });
    expect(changedFiles(newerMain, head, repo)).toEqual(["content/ui/en.yaml"]);
  });

  test("lists a renamed file under its old and its new path", () => {
    const before = commit({ "scripts/old.ts": "same content" });
    git("mv", "scripts/old.ts", "scripts/new.ts");
    git("commit", "--quiet", "--message", "rename");
    expect(changedFiles(before, "HEAD", repo).sort()).toEqual(["scripts/new.ts", "scripts/old.ts"]);
  });

  test("uses only the head commit when the push created the branch", () => {
    commit({ "README.md": "a" });
    const head = commit({ "packages/engine/src/x.ts": "b" });
    expect(changedFiles("0000000000000000000000000000000000000000", head, repo)).toEqual([
      "packages/engine/src/x.ts",
    ]);
  });

  test("throws for an unknown commit", () => {
    commit({ "README.md": "a" });
    expect(() => changedFiles("does-not-exist", "HEAD", repo)).toThrow(/does-not-exist/);
  });
});
