// Reads docs/decisions/ and writes a planned record (ADR 0038).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { DecisionsFolder, RecordPlan } from "./record.ts";

export const TEMPLATE_FILE = "template.md";

/** Reads the template and every other Markdown file of the folder. */
export function readDecisionsFolder(folder: string): DecisionsFolder {
  const records = new Map<string, string>();
  for (const fileName of readdirSync(folder).sort()) {
    if (fileName.endsWith(".md") && fileName !== TEMPLATE_FILE) {
      records.set(fileName, readFileSync(join(folder, fileName), "utf8"));
    }
  }
  return { template: readFileSync(join(folder, TEMPLATE_FILE), "utf8"), records };
}

/**
 * Writes the new record first and refuses to overwrite an existing file, so a failure leaves
 * the superseded records untouched. Then writes the new status lines of the superseded records.
 */
export function writePlan(folder: string, plan: RecordPlan): void {
  writeFileSync(join(folder, plan.created.fileName), plan.created.content, { flag: "wx" });
  for (const file of plan.updated) {
    writeFileSync(join(folder, file.fileName), file.content);
  }
}
