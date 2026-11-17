// Creates a new decision record and marks the records it supersedes (ADR 0001, ADR 0038).
// Pure: the caller reads docs/decisions/, passes the file names and contents in, and writes the
// planned files. Nothing is written unless every check passes.

/** Lines in decision records are wrapped by hand at this width (ADR 0029). */
const LINE_WIDTH = 100;

/** Continuation lines of a list field are indented by two spaces. */
const CONTINUATION = "  ";

const RECORD_FILE_NAME = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

const ACCEPTED = "Accepted";
const PARTLY_SUPERSEDED = "Accepted; partly superseded by ";

export class AdrError extends Error {
  override name = "AdrError";
}

/** A record that the new record supersedes; `scope` is set when only a part is superseded. */
export interface SupersededRecord {
  readonly number: number;
  readonly scope?: string;
}

export interface NewRecordRequest {
  readonly title: string;
  /** The date of the record, `YYYY-MM-DD`. */
  readonly date: string;
  readonly supersedes: readonly SupersededRecord[];
}

export interface DecisionsFolder {
  /** Content of `template.md`. */
  readonly template: string;
  /** All record files: file name → content. */
  readonly records: ReadonlyMap<string, string>;
}

export interface PlannedFile {
  readonly fileName: string;
  readonly content: string;
}

export interface RecordPlan {
  /** The new record; it must not exist yet. */
  readonly created: PlannedFile;
  /** Superseded records with their new status line, in the order of the request. */
  readonly updated: readonly PlannedFile[];
}

/** Formats a record number with four digits, e.g. `0038`. */
export function formatNumber(number: number): string {
  return String(number).padStart(4, "0");
}

/**
 * Turns a title into the kebab-case part of a file name: lower case ASCII letters and digits
 * separated by single hyphens. Accents are removed, apostrophes dropped.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Returns the record files by number. Throws for a file name that does not follow
 * `NNNN-kebab-case-title.md` and for two files with the same number.
 */
export function indexRecords(fileNames: Iterable<string>): Map<number, string> {
  const byNumber = new Map<number, string>();
  for (const fileName of fileNames) {
    const match = RECORD_FILE_NAME.exec(fileName);
    if (match?.[1] === undefined) {
      throw new AdrError(
        `"${fileName}" is not a valid record file name; expected NNNN-kebab-case-title.md.`,
      );
    }
    const number = Number(match[1]);
    const existing = byNumber.get(number);
    if (existing !== undefined) {
      throw new AdrError(`"${existing}" and "${fileName}" have the same number.`);
    }
    byNumber.set(number, fileName);
  }
  return byNumber;
}

/** The next free number: one more than the highest existing number. Gaps are not reused. */
export function nextNumber(records: ReadonlyMap<number, string>): number {
  return Math.max(0, ...records.keys()) + 1;
}

/**
 * Wraps `- <field>: <value>` at the line width. Words are never split, so a link longer than
 * a line stays on one line.
 */
export function wrapField(field: string, value: string): string[] {
  const lines: string[] = [];
  let line = `- ${field}:`;
  for (const word of value.split(" ").filter((part) => part !== "")) {
    const isFirstWord = line === `- ${field}:`;
    if (!isFirstWord && line.length + 1 + word.length > LINE_WIDTH) {
      lines.push(line);
      line = CONTINUATION + word;
    } else {
      line = `${line} ${word}`;
    }
  }
  lines.push(line);
  return lines;
}

interface Field {
  /** Index of the line that starts the field. */
  readonly start: number;
  /** Index after the last continuation line. */
  readonly end: number;
  /** The value with its continuation lines joined by single spaces. */
  readonly value: string;
}

function findField(lines: readonly string[], field: string, fileName: string): Field {
  const prefix = `- ${field}:`;
  const start = lines.findIndex((line) => line === prefix || line.startsWith(`${prefix} `));
  const first = lines[start];
  if (first === undefined) {
    throw new AdrError(`"${fileName}" has no "${prefix}" line.`);
  }
  const parts = [first.slice(prefix.length).trim()];
  let end = start + 1;
  for (let line = lines[end]; line?.startsWith(CONTINUATION) === true; line = lines[end]) {
    parts.push(line.trim());
    end += 1;
  }
  return { start, end, value: parts.filter((part) => part !== "").join(" ") };
}

