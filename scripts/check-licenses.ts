// Command-line entry of the license check (`npm run check:licenses`, ADR 0032). Checks every
// package in package-lock.json against license-policy.json and exits with code 1 on violations.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkLicenses, formatResult } from "./license-check/check.ts";

const root = join(import.meta.dirname, "..");

try {
  const result = checkLicenses(
    readFileSync(join(root, "package-lock.json"), "utf8"),
    readFileSync(join(root, "license-policy.json"), "utf8"),
  );
  const lines = formatResult(result);
  if (result.violations.length === 0) {
    console.log(lines.join("\n"));
  } else {
    console.error(lines.join("\n"));
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `License check could not run: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
