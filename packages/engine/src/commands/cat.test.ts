import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { runScript, type ScriptResult, type ShellEvent } from "../interpreter";
import { lookup } from "../lookup";
import { parse } from "../parser";
import { createSession, type Session } from "../session";
import { findHost, type World } from "../world";
import { buildWorld } from "../world-builder";
import { COMMANDS } from ".";

const START = 1_700_000_000_000;

const NOTES = "hello\nworld\n";

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
          "/home/alice/notes.txt": NOTES,
          "/home/alice/empty.txt": "",
          "/home/alice/partial.txt": "no newline",
          "/home/alice/blank.txt": "\n\n\na\n\n\nb\n",
          "/home/alice/tabs.txt": "a\tb\r\nc\r\n",
          "/home/alice/control.txt": "\x1b[1m\x7f\x01\n",
          "/home/alice/umlaut.txt": "Übersicht ä\n",
          "/home/alice/cr.txt": "line\r",
          "/home/alice/lf.txt": "\nnext\n",
          "/home/alice/my file.txt": "spaced\n",
          "/home/alice/a:b": "colon\n",
          "/home/alice/secret.txt": { content: "secret\n", mode: 0o200 },
          "/home/alice/docs/": {},
          "/srv/closed/": { mode: 0o700 },
          "/srv/closed/inside.txt": "inside\n",
        },
      },
    ],
  },
  createGameClock(START),
);

const alice = createSession(world, "ws01", "alice");
const root = createSession(world, "ws01", "root");

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

const TERMINAL_INPUT: ShellEvent = {
  kind: "notice",
  command: "cat",
  notice: { key: "terminal-input-not-simulated" },
};

function fileContent(current: World, path: string): string {
  const host = findHost(current, "ws01");
  if (host === undefined) {
    throw new Error("no host ws01");
  }
  const found = lookup(host.root, root.credentials, "/", path);
  if (!found.ok || found.node.kind !== "file") {
    throw new Error(`no file at ${path}`);
  }
  return found.node.content;
}

const TRY_HELP = "Try 'cat --help' for more information.\n";