function replaceField(
  lines: readonly string[],
  field: string,
  value: string,
  fileName: string,
): string[] {
  const found = findField(lines, field, fileName);
  return [...lines.slice(0, found.start), ...wrapField(field, value), ...lines.slice(found.end)];
}

function link(fileName: string): string {
  return `[${fileName.slice(0, 4)}](${fileName})`;
}

function validateTitle(title: string): void {
  if (title.trim() === "") {
    throw new AdrError("The title is empty.");
  }
  if (title !== title.trim() || /\s{2}|[\r\n\t]/.test(title)) {
    throw new AdrError(
      "The title must be one line without leading, trailing or double whitespace.",
    );
  }
  if (slugify(title) === "") {
    throw new AdrError(`The title "${title}" contains no letters or digits for the file name.`);
  }
}

function validateDate(date: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    match === null ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new AdrError(`"${date}" is not a valid date in the form YYYY-MM-DD.`);
  }
}

function validateSupersedes(supersedes: readonly SupersededRecord[]): void {
  const seen = new Set<number>();
  for (const { number, scope } of supersedes) {
    if (!Number.isInteger(number) || number < 1 || number > 9999) {
      throw new AdrError(`${String(number)} is not a record number between 1 and 9999.`);
    }
    if (seen.has(number)) {
      throw new AdrError(`Record ${formatNumber(number)} is listed more than once.`);
    }
    if (scope?.trim() === "") {
      throw new AdrError(`The scope for record ${formatNumber(number)} is empty.`);
    }
    seen.add(number);
  }
}

/** The new status of a superseded record, or an error if it cannot be superseded. */
function supersededStatus(
  status: string,
  fileName: string,
  newLink: string,
  scope: string | undefined,
): string {
  if (status !== ACCEPTED && !status.startsWith(PARTLY_SUPERSEDED)) {
    throw new AdrError(
      `"${fileName}" has the status "${status}". Only accepted records can be superseded; ` +
        "a proposed record is edited instead, a superseded one stays as it is.",
    );
  }
  if (scope === undefined) {
    return `Superseded by ${newLink}`;
  }
  const entry = `${newLink} (${scope.trim()})`;
  return status === ACCEPTED ? `${PARTLY_SUPERSEDED}${entry}` : `${status} and ${entry}`;
}

/**
 * Plans a new record from the template with the next free number and status `Proposed`, and
 * the status lines of the records it supersedes. Throws an `AdrError` if anything is invalid.
 */
export function planRecord(request: NewRecordRequest, folder: DecisionsFolder): RecordPlan {
  validateTitle(request.title);
  validateDate(request.date);
  validateSupersedes(request.supersedes);

  const records = indexRecords(folder.records.keys());
  const number = formatNumber(nextNumber(records));
  const fileName = `${number}-${slugify(request.title)}.md`;
  const newLink = link(fileName);

  const updated: PlannedFile[] = [];
  const supersedesEntries: string[] = [];
  for (const { number: oldNumber, scope } of request.supersedes) {
    const oldFileName = records.get(oldNumber);
    const oldContent = oldFileName === undefined ? undefined : folder.records.get(oldFileName);
    if (oldFileName === undefined || oldContent === undefined) {
      throw new AdrError(`There is no record ${formatNumber(oldNumber)}.`);
    }
    const lines = oldContent.split("\n");
    const status = findField(lines, "Status", oldFileName).value;
    const newStatus = supersededStatus(status, oldFileName, newLink, scope);
    updated.push({
      fileName: oldFileName,
      content: replaceField(lines, "Status", newStatus, oldFileName).join("\n"),
    });
    supersedesEntries.push(
      scope === undefined ? link(oldFileName) : `${link(oldFileName)} (only ${scope.trim()})`,
    );
  }

  let lines = folder.template.split("\n");
  const heading = lines.findIndex((line) => line.startsWith("# "));
  if (heading === -1) {
    throw new AdrError('"template.md" has no "# " heading.');
  }
  lines[heading] = `# ${number}. ${request.title}`;
  lines = replaceField(lines, "Status", "Proposed", "template.md");
  lines = replaceField(lines, "Date", request.date, "template.md");
  lines = replaceField(
    lines,
    "Supersedes",
    supersedesEntries.length === 0 ? "–" : supersedesEntries.join(" and "),
    "template.md",
  );

  return { created: { fileName, content: lines.join("\n") }, updated };
}
