// Command-line entry of `npm run adr:new` (ADR 0038), used by the `/adr` skill.
// Creates docs/decisions/NNNN-title.md from the template with the next free number and status
// "Proposed", and updates the status line of every superseded record.
import { join, relative } from "node:path";

import { parseAdrArguments, USAGE } from "./adr/args.ts";
import { readDecisionsFolder, writePlan } from "./adr/files.ts";
import { AdrError, planRecord } from "./adr/record.ts";

const root = join(import.meta.dirname, "..");
const folder = join(root, "docs", "decisions");

/** Today's date in the local time zone, `YYYY-MM-DD`. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${month}-${day}`;
}

function show(fileName: string): string {
  return relative(root, join(folder, fileName)).replaceAll("\\", "/");
}

try {
  const args = parseAdrArguments(process.argv.slice(2));
  const plan = planRecord({ ...args, date: today() }, readDecisionsFolder(folder));
  writePlan(folder, plan);
  console.log(`Created ${show(plan.created.fileName)}`);
  for (const file of plan.updated) {
    console.log(`Updated the status of ${show(file.fileName)}`);
  }
} catch (error) {
  if (error instanceof AdrError) {
    console.error(`${error.message}\n\n${USAGE}`);
  } else {
    console.error(
      `Could not create the record: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  process.exitCode = 1;
}
