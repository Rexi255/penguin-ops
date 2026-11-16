// Proves that the ESLint configuration really enforces the rules the project relies on:
// package boundaries (ADR 0006), exhaustive switches, strict TypeScript rules and the ban on
// focused or skipped tests (ADR 0015). Each case lints a small piece of code as if it were a
// file in a given workspace; the file never exists on disk.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ESLint } from "eslint";

const PROBE_FILE = "src/lint-probe.ts";
const WORKSPACES = [
  "packages/engine",
  "packages/content",
  "packages/gameplay",
  "apps/ui",
  "apps/desktop",
] as const;
type Workspace = (typeof WORKSPACES)[number];

const eslint = new ESLint({
  cwd: import.meta.dirname + "/..",
  // The probe files are not on disk, so no tsconfig contains them. They get TypeScript's
  // default project instead; every rule under test works with it.
  overrideConfig: {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: WORKSPACES.map((workspace) => `${workspace}/${PROBE_FILE}`),
        },
      },
    },
  },
});

/** Lints `code` as a file in `workspace` and returns the ids of the rules that reported. */
async function ruleIds(workspace: Workspace, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${workspace}/${PROBE_FILE}` });
  assert.ok(result, "ESLint returned no result");
  return result.messages.map((message) => message.ruleId ?? `fatal: ${message.message}`);
}

const BOUNDARY_RULE = "@typescript-eslint/no-restricted-imports";

/** Asserts whether importing `source` (with `statement`) breaks the package boundaries. */
async function assertImport(
  workspace: Workspace,
  statement: string,
  expected: "allowed" | "forbidden",
): Promise<void> {
  const ids = await ruleIds(workspace, `${statement}\n`);
  assert.equal(
    ids.includes(BOUNDARY_RULE),
    expected === "forbidden",
    `${workspace}: "${statement}" should be ${expected}, reported: ${ids.join(", ") || "nothing"}`,
  );
}

describe("package boundaries (ADR 0006)", () => {
  const cases: [Workspace, string, "allowed" | "forbidden"][] = [
    ["packages/engine", 'export * from "@penguin-ops/content";', "forbidden"],
    ["packages/engine", 'export * from "@penguin-ops/gameplay";', "forbidden"],
    ["packages/engine", 'export * from "@penguin-ops/ui";', "forbidden"],
    ["packages/content", 'export type * from "@penguin-ops/engine";', "allowed"],
    ["packages/content", 'import type { World } from "@penguin-ops/engine";', "allowed"],
    ["packages/content", 'import { World } from "@penguin-ops/engine";', "forbidden"],
    ["packages/content", 'export * from "@penguin-ops/engine";', "forbidden"],
    ["packages/content", 'export * from "@penguin-ops/gameplay";', "forbidden"],
    ["packages/gameplay", 'export * from "@penguin-ops/engine";', "allowed"],
    ["packages/gameplay", 'export * from "@penguin-ops/content";', "allowed"],
    ["packages/gameplay", 'export * from "@penguin-ops/ui";', "forbidden"],
    ["packages/gameplay", 'export * from "@penguin-ops/engine/src/index";', "forbidden"],
    ["packages/gameplay", 'export * from "@penguin-ops/engineering";', "forbidden"],
    ["apps/ui", 'export * from "@penguin-ops/engine";', "allowed"],
    ["apps/ui", 'export * from "@penguin-ops/content";', "allowed"],
    ["apps/ui", 'export * from "@penguin-ops/gameplay";', "allowed"],
    ["apps/ui", 'export * from "@penguin-ops/desktop";', "forbidden"],
    ["apps/desktop", 'export * from "@penguin-ops/ui";', "forbidden"],
    ["apps/desktop", 'export * from "@penguin-ops/engine";', "forbidden"],
  ];
  for (const [workspace, statement, expected] of cases) {
    test(`${workspace}: ${statement} is ${expected}`, async () => {
      await assertImport(workspace, statement, expected);
    });
  }
});

describe("Node.js APIs (ADR 0006, ADR 0014)", () => {
  const pure: Workspace[] = ["packages/engine", "packages/content", "packages/gameplay", "apps/ui"];
  for (const workspace of pure) {
    test(`${workspace} must not import node:fs or fs`, async () => {
      await assertImport(workspace, 'export * from "node:fs";', "forbidden");
      await assertImport(workspace, 'export * from "fs";', "forbidden");
      await assertImport(workspace, 'export * from "path";', "forbidden");
    });
  }
  test("apps/desktop may import Node.js modules", async () => {
    await assertImport("apps/desktop", 'export * from "node:fs";', "allowed");
  });
});

describe("dynamic imports", () => {
  for (const workspace of WORKSPACES) {
    test(`${workspace} must not use import()`, async () => {
      const ids = await ruleIds(
        workspace,
        'export const lazy = (): Promise<unknown> => import("@penguin-ops/ui");\n',
      );
      assert.ok(ids.includes("no-restricted-syntax"), ids.join(", "));
    });
  }
});

describe("exhaustive switch", () => {
  const prefix = 'type Kind = "file" | "directory";\nexport function size(kind: Kind): number {\n';

  test("a missing case is an error", async () => {
    const ids = await ruleIds(
      "packages/engine",
      `${prefix}  switch (kind) {\n    case "file":\n      return 1;\n  }\n  return 0;\n}\n`,
    );
    assert.ok(ids.includes("@typescript-eslint/switch-exhaustiveness-check"), ids.join(", "));
  });

  test("a default case does not hide a missing case", async () => {
    const ids = await ruleIds(
      "packages/engine",
      `${prefix}  switch (kind) {\n    case "file":\n      return 1;\n    default:\n      return 0;\n  }\n}\n`,
    );
    assert.ok(ids.includes("@typescript-eslint/switch-exhaustiveness-check"), ids.join(", "));
  });

  test("a complete switch without default passes", async () => {
    const ids = await ruleIds(
      "packages/engine",
      `${prefix}  switch (kind) {\n    case "file":\n      return 1;\n    case "directory":\n      return 2;\n  }\n}\n`,
    );
    assert.deepEqual(ids, []);
  });
});

describe("strict TypeScript rules", () => {
  test("explicit any is an error", async () => {
    const ids = await ruleIds("packages/engine", "export const value: any = 1;\n");
    assert.ok(ids.includes("@typescript-eslint/no-explicit-any"), ids.join(", "));
  });

  test("a non-null assertion is an error", async () => {
    const ids = await ruleIds(
      "packages/engine",
      "export function first(list: string[]): string {\n  return list[0]!;\n}\n",
    );
    assert.ok(ids.includes("@typescript-eslint/no-non-null-assertion"), ids.join(", "));
  });

  test("@ts-ignore is an error", async () => {
    const ids = await ruleIds(
      "packages/engine",
      "// @ts-ignore\nexport const value: number = 1;\n",
    );
    assert.ok(ids.includes("@typescript-eslint/ban-ts-comment"), ids.join(", "));
  });
});

describe("no focused or skipped tests (ADR 0015)", () => {
  const cases: [string, string][] = [
    ['it.only("works", () => {});', "vitest/no-focused-tests"],
    ['describe.only("group", () => {});', "vitest/no-focused-tests"],
    ['test.only("works", () => {});', "vitest/no-focused-tests"],
    ['it.skip("works", () => {});', "vitest/no-disabled-tests"],
    ['describe.skip("group", () => {});', "vitest/no-disabled-tests"],
    ['xit("works", () => {});', "vitest/no-disabled-tests"],
  ];
  for (const [statement, rule] of cases) {
    test(`${statement} is reported by ${rule}`, async () => {
      const ids = await ruleIds("packages/engine", `${statement}\n`);
      assert.ok(ids.includes(rule), ids.join(", "));
    });
  }
});
