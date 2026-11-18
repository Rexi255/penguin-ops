// The coreutils command `cat` 9.7 (ADR 0058), following `src/cat.c`. `cat` writes its file
// operands one after the other to standard output; `-` and no operand at all stand for standard
// input. Without formatting options it copies the content unchanged. With `-b`, `-n`, `-s`,
// `-E`, `-T` or `-v` (and `-A`, `-e`, `-t`, which combine them) it runs the content through the
// same state machine as `cat.c`, whose state carries over from one file to the next: line
// numbers go on counting, and a file that ends without a line break continues its last line in
// the next file. A file that cannot be read gives an error, and `cat` goes on with the next one.

import { type CommandInvocation, defineCommand } from "../command-registry";
import { openForReading, readOpenFile } from "../fs-read";
import type { CommandResult, OpenFile, OutputFile } from "../interpreter";
import type { ParsedOption } from "../options";
import { shellQuote } from "../quote";
import { encodeUtf8 } from "../utf8";
import { type CatFormat, CatFormatter } from "./cat-format";
import { LOOKUP_ERROR_MESSAGES } from "./directory-names";

/** The exit status of `cat` after an error, coreutils' `EXIT_FAILURE`. */
const FAILURE = 1;

/** The operand that stands for standard input. */
const STDIN_OPERAND = "-";

type CatOption =
  | "number-nonblank"
  | "number"
  | "squeeze-blank"
  | "show-nonprinting"
  | "show-ends"
  | "show-tabs"
  | "show-all"
  | "help"
  | "version"
  | "show-ends-nonprinting"
  | "show-tabs-nonprinting"
  | "ignored";

export const cat = defineCommand<CatOption>({
  name: "cat",
  // The `long_options` of coreutils 9.7, then the short options without a long name.
  options: [
    { id: "number-nonblank", short: "b", long: "number-nonblank", argument: "none" },
    { id: "number", short: "n", long: "number", argument: "none" },
    { id: "squeeze-blank", short: "s", long: "squeeze-blank", argument: "none" },
    { id: "show-nonprinting", short: "v", long: "show-nonprinting", argument: "none" },
    { id: "show-ends", short: "E", long: "show-ends", argument: "none" },
    { id: "show-tabs", short: "T", long: "show-tabs", argument: "none" },
    { id: "show-all", short: "A", long: "show-all", argument: "none" },
    { id: "help", long: "help", argument: "none" },
    { id: "version", long: "version", argument: "none" },
    { id: "show-ends-nonprinting", short: "e", argument: "none" },
    { id: "show-tabs-nonprinting", short: "t", argument: "none" },
    { id: "ignored", short: "u", argument: "none" },
  ],
  simulated: [
    "number-nonblank",
    "number",
    "squeeze-blank",
    "show-nonprinting",
    "show-ends",
    "show-tabs",
    "show-all",
    "show-ends-nonprinting",
    "show-tabs-nonprinting",
    "ignored",
  ],
  usageErrorStatus: FAILURE,
  run: (invocation) => new Concatenation(invocation, catFormat(invocation.options)).run(),
});

/** The format of the options in the order written; `-u` changes nothing. */
function catFormat(options: readonly ParsedOption<CatOption>[]): CatFormat {
  let number = false;
  let numberNonblank = false;
  let squeezeBlank = false;
  let showNonprinting = false;
  let showEnds = false;
  let showTabs = false;
  for (const option of options) {
    switch (option.id) {
      case "number-nonblank":
        number = true;
        numberNonblank = true;
        break;
      case "number":
        number = true;
        break;
      case "squeeze-blank":
        squeezeBlank = true;
        break;
      case "show-nonprinting":
        showNonprinting = true;
        break;
      case "show-ends":
        showEnds = true;
        break;
      case "show-tabs":
        showTabs = true;
        break;
      case "show-all":
        showNonprinting = true;
        showEnds = true;
        showTabs = true;
        break;
      case "show-ends-nonprinting":
        showNonprinting = true;
        showEnds = true;
        break;
      case "show-tabs-nonprinting":
        showNonprinting = true;
        showTabs = true;
        break;
      case "ignored":
      case "help":
      case "version":
        break;
    }
  }
  return { number, numberNonblank, squeezeBlank, showNonprinting, showEnds, showTabs };
}

