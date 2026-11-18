import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { runScript, type ScriptResult, type ShellEvent } from "../interpreter";
import { parse } from "../parser";
import { createSession, type Session } from "../session";
import { buildWorld } from "../world-builder";
import { COMMANDS } from ".";

const START = 1_700_000_000_000;

const LOG = "INFO start\nERROR disk full\ninfo retry\nWARN slow\nerror: again\n";

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [
          { name: "root", gid: 0 },
          { name: "alice", gid: 1000 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "alice", uid: 1000 },
        ],
        files: {
          "/home/alice/app.log": LOG,
          "/home/alice/notes.txt": "cat\nconcat\ndog\n",
          "/home/alice/partial.txt": "no newline here",
          "/home/alice/empty.txt": "",
          "/home/alice/data.bin": "head\0ERROR inside\n",
          "/home/alice/secret.txt": { content: "ERROR secret\n", mode: 0o200 },
          "/home/alice/logs/a.log": "ERROR in a\n",
          "/home/alice/logs/sub/b.log": "fine\nERROR in b\n",
          "/home/alice/logs/clean.log": "all fine\n",
          "/home/alice/locked/": { mode: 0o300 },
          "/home/alice/locked/x.log": "ERROR hidden\n",
          "/home/alice/plain/": {},
          "/home/alice/plain/one.txt": "ERROR one\n",
        },
      },
    ],
  },
  createGameClock(START),
);

const alice = createSession(world, "ws01", "alice");

const commands = createCommandLookup(COMMANDS);

function run(input: string, session: Session = alice): ScriptResult {
  const parsed = parse(input);
  if (!parsed.ok) {
    throw new Error(`test input does not parse: ${input}`);
  }
  return runScript({
    world,
    session,
    script: parsed.script,
    commands,
    clock: createGameClock(START),
    terminal: { columns: 80 },
  });
}

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

const USAGE =
  "Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n";

