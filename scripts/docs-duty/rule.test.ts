import { describe, expect, test } from "vitest";

import {
  checkDocumentationDuty,
  formatDocumentationDutyResult,
  isCodeOrContent,
  STATUS_FILE,
} from "./rule.ts";

describe("isCodeOrContent", () => {
  test.each([
    "apps/desktop/src/main/index.ts",
    "apps/ui/index.html",
    "packages/engine/src/random.ts",
    "packages/engine/tsconfig.json",
    "content/levels/0-01-first-day/level.yaml",
    "content/ui/de.yaml",
    "scripts/check-licenses.ts",
    "eslint.config.js",
    "vitest.config.ts",
    "tsconfig.json",
    "tsconfig.tooling.json",
  ])("counts %s", (path) => {
    expect(isCodeOrContent(path)).toBe(true);
  });

  test.each([
    "docs/STATUS.md",
    "docs/decisions/0036-continuous-integration.md",
    "README.md",
    "CLAUDE.md",
    "apps/desktop/README.md",
    "package.json",
    "package-lock.json",
    "apps/desktop/package.json",
    "packages/engine/package.json",
    ".github/workflows/ci.yml",
    ".github/dependabot.yml",
    ".claude/skills/next/SKILL.md",
    ".gitignore",
    "license-policy.json",
    "LICENSE",
    "docs/scripts/example.ts",
  ])("does not count %s", (path) => {
    expect(isCodeOrContent(path)).toBe(false);
  });
});

describe("checkDocumentationDuty", () => {
  test("passes when no code or content changed", () => {
    expect(checkDocumentationDuty(["README.md", "package-lock.json"])).toEqual({
      codeFiles: [],
      statusChanged: false,
      passed: true,
    });
  });

  test("passes when nothing changed", () => {
    expect(checkDocumentationDuty([]).passed).toBe(true);
  });

  test("passes when code and the status changed together", () => {
    const result = checkDocumentationDuty(["packages/engine/src/random.ts", STATUS_FILE]);
    expect(result).toEqual({
      codeFiles: ["packages/engine/src/random.ts"],
      statusChanged: true,
      passed: true,
    });
  });

  test("fails when code changed without the status and lists the files sorted", () => {
    const result = checkDocumentationDuty([
      "scripts/check-licenses.ts",
      "docs/ROADMAP.md",
      "apps/ui/src/app.tsx",
    ]);
    expect(result).toEqual({
      codeFiles: ["apps/ui/src/app.tsx", "scripts/check-licenses.ts"],
      statusChanged: false,
      passed: false,
    });
  });

  test("fails when only content changed without the status", () => {
    expect(checkDocumentationDuty(["content/ui/en.yaml"]).passed).toBe(false);
  });

  test("does not accept another status file in a subfolder", () => {
    expect(checkDocumentationDuty(["apps/ui/src/app.tsx", "apps/docs/STATUS.md"]).passed).toBe(
      false,
    );
  });
});

describe("formatDocumentationDutyResult", () => {
  test("reports that no code or content changed", () => {
    expect(formatDocumentationDutyResult(checkDocumentationDuty(["README.md"]))).toEqual([
      "Documentation duty check passed: no code or content changed.",
    ]);
  });

  test("reports a pass with the number of code files", () => {
    expect(
      formatDocumentationDutyResult(checkDocumentationDuty(["apps/ui/src/app.tsx", STATUS_FILE])),
    ).toEqual([
      "Documentation duty check passed: 1 code or content files and docs/STATUS.md changed.",
    ]);
  });

  test("lists the code files and the fix on failure", () => {
    expect(formatDocumentationDutyResult(checkDocumentationDuty(["apps/ui/src/app.tsx"]))).toEqual([
      "Documentation duty check failed: code or content changed, but docs/STATUS.md did not.",
      "  apps/ui/src/app.tsx",
      'Update docs/STATUS.md in the same change (CLAUDE.md, "Documentation duty").',
    ]);
  });
});