describe("cat with files", () => {
  test("writes a file", () => {
    const result = run("cat notes.txt");
    expect(result.events).toEqual([stdout(NOTES)]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("writes several files one after the other, without adding line breaks", () => {
    expect(run("cat notes.txt partial.txt notes.txt").events).toEqual([
      stdout(`${NOTES}no newline${NOTES}`),
    ]);
  });

  test("an empty file writes nothing", () => {
    const result = run("cat empty.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("reads absolute paths and names with spaces and colons", () => {
    expect(run("cat /home/alice/notes.txt 'my file.txt' a:b").events).toEqual([
      stdout(`${NOTES}spaced\ncolon\n`),
    ]);
  });

  test("copies control characters, carriage returns and other characters unchanged", () => {
    expect(run("cat tabs.txt control.txt umlaut.txt").events).toEqual([
      stdout("a\tb\r\nc\r\n\x1b[1m\x7f\x01\nÜbersicht ä\n"),
    ]);
  });

  test("`-u` is ignored", () => {
    expect(run("cat -u notes.txt").events).toEqual([stdout(NOTES)]);
  });

  test("`--` ends the options, so `-n` after it is a file name", () => {
    const result = run("cat -- -n");
    expect(result.events).toEqual([stderr("cat: -n: No such file or directory\n")]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("options may follow the operands", () => {
    expect(run("cat notes.txt -n").events).toEqual([stdout("     1\thello\n     2\tworld\n")]);
  });

  test("root reads files that others cannot", () => {
    expect(run("cat /srv/closed/inside.txt /home/alice/secret.txt", root).events).toEqual([
      stdout("inside\nsecret\n"),
    ]);
  });

  test("its output goes into a pipe and a file", () => {
    expect(run("cat notes.txt | cat").events).toEqual([stdout(NOTES)]);
    const result = run("cat notes.txt partial.txt > out.txt");
    expect(result.events).toEqual([]);
    expect(fileContent(result.world, "/home/alice/out.txt")).toBe(`${NOTES}no newline`);
  });
});

describe("cat with standard input", () => {
  test("without operands it copies standard input from a pipe", () => {
    expect(run("echo hi | cat").events).toEqual([stdout("hi\n")]);
  });

  test("`-` stands for standard input between files", () => {
    expect(run("echo hi | cat partial.txt - notes.txt").events).toEqual([
      stdout(`no newlinehi\n${NOTES}`),
    ]);
  });

  test("standard input is read only once; a second `-` finds its end", () => {
    expect(run("echo hi | cat - notes.txt -").events).toEqual([stdout(`hi\n${NOTES}`)]);
  });

  test("reads a file from `<`", () => {
    expect(run("cat < notes.txt").events).toEqual([stdout(NOTES)]);
    expect(run("cat - - < notes.txt").events).toEqual([stdout(NOTES)]);
  });

  test("an empty pipe gives no output", () => {
    const result = run("cat empty.txt | cat");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("line numbers go on from the files into standard input", () => {
    expect(run("echo third | cat -n notes.txt -").events).toEqual([
      stdout("     1\thello\n     2\tworld\n     3\tthird\n"),
    ]);
  });

  test("without operands on the terminal it stops the input with a game notice", () => {
    const result = run("cat; echo after");
    expect(result.events).toEqual([TERMINAL_INPUT]);
  });

  test("the output before `-` on the terminal stays, then the input stops", () => {
    expect(run("cat notes.txt - partial.txt").events).toEqual([stdout(NOTES), TERMINAL_INPUT]);
  });

  test("the terminal notice also comes with formatting options and into a file", () => {
    const result = run("cat -n notes.txt - > out.txt");
    expect(result.events).toEqual([TERMINAL_INPUT]);
    expect(fileContent(result.world, "/home/alice/out.txt")).toBe("     1\thello\n     2\tworld\n");
  });

  test("a directory from `<` is an error for `-`", () => {
    const result = run("cat notes.txt < docs");
    expect(result.events).toEqual([stdout(NOTES)]);
    const fromStdin = run("cat < docs");
    expect(fromStdin.events).toEqual([stderr("cat: -: Is a directory\n")]);
    expect(fromStdin.session.exitStatus).toBe(1);
  });
});

describe("cat formatting options", () => {
  test("`-n` and `--number` number all lines across the files", () => {
    const expected = "     1\thello\n     2\tworld\n     3\thello\n     4\tworld\n";
    expect(run("cat -n notes.txt notes.txt").events).toEqual([stdout(expected)]);
    expect(run("cat --number notes.txt notes.txt").events).toEqual([stdout(expected)]);
  });

  test("long options may be abbreviated where they are unambiguous", () => {
    expect(run("cat --squeeze blank.txt").events).toEqual([stdout("\na\n\nb\n")]);
    expect(run("cat --num notes.txt").events).toEqual([
      stderr(
        "cat: option '--num' is ambiguous; possibilities: '--number-nonblank' '--number'\n" +
          TRY_HELP,
      ),
    ]);
  });

  test("`-n` numbers empty lines", () => {
    expect(run("cat -n blank.txt").events).toEqual([
      stdout("     1\t\n     2\t\n     3\t\n     4\ta\n     5\t\n     6\t\n     7\tb\n"),
    ]);
  });

  test("a file without a final line break goes on in the next one without a number", () => {
    expect(run("cat -n partial.txt notes.txt").events).toEqual([
      stdout("     1\tno newlinehello\n     2\tworld\n"),
    ]);
  });

  test("`-b` and `--number-nonblank` number only nonempty lines and override `-n`", () => {
    const expected = "\n\n\n     1\ta\n\n\n     2\tb\n";
    expect(run("cat -b blank.txt").events).toEqual([stdout(expected)]);
    expect(run("cat --number-nonblank blank.txt").events).toEqual([stdout(expected)]);
    expect(run("cat -nb blank.txt").events).toEqual([stdout(expected)]);
    expect(run("cat -bn blank.txt").events).toEqual([stdout(expected)]);
  });

  test("`-s` and `--squeeze-blank` keep one of several empty lines", () => {
    expect(run("cat -s blank.txt").events).toEqual([stdout("\na\n\nb\n")]);
    expect(run("cat --squeeze-blank blank.txt").events).toEqual([stdout("\na\n\nb\n")]);
    expect(run("cat -sn blank.txt").events).toEqual([
      stdout("     1\t\n     2\ta\n     3\t\n     4\tb\n"),
    ]);
  });

  test("`-E` and `--show-ends` mark the ends of lines", () => {
    expect(run("cat -E notes.txt").events).toEqual([stdout("hello$\nworld$\n")]);
    expect(run("cat --show-ends tabs.txt").events).toEqual([stdout("a\tb^M$\nc^M$\n")]);
  });

  test("@differential `-E` shows a carriage return at the end of one file before the next file's line break", () => {
    expect(run("cat -E cr.txt lf.txt").events).toEqual([stdout("line^M$\nnext$\n")]);
    expect(run("cat -E cr.txt notes.txt").events).toEqual([stdout("line\rhello$\nworld$\n")]);
    expect(run("cat -E cr.txt").events).toEqual([stdout("line\r")]);
  });

  test("a failing file between them does not end the waiting carriage return", () => {
    const result = run("cat -E cr.txt missing lf.txt");
    expect(result.events).toEqual([
      stdout("line"),
      stderr("cat: missing: No such file or directory\n"),
      stdout("^M$\nnext$\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("`-T` and `--show-tabs` show tabs as `^I`", () => {
    expect(run("cat -T tabs.txt").events).toEqual([stdout("a^Ib\r\nc\r\n")]);
    expect(run("cat --show-tabs tabs.txt").events).toEqual([stdout("a^Ib\r\nc\r\n")]);
  });

  test("`-v` and `--show-nonprinting` use the `^` and `M-` notation, except for tabs", () => {
    expect(run("cat -v tabs.txt control.txt umlaut.txt").events).toEqual([
      stdout("a\tb^M\nc^M\n^[[1m^?^A\nM-CM-^\\bersicht M-CM-$\n"),
    ]);
    expect(run("cat --show-nonprinting control.txt").events).toEqual([stdout("^[[1m^?^A\n")]);
  });

  test("`-A` and `--show-all` are `-vET`", () => {
    expect(run("cat -A tabs.txt").events).toEqual([stdout("a^Ib^M$\nc^M$\n")]);
    expect(run("cat --show-all tabs.txt").events).toEqual([stdout("a^Ib^M$\nc^M$\n")]);
  });

  test("`-e` is `-vE` and `-t` is `-vT`", () => {
    expect(run("cat -e tabs.txt control.txt").events).toEqual([
      stdout("a\tb^M$\nc^M$\n^[[1m^?^A$\n"),
    ]);
    expect(run("cat -t tabs.txt control.txt").events).toEqual([stdout("a^Ib^M\nc^M\n^[[1m^?^A\n")]);
  });

  test("options combine", () => {
    expect(run("cat -bsA blank.txt tabs.txt").events).toEqual([
      stdout("$\n     1\ta$\n$\n     2\tb$\n     3\ta^Ib^M$\n     4\tc^M$\n"),
    ]);
  });
});

describe("cat errors", () => {
  test.each([
    ["cat missing.txt", "cat: missing.txt: No such file or directory\n"],
    ["cat docs/missing.txt", "cat: docs/missing.txt: No such file or directory\n"],
    ["cat notes.txt/x", "cat: notes.txt/x: Not a directory\n"],
    ["cat secret.txt", "cat: secret.txt: Permission denied\n"],
    ["cat /srv/closed/inside.txt", "cat: /srv/closed/inside.txt: Permission denied\n"],
    ["cat docs", "cat: docs: Is a directory\n"],
    ["cat -n docs", "cat: docs: Is a directory\n"],
    ["cat 'my missing file'", "cat: 'my missing file': No such file or directory\n"],
    ["cat x:y", "cat: 'x:y': No such file or directory\n"],
    ['cat "it\'s"', 'cat: "it\'s": No such file or directory\n'],
  ])("%s", (input, message) => {
    const result = run(input);
    expect(result.events).toEqual([stderr(message)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("goes on with the next file after an error and exits with 1", () => {
    const result = run("cat missing.txt notes.txt docs partial.txt");
    expect(result.events).toEqual([
      stderr("cat: missing.txt: No such file or directory\n"),
      stdout(NOTES),
      stderr("cat: docs: Is a directory\n"),
      stdout("no newline"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("an invalid option gives the usage error with exit status 1", () => {
    const result = run("cat -x notes.txt");
    expect(result.events).toEqual([stderr(`cat: invalid option -- 'x'\n${TRY_HELP}`)]);
    expect(result.session.exitStatus).toBe(1);
    expect(run("cat --numbers notes.txt").events).toEqual([
      stderr(`cat: unrecognized option '--numbers'\n${TRY_HELP}`),
    ]);
  });

  test("an ambiguous abbreviation gives glibc's message", () => {
    expect(run("cat --show notes.txt").events).toEqual([
      stderr(
        "cat: option '--show' is ambiguous; possibilities: '--show-nonprinting' " +
          `'--show-ends' '--show-tabs' '--show-all'\n${TRY_HELP}`,
      ),
    ]);
  });

  test.each([
    ["cat --help", "--help"],
    ["cat --version notes.txt", "--version"],
    ["cat -n --vers", "--version"],
  ])("%s stops the input with a game notice", (input, option) => {
    expect(run(input).events).toEqual([
      { kind: "notice", command: "cat", notice: { key: "option-not-simulated", option } },
    ]);
  });
});

describe("cat with its own output file", () => {
  test("`>>` to a nonempty input file is an error, and the file stays as it was", () => {
    const result = run("cat notes.txt >> notes.txt");
    expect(result.events).toEqual([stderr("cat: notes.txt: input file is output file\n")]);
    expect(result.session.exitStatus).toBe(1);
    expect(fileContent(result.world, "/home/alice/notes.txt")).toBe(NOTES);
  });

  test("the file is the same under another name", () => {
    const result = run("cat ./notes.txt >> /home/alice/notes.txt");
    expect(result.events).toEqual([stderr("cat: ./notes.txt: input file is output file\n")]);
  });

  test("the other files of `>>` are still added", () => {
    const result = run("cat notes.txt partial.txt >> partial.txt");
    expect(result.events).toEqual([stderr("cat: partial.txt: input file is output file\n")]);
    expect(result.session.exitStatus).toBe(1);
    expect(fileContent(result.world, "/home/alice/partial.txt")).toBe(`no newline${NOTES}`);
  });

  test("`>>` to an empty file is no error while the file stays empty", () => {
    const result = run("cat empty.txt >> empty.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("`>>` to an empty file is an error once `cat` has added to it", () => {
    const result = run("cat notes.txt empty.txt >> empty.txt");
    expect(result.events).toEqual([stderr("cat: empty.txt: input file is output file\n")]);
    expect(fileContent(result.world, "/home/alice/empty.txt")).toBe(NOTES);
  });

  test("`>` empties the file first, so `cat` reads nothing and the file is lost", () => {
    const result = run("cat notes.txt > notes.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(fileContent(result.world, "/home/alice/notes.txt")).toBe("");
  });

  test("@differential with `>` it is an error once `cat` has written to the file", () => {
    const result = run("cat partial.txt notes.txt > notes.txt");
    expect(result.events).toEqual([stderr("cat: notes.txt: input file is output file\n")]);
    expect(result.session.exitStatus).toBe(1);
    expect(fileContent(result.world, "/home/alice/notes.txt")).toBe("no newline");
  });

  test("with `>` an empty file before it writes nothing, so it is no error", () => {
    const result = run("cat empty.txt notes.txt > notes.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("the formatted output counts for the offset of `>`", () => {
    const result = run("cat -n empty.txt notes.txt > notes.txt");
    expect(result.events).toEqual([]);
    const numbered = run("cat -E lf.txt notes.txt > notes.txt");
    expect(numbered.events).toEqual([stderr("cat: notes.txt: input file is output file\n")]);
    expect(fileContent(numbered.world, "/home/alice/notes.txt")).toBe("$\nnext$\n");
  });

  test("standard input from `<` is checked too", () => {
    const result = run("cat < notes.txt >> notes.txt");
    expect(result.events).toEqual([stderr("cat: -: input file is output file\n")]);
    expect(result.session.exitStatus).toBe(1);
    expect(run("cat - - < notes.txt >> notes.txt").events).toEqual([
      stderr("cat: -: input file is output file\ncat: -: input file is output file\n"),
    ]);
  });

  test("standard input from `<` is no error after `>` emptied it", () => {
    const result = run("cat < notes.txt > notes.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("standard input from `<` is an error once `cat` has written to the file with `>`", () => {
    // `>` emptied the file, so the first `-` reads nothing; the second one is at offset 0 while
    // the output is at 12 after the other file.
    const result = run("cat - notes.txt - < partial.txt > partial.txt");
    expect(result.events).toEqual([stderr("cat: -: input file is output file\n")]);
    expect(result.session.exitStatus).toBe(1);
    expect(fileContent(result.world, "/home/alice/partial.txt")).toBe(NOTES);
  });

  test("other files and standard error to the same file are no error", () => {
    const result = run("cat notes.txt >> out.txt");
    expect(result.events).toEqual([]);
    expect(fileContent(result.world, "/home/alice/out.txt")).toBe(NOTES);
    expect(run("cat notes.txt 2>> notes.txt").events).toEqual([stdout(NOTES)]);
  });

  test("a pipe with the same text as a file is no error", () => {
    expect(run("cat notes.txt | cat >> notes.txt").events).toEqual([]);
  });
});