describe("grep: lines", () => {
  test("prints the matching lines with exit status 0", () => {
    const result = run("grep ERROR app.log");
    expect(result.events).toEqual([stdout("ERROR disk full\n")]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("exits with 1 when no line matches", () => {
    const result = run("grep nothing app.log");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("adds a line break to a last line without one", () => {
    expect(run("grep here partial.txt").events).toEqual([stdout("no newline here\n")]);
  });

  test("an empty pattern matches every line", () => {
    expect(run("grep '' notes.txt").events).toEqual([stdout("cat\nconcat\ndog\n")]);
  });

  test("reads basic regular expressions", () => {
    expect(run("grep '^[A-Z]* ' app.log").events).toEqual([
      stdout("INFO start\nERROR disk full\nWARN slow\n"),
    ]);
  });

  test("a pattern with a line break is two patterns", () => {
    expect(run("grep 'WARN\nretry' app.log").events).toEqual([stdout("info retry\nWARN slow\n")]);
  });

  test("names the file before each line with several files", () => {
    expect(run("grep cat notes.txt app.log notes.txt").events).toEqual([
      stdout("notes.txt:cat\nnotes.txt:concat\nnotes.txt:cat\nnotes.txt:concat\n"),
    ]);
  });
});

describe("grep: options", () => {
  test.each(["-i", "-y", "--ignore-case"])("%s ignores case", (option) => {
    expect(run(`grep ${option} error app.log`).events).toEqual([
      stdout("ERROR disk full\nerror: again\n"),
    ]);
  });

  test("--no-ignore-case undoes -i", () => {
    expect(run("grep -i --no-ignore-case error app.log").events).toEqual([
      stdout("error: again\n"),
    ]);
  });

  test.each(["-v", "--invert-match"])("%s selects the lines that do not match", (option) => {
    expect(run(`grep ${option} -i error app.log`).events).toEqual([
      stdout("INFO start\ninfo retry\nWARN slow\n"),
    ]);
  });

  test.each(["-n", "--line-number"])("%s numbers the lines", (option) => {
    expect(run(`grep ${option} -i info app.log`).events).toEqual([
      stdout("1:INFO start\n3:info retry\n"),
    ]);
  });

  test("the file name comes before the line number", () => {
    expect(run("grep -Hn dog notes.txt").events).toEqual([stdout("notes.txt:3:dog\n")]);
  });

  test.each(["-c", "--count"])("%s counts the selected lines", (option) => {
    expect(run(`grep ${option} -i error app.log notes.txt`).events).toEqual([
      stdout("app.log:2\nnotes.txt:0\n"),
    ]);
  });

  test("-c with -v counts the other lines", () => {
    expect(run("grep -cv cat notes.txt").events).toEqual([stdout("1\n")]);
  });

  test.each(["-l", "--files-with-matches"])("%s lists the files with a selected line", (option) => {
    const result = run(`grep ${option} cat app.log notes.txt notes.txt`);
    expect(result.events).toEqual([stdout("notes.txt\nnotes.txt\n")]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("-L lists the files without one, with the exit status of the lines", () => {
    const result = run("grep -L cat app.log notes.txt");
    expect(result.events).toEqual([stdout("app.log\n")]);
    expect(result.session.exitStatus).toBe(0);
    expect(run("grep -L zebra notes.txt").session.exitStatus).toBe(1);
  });

  test("-l overrides -c", () => {
    expect(run("grep -lc cat notes.txt").events).toEqual([stdout("notes.txt\n")]);
  });

  test.each(["-q", "--quiet", "--silent"])(
    "%s prints nothing and only sets the exit status",
    (option) => {
      const found = run(`grep ${option} cat notes.txt`);
      expect(found.events).toEqual([]);
      expect(found.session.exitStatus).toBe(0);
      expect(run(`grep ${option} zebra notes.txt`).session.exitStatus).toBe(1);
    },
  );

  test("-q exits at the first selected line, even after an error", () => {
    const result = run("grep -q cat missing.txt notes.txt missing2.txt");
    expect(result.events).toEqual([stderr("grep: missing.txt: No such file or directory\n")]);
    expect(result.session.exitStatus).toBe(0);
  });

  test.each(["-w", "--word-regexp"])("%s matches whole words only", (option) => {
    expect(run(`grep ${option} cat notes.txt`).events).toEqual([stdout("cat\n")]);
  });

  test.each(["-x", "--line-regexp"])("%s matches whole lines only", (option) => {
    expect(run(`grep ${option} 'c.t' notes.txt`).events).toEqual([stdout("cat\n")]);
    expect(run(`grep ${option} -e at -e dog notes.txt`).events).toEqual([stdout("dog\n")]);
  });

  test.each(["-e", "--regexp"])(
    "%s gives the patterns, so the first operand is a file",
    (option) => {
      expect(run(`grep ${option} dog ${option} WARN notes.txt app.log`).events).toEqual([
        stdout("notes.txt:dog\napp.log:WARN slow\n"),
      ]);
    },
  );

  test("-e protects a pattern that starts with -", () => {
    expect(run("echo 'a -v b' | grep -e -v").events).toEqual([stdout("a -v b\n")]);
  });

  test.each(["-E", "--extended-regexp"])("%s reads extended regular expressions", (option) => {
    expect(run(`grep ${option} 'cat|dog' notes.txt`).events).toEqual([
      stdout("cat\nconcat\ndog\n"),
    ]);
  });

  test.each(["-F", "--fixed-strings", "--fixed-regexp"])("%s reads fixed strings", (option) => {
    expect(run(`grep ${option} 'r.y' app.log`).events).toEqual([]);
    expect(run(`grep ${option} -i 'error:' app.log`).events).toEqual([stdout("error: again\n")]);
  });

  test("-G reads basic regular expressions again", () => {
    expect(run("grep -G 'cat|dog' notes.txt").session.exitStatus).toBe(1);
  });

  test("-h leaves out the file names, -H always shows them", () => {
    expect(run("grep -h dog notes.txt notes.txt").events).toEqual([stdout("dog\ndog\n")]);
    expect(run("grep -H dog notes.txt").events).toEqual([stdout("notes.txt:dog\n")]);
  });
});

describe("grep: standard input", () => {
  test("reads standard input without a file operand", () => {
    expect(run("cat notes.txt | grep dog").events).toEqual([stdout("dog\n")]);
  });

  test("names standard input (standard input)", () => {
    expect(run("cat notes.txt | grep -c dog - notes.txt").events).toEqual([
      stdout("(standard input):1\nnotes.txt:1\n"),
    ]);
  });

  test("the terminal stops the input with a notice", () => {
    const result = run("grep dog");
    expect(result.events).toEqual([
      { kind: "notice", command: "grep", notice: { key: "terminal-input-not-simulated" } },
    ]);
  });

  test("a directory as standard input is an error", () => {
    expect(run("grep dog < logs").events).toEqual([
      stderr("grep: (standard input): Is a directory\n"),
    ]);
  });
});

describe("grep: errors with files", () => {
  test.each([
    ["missing.txt", "No such file or directory"],
    ["notes.txt/x", "Not a directory"],
    ["secret.txt", "Permission denied"],
    ["logs", "Is a directory"],
  ])("%s: %s, with exit status 2", (operand, message) => {
    const result = run(`grep ERROR ${operand}`);
    expect(result.events).toEqual([stderr(`grep: ${operand}: ${message}\n`)]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("an error makes the exit status 2 even when lines were found", () => {
    const result = run("grep dog missing.txt notes.txt");
    expect(result.events).toEqual([
      stderr("grep: missing.txt: No such file or directory\n"),
      stdout("notes.txt:dog\n"),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test.each(["-s", "--no-messages"])("%s hides the messages, but not the exit status", (option) => {
    const result = run(`grep ${option} dog missing.txt logs notes.txt`);
    expect(result.events).toEqual([stdout("notes.txt:dog\n")]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("a binary file shows a message instead of its lines", () => {
    const result = run("grep ERROR data.bin");
    expect(result.events).toEqual([stderr("grep: data.bin: binary file matches\n")]);
    expect(result.session.exitStatus).toBe(0);
    expect(run("grep -c ERROR data.bin").events).toEqual([stdout("1\n")]);
  });

  test("refuses to read the file it writes to", () => {
    const result = run("grep dog notes.txt app.log > app.log");
    expect(result.events).toEqual([stderr("grep: app.log: input file is also the output\n")]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("may read the file it writes to when it prints no lines", () => {
    expect(run("grep -c dog notes.txt >> notes.txt").session.exitStatus).toBe(0);
  });
});

describe("grep -r", () => {
  test.each(["-r", "-R", "--recursive", "--dereference-recursive"])(
    "@differential %s searches directories with their names before each line",
    (option) => {
      expect(run(`grep ${option} ERROR logs`).events).toEqual([
        stdout("logs/a.log:ERROR in a\nlogs/sub/b.log:ERROR in b\n"),
      ]);
    },
  );

  test("@differential searches the working directory without operands, without ./", () => {
    const result = run("cd logs && grep -r ERROR");
    expect(result.events).toEqual([stdout("a.log:ERROR in a\nsub/b.log:ERROR in b\n")]);
  });

  test("@differential keeps ./ for an explicit .", () => {
    expect(run("cd logs && grep -rl ERROR .").events).toEqual([stdout("./a.log\n./sub/b.log\n")]);
  });

  test("shows no names for a single file operand", () => {
    expect(run("grep -r ERROR logs/a.log").events).toEqual([stdout("ERROR in a\n")]);
  });

  test("@differential -h leaves out the names", () => {
    expect(run("grep -rh ERROR logs").events).toEqual([stdout("ERROR in a\nERROR in b\n")]);
  });

  test("reports a directory it cannot read and goes on", () => {
    const result = run("grep -r ERROR locked plain");
    expect(result.events).toEqual([
      stderr("grep: locked: Permission denied\n"),
      stdout("plain/one.txt:ERROR one\n"),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("@differential -c counts per file", () => {
    expect(run("grep -rc ERROR logs").events).toEqual([
      stdout("logs/a.log:1\nlogs/sub/b.log:1\nlogs/clean.log:0\n"),
    ]);
  });
});

describe("grep: pattern errors and warnings", () => {
  test("an invalid pattern is an error with exit status 2", () => {
    const result = run("grep '[abc' app.log");
    expect(result.events).toEqual([stderr("grep: Unmatched [, [^, [:, [., or [=\n")]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("each invalid pattern is reported", () => {
    expect(run("grep -e '\\(' -e 'a\\' app.log").events).toEqual([
      stderr("grep: Unmatched ( or \\(\ngrep: Trailing backslash\n"),
    ]);
  });

  test("a stray backslash gives a warning, and grep goes on", () => {
    const result = run("grep 'disk\\ full' app.log");
    expect(result.events).toEqual([
      stderr("grep: warning: stray \\ before white space\n"),
      stdout("ERROR disk full\n"),
    ]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("[:space:] without its brackets is an error", () => {
    expect(run("grep '[:space:]' app.log").events).toEqual([
      stderr("grep: character class syntax is [[:space:]], not [:space:]\n"),
    ]);
  });

  test("-F reads no regular expression, so nothing is invalid", () => {
    expect(run("grep -F '[abc' app.log").session.exitStatus).toBe(1);
  });
});

describe("grep: usage", () => {
  test("without a pattern prints the usage", () => {
    const result = run("grep");
    expect(result.events).toEqual([stderr(USAGE)]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("an invalid option prints glibc's message and the usage", () => {
    const result = run("grep -k dog notes.txt");
    expect(result.events).toEqual([stderr(`grep: invalid option -- 'k'\n${USAGE}`)]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("@differential two different matchers conflict", () => {
    const result = run("grep -E -F dog notes.txt");
    expect(result.events).toEqual([stderr("grep: conflicting matchers specified\n")]);
    expect(result.session.exitStatus).toBe(2);
    expect(run("grep -E -E dog notes.txt").session.exitStatus).toBe(0);
  });

  test("-v with an empty pattern selects nothing and reads nothing", () => {
    const result = run("grep -v '' missing.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(1);
  });

  test.each([
    ["grep -o dog notes.txt", "-o"],
    ["grep --color=always dog notes.txt", "--color"],
    ["grep -A 1 dog notes.txt", "-A"],
    ["grep -2 dog notes.txt", "-2"],
    ["grep -m 1 dog notes.txt", "-m"],
    ["grep -P dog notes.txt", "-P"],
    ["grep -f pats notes.txt", "-f"],
    ["grep --include='*.log' -r dog .", "--include"],
    ["grep --help", "--help"],
  ])("%s gives a notice", (input, option) => {
    expect(run(input).events).toEqual([
      { kind: "notice", command: "grep", notice: { key: "option-not-simulated", option } },
    ]);
  });
});