/** One run of `cat` over its operands. */
class Concatenation {
  private readonly formatter: CatFormatter | undefined;
  private readonly stdoutFile: OutputFile | undefined;
  /** The bytes written to standard output so far, the offset of `>`'s file descriptor. */
  private written = 0;
  /** The offset of standard input: 0 until `cat` has read it, then its end. */
  private stdinOffset = 0;
  private failed = false;

  constructor(
    private readonly invocation: CommandInvocation<CatOption>,
    format: CatFormat,
  ) {
    const formats =
      format.number ||
      format.showEnds ||
      format.showNonprinting ||
      format.showTabs ||
      format.squeezeBlank;
    this.formatter = formats ? new CatFormatter(format) : undefined;
    this.stdoutFile = invocation.stdoutFile;
  }

  run(): CommandResult {
    const operands =
      this.invocation.operands.length === 0 ? [STDIN_OPERAND] : this.invocation.operands;
    for (const operand of operands) {
      const stopped = operand === STDIN_OPERAND ? this.catStdin() : this.catFile(operand);
      if (stopped) {
        return { stop: { key: "terminal-input-not-simulated" } };
      }
    }
    const rest = this.formatter?.finish() ?? "";
    this.write(rest);
    return { exitStatus: this.failed ? FAILURE : 0 };
  }

  /** Copies standard input; returns true if it is the terminal, which the game cannot read. */
  private catStdin(): boolean {
    const stdin = this.invocation.stdin;
    switch (stdin.kind) {
      case "terminal":
        return true;
      case "directory":
        this.fail(STDIN_OPERAND, "Is a directory");
        return false;
      case "text": {
        const position = this.stdinOffset;
        if (this.isOutputFile(stdin.file, position)) {
          this.fail(STDIN_OPERAND, "input file is output file");
          return false;
        }
        this.stdinOffset = encodeUtf8(stdin.text).length;
        this.copy(position === 0 ? stdin.text : "");
        return false;
      }
    }
  }

  /** Opens and copies the file `operand`, or writes why it cannot. */
  private catFile(operand: string): false {
    const { world, session } = this.invocation;
    const opened = openForReading(world, session, operand);
    if (!opened.ok) {
      this.fail(operand, LOOKUP_ERROR_MESSAGES[opened.error]);
      return false;
    }
    switch (opened.opened.kind) {
      case "directory":
        // open(2) succeeds on a directory; the first read(2) fails with EISDIR.
        this.fail(operand, "Is a directory");
        return false;
      case "file": {
        const file: OpenFile = { host: session.host, path: opened.opened.path };
        if (this.isOutputFile(file, 0)) {
          this.fail(operand, "input file is output file");
          return false;
        }
        this.copy(opened.opened.content);
        return false;
      }
    }
  }

  /**
   * Whether `cat.c` refuses to read `file` at the offset `position` because it is standard
   * output's file: the same file (the game has no inodes, so the same path) and the output's
   * offset is beyond the input's. The output's offset is the end of the file for `>>`
   * (`O_APPEND`), else the bytes `cat` has written so far.
   */
  private isOutputFile(file: OpenFile | undefined, position: number): boolean {
    const output = this.stdoutFile;
    if (file === undefined || output === undefined) {
      return false;
    }
    if (file.host !== output.host || file.path !== output.path) {
      return false;
    }
    return position < this.outputOffset(output);
  }

  private outputOffset(output: OutputFile): number {
    if (!output.append) {
      return this.written;
    }
    // The file's size: as the command found it, plus the output `cat` added since.
    const found = readOpenFile(this.invocation.world, output.host, output.path);
    return encodeUtf8(found).length + this.written;
  }

  /** Writes `content` to standard output, formatted if the options ask for it. */
  private copy(content: string): void {
    this.write(this.formatter === undefined ? content : this.formatter.formatInput(content));
  }

  private write(text: string): void {
    if (text === "") {
      return;
    }
    this.written += encodeUtf8(text).length;
    this.invocation.stdout(text);
  }

  /** Writes `cat: NAME: message` like `error (0, errno, "%s", quotef (infile))`. */
  private fail(operand: string, message: string): void {
    this.invocation.stderr(`${this.invocation.name}: ${shellQuote(operand, ":")}: ${message}\n`);
    this.failed = true;
  }
}
