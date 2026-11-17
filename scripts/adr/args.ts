// Command-line arguments of `npm run adr:new` (ADR 0038).
import { parseArgs } from "node:util";

import { AdrError, type SupersededRecord } from "./record.ts";

export const USAGE = [
  'Usage: npm run adr:new -- "Title in sentence case" [options]',
  "",
  "Options:",
  "  --supersedes <number>          the new record replaces this record completely",
  '  --partly "<number>:<scope>"    the new record replaces only <scope> of this record',
  "Both options can be repeated.",
].join("\n");

export interface AdrArguments {
  readonly title: string;
  readonly supersedes: readonly SupersededRecord[];
}

function parseNumber(text: string): number {
  if (!/^\d{1,4}$/.test(text)) {
    throw new AdrError(`"${text}" is not a record number.`);
  }
  return Number(text);
}

function parsePartly(text: string): SupersededRecord {
  const separator = text.indexOf(":");
  if (separator === -1) {
    throw new AdrError(`--partly "${text}" needs the form "<number>:<scope>".`);
  }
  return {
    number: parseNumber(text.slice(0, separator).trim()),
    scope: text.slice(separator + 1).trim(),
  };
}

/** Parses the arguments after `--`. Throws an `AdrError` with a message for the user. */
export function parseAdrArguments(args: readonly string[]): AdrArguments {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      strict: true,
      options: {
        supersedes: { type: "string", multiple: true },
        partly: { type: "string", multiple: true },
      },
    });
  } catch (error) {
    throw new AdrError(error instanceof Error ? error.message : String(error));
  }
  const [title, ...rest] = parsed.positionals;
  if (title === undefined) {
    throw new AdrError("The title is missing.");
  }
  if (rest.length > 0) {
    throw new AdrError("Put the title in quotes; it must be a single argument.");
  }
  return {
    title,
    supersedes: [
      ...(parsed.values.supersedes ?? []).map((text) => ({ number: parseNumber(text.trim()) })),
      ...(parsed.values.partly ?? []).map(parsePartly),
    ],
  };
}
