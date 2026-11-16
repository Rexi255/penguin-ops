// ESLint configuration for the whole repository (ADR 0015, ADR 0029).
// Rules for formatting are left to Prettier; ESLint only finds errors and enforces structure.
import { builtinModules } from "node:module";

import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const SCOPE = "@penguin-ops/";

/**
 * Package boundaries from ADR 0006. `allowed` lists the workspaces a workspace may import by
 * package name; `typeOnly` lists workspaces it may only import types from. `node` says whether
 * Node.js built-in modules are allowed. Every other `@penguin-ops/*` import fails, including
 * subpaths such as `@penguin-ops/engine/src/x`, because packages are only used through their
 * public entry point.
 *
 * @type {ReadonlyArray<{ folder: string, allowed: readonly string[], typeOnly: readonly string[], node: boolean }>}
 */
const BOUNDARIES = [
  { folder: "packages/engine", allowed: [], typeOnly: [], node: false },
  { folder: "packages/content", allowed: [], typeOnly: ["engine"], node: false },
  { folder: "packages/gameplay", allowed: ["engine", "content"], typeOnly: [], node: false },
  { folder: "apps/ui", allowed: ["engine", "content", "gameplay"], typeOnly: [], node: false },
  { folder: "apps/desktop", allowed: [], typeOnly: ["ui"], node: true },
];

/**
 * Builds the options of `@typescript-eslint/no-restricted-imports` for one workspace.
 *
 * @param {(typeof BOUNDARIES)[number]} boundary
 */
function boundaryOptions(boundary) {
  const permitted = [...boundary.allowed, ...boundary.typeOnly];
  const permittedPattern = permitted.length === 0 ? "" : `(?!(?:${permitted.join("|")})$)`;
  const where = `${boundary.folder} (ADR 0006)`;

  const typeOnlyPaths = boundary.typeOnly.map((name) => ({
    name: SCOPE + name,
    allowTypeImports: true,
    message: `${where} may only import types from ${SCOPE}${name}. Use "import type".`,
  }));
  const nodePaths = boundary.node
    ? []
    : builtinModules.map((name) => ({
        name,
        message: `${where} must not use Node.js APIs.`,
      }));

  /** @type {Array<{ regex: string, message: string }>} */
  const patterns = [
    {
      regex: `^${SCOPE}${permittedPattern}`,
      message:
        permitted.length === 0
          ? `${where} must not import other workspaces.`
          : `${where} may only import ${permitted.map((name) => SCOPE + name).join(", ")}, and only through the package entry point.`,
    },
  ];
  if (!boundary.node) {
    patterns.push({ regex: "^node:", message: `${where} must not use Node.js APIs.` });
  }

  return { paths: [...typeOnlyPaths, ...nodePaths], patterns };
}

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/out/",
    "release/",
    "coverage/",
    "playwright-report/",
    "test-results/",
    "blob-report/",
    "reports/",
    ".stryker-tmp/",
  ]),

  {
    name: "penguin-ops/typescript",
    files: ["**/*.{js,ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
    rules: {
      // Every member of a union needs its own case; a `default` does not hide a forgotten one.
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: true,
        },
      ],
    },
  },

  {
    name: "penguin-ops/no-focused-or-skipped-tests",
    files: ["**/*.{js,ts,tsx}"],
    plugins: { vitest },
    rules: {
      // No autofix: removing `.only` silently would hide that a test run was incomplete.
      "vitest/no-focused-tests": ["error", { fixable: false }],
      "vitest/no-disabled-tests": "error",
    },
  },

  ...BOUNDARIES.map(
    /** @returns {import("eslint").Linter.Config} */
    (boundary) => ({
      name: `penguin-ops/boundaries/${boundary.folder}`,
      files: [`${boundary.folder}/**/*.{js,ts,tsx}`],
      rules: {
        "@typescript-eslint/no-restricted-imports": ["error", boundaryOptions(boundary)],
        // Dynamic imports would bypass the import rules above.
        "no-restricted-syntax": [
          "error",
          {
            selector: "ImportExpression",
            message: "Use a static import so that the package boundary rules can check it.",
          },
        ],
      },
    }),
  ),
);
