// Command-line entry of the documentation duty check (`npm run check:docs-duty`, ADR 0036).
// Usage: `npm run check:docs-duty -- [base] [head]`; defaults: `origin/main` and `HEAD`, so it
// checks the local commits that are not pushed yet. CI passes the commits of the push or pull
// request. Exits with code 1 if code or content changed without docs/STATUS.md.
import { join } from "node:path";

import { changedFiles } from "./docs-duty/git.ts";
import { checkDocumentationDuty, formatDocumentationDutyResult } from "./docs-duty/rule.ts";

const root = join(import.meta.dirname, "..");
const [base = "origin/main", head = "HEAD"] = process.argv.slice(2);

try {
  const result = checkDocumentationDuty(changedFiles(base, head, root));
  const lines = formatDocumentationDutyResult(result);
  if (result.passed) {
    console.log(lines.join("\n"));
  } else {
    console.error(lines.join("\n"));
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `Documentation duty check could not run: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
