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

const twelveFiles = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [
    `/home/alice/many/file${String(i + 1).padStart(2, "0")}`,
    "",
  ]),
);

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
          "/home/alice/.bashrc": "",
          "/home/alice/.profile": "",
          "/home/alice/docs/report.txt": "",
          "/home/alice/docs/Übersicht.txt": "",
          "/home/alice/notes.txt": "hello\n",
          "/home/alice/perm/secret/": { mode: 0o300 },
          "/home/alice/perm/readonly/": { mode: 0o600 },
          "/home/alice/perm/readonly/a.txt": "",
          "/home/alice/projects/": {},
          "/home/alice/todo.txt": "",
          "/home/alice/odd/it's": "",
          "/home/alice/odd/my file.txt": "",
          "/home/alice/odd/plain": "",
          "/home/alice/names/my dir/": {},
          "/home/alice/names/a:b/": {},
          "/home/alice/names/notes.txt": "",
          "/home/alice/wide/日本語": "",
          "/home/alice/wide/語": "",
          ...twelveFiles,
          "/srv/closed/": { mode: 0o700 },
          "/srv/closed/inside.txt": "",
        },
      },
    ],
  },
  createGameClock(START),
);

const alice = createSession(world, "ws01", "alice");
const root = createSession(world, "ws01", "root");

const commands = createCommandLookup(COMMANDS);

interface RunOptions {
  readonly session?: Session;
  readonly columns?: number;
}

function run(input: string, options: RunOptions = {}): ScriptResult {
  const parsed = parse(input);
  if (!parsed.ok) {
    throw new Error(`test input does not parse: ${input}`);
  }
  return runScript({
    world,
    session: options.session ?? alice,
    script: parsed.script,
    commands,
    clock: createGameClock(START),
    terminal: { columns: options.columns ?? 80 },
  });
}

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

/** Runs `input` with its standard output redirected to a file and returns what the file got. */
function runIntoFile(input: string): { readonly content: string; readonly result: ScriptResult } {
  const result = run(`${input} > /home/alice/out.txt`);
  return { content: fileContent(result.world, "/home/alice/out.txt"), result };
}

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

const TRY_HELP = "Try 'ls --help' for more information.\n";

describe("ls on a terminal", () => {
  test("lists the working directory in columns, sorted by name, without hidden files", () => {
    const result = run("ls");
    expect(result.events).toEqual([
      stdout("docs  many  names  notes.txt  odd  perm  projects  todo.txt  wide\n"),
    ]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("fills the columns from top to bottom with the most columns that fit", () => {
    expect(run("ls", { columns: 20 }).events).toEqual([
      stdout("docs\t   perm\nmany\t   projects\nnames\t   todo.txt\nnotes.txt  wide\nodd\n"),
    ]);
  });

  test("keeps every line shorter than the terminal", () => {
    expect(run("ls notes.txt todo.txt", { columns: 20 }).events).toEqual([
      stdout("notes.txt  todo.txt\n"),
    ]);
    expect(run("ls notes.txt todo.txt", { columns: 19 }).events).toEqual([
      stdout("notes.txt\ntodo.txt\n"),
    ]);
  });

  test("writes one name per line if not even two columns fit", () => {
    expect(run("ls", { columns: 10 }).events).toEqual([
      stdout("docs\nmany\nnames\nnotes.txt\nodd\nperm\nprojects\ntodo.txt\nwide\n"),
    ]);
    expect(run("ls", { columns: 1 }).events).toEqual([
      stdout("docs\nmany\nnames\nnotes.txt\nodd\nperm\nprojects\ntodo.txt\nwide\n"),
    ]);
  });

  test("fills the gaps between the columns with tabs at every eighth cell", () => {
    expect(run("ls many", { columns: 40 }).events).toEqual([
      stdout(
        "file01\tfile04\tfile07\tfile10\n" +
          "file02\tfile05\tfile08\tfile11\n" +
          "file03\tfile06\tfile09\tfile12\n",
      ),
    ]);
  });

  test("measures wide characters with two cells", () => {
    expect(run("ls wide").events).toEqual([stdout("日本語\t語\n")]);
  });

  test("quotes names a shell would need quoted and moves the others one space aside", () => {
    expect(run("ls odd").events).toEqual([stdout("\"it's\"\t'my file.txt'   plain\n")]);
  });

  test("quotes the names of listed directories, there also for a colon", () => {
    expect(run("ls names").events).toEqual([stdout(" a:b  'my dir'\t notes.txt\n")]);
    expect(run("ls 'names/my dir' names/a:b").events).toEqual([
      stdout("'names/a:b':\n\n'names/my dir':\n"),
    ]);
  });

  test("@differential moves operand files aside when another operand needs quotes", () => {
    expect(run("ls 'names/my dir' notes.txt").events).toEqual([
      stdout(" notes.txt\n\n'names/my dir':\n"),
    ]);
    expect(run("ls 'no such file' notes.txt").events).toEqual([
      stderr("ls: cannot access 'no such file': No such file or directory\n"),
      stdout(" notes.txt\n"),
    ]);
  });
});

describe("ls into a pipe or a file", () => {
  test("writes one name per line, without quotes", () => {
    const { content, result } = runIntoFile("ls odd");
    expect(content).toBe("it's\nmy file.txt\nplain\n");
    expect(result.events).toEqual([]);
    expect(runIntoFile("ls names").content).toBe("a:b\nmy dir\nnotes.txt\n");
  });

  test("writes the names of listed directories without quotes", () => {
    expect(runIntoFile("ls 'names/my dir' names/a:b notes.txt").content).toBe(
      "notes.txt\n\nnames/a:b:\n\nnames/my dir:\n",
    );
  });

  test("writes one name per line when ls is not the last command of a pipeline", () => {
    const result = run("ls docs | whoami");
    expect(result.events).toEqual([stdout("alice\n")]);
  });
});

describe("ls -1", () => {
  test("writes one name per line on a terminal too, quoted, but not moved aside", () => {
    expect(run("ls -1 odd").events).toEqual([stdout("\"it's\"\n'my file.txt'\nplain\n")]);
    expect(run("ls -1").events).toEqual([
      stdout("docs\nmany\nnames\nnotes.txt\nodd\nperm\nprojects\ntodo.txt\nwide\n"),
    ]);
  });

  test("has no long name; --format=single-column is not simulated", () => {
    expect(run("ls --format=single-column").events).toEqual([
      {
        kind: "notice",
        command: "ls",
        notice: { key: "option-not-simulated", option: "--format" },
      },
    ]);
  });
});

describe("ls -a", () => {
  test("lists hidden files and . and .., sorted by their letters", () => {
    expect(run("ls -a").events).toEqual([
      stdout(
        ".   .bashrc  many   notes.txt  perm\t projects  wide\n" +
          "..  docs     names  odd        .profile  todo.txt\n",
      ),
    ]);
  });

  test("lists . and .. in an empty directory", () => {
    expect(run("ls -a projects").events).toEqual([stdout(".  ..\n")]);
    expect(run("ls projects").events).toEqual([]);
  });

  test("is the same as --all", () => {
    expect(run("ls --all docs").events).toEqual(run("ls -a docs").events);
    expect(run("ls -a docs").events).toEqual([stdout(".  ..  report.txt  Übersicht.txt\n")]);
  });

  test("works in clusters and after operands", () => {
    const expected = [stdout(".\n..\nreport.txt\nÜbersicht.txt\n")];
    expect(run("ls -a1 docs").events).toEqual(expected);
    expect(run("ls -1a docs").events).toEqual(expected);
    expect(run("ls docs -1 -a").events).toEqual(expected);
  });
});

describe("ls with operands", () => {
  test("lists a file operand by the name given, also a hidden one", () => {
    expect(run("ls notes.txt").events).toEqual([stdout("notes.txt\n")]);
    expect(run("ls .bashrc").events).toEqual([stdout(".bashrc\n")]);
    expect(run("ls /home/alice/notes.txt").events).toEqual([stdout("/home/alice/notes.txt\n")]);
  });

  test("lists one directory operand without its name", () => {
    expect(run("ls docs").events).toEqual([stdout("report.txt  Übersicht.txt\n")]);
    expect(run("ls /srv/closed", { session: root }).events).toEqual([stdout("inside.txt\n")]);
  });

  test("lists the files first, then each directory after a blank line and its name", () => {
    expect(run("ls todo.txt docs notes.txt").events).toEqual([
      stdout("notes.txt  todo.txt\n\ndocs:\nreport.txt  Übersicht.txt\n"),
    ]);
  });

  test("names every directory when there are several, also empty ones", () => {
    expect(run("ls projects docs").events).toEqual([
      stdout("docs:\nreport.txt  Übersicht.txt\n\nprojects:\n"),
    ]);
  });

  test("lists a directory given twice twice", () => {
    expect(run("ls projects projects").events).toEqual([stdout("projects:\n\nprojects:\n")]);
  });

  test("lists a directory it may read but not search", () => {
    expect(run("ls perm/readonly").events).toEqual([stdout("a.txt\n")]);
  });

  test("treats an operand after -- as a name", () => {
    expect(run("ls -- -a").events).toEqual([
      stderr("ls: cannot access '-a': No such file or directory\n"),
    ]);
  });
});

describe("ls errors", () => {
  test("reports an operand that does not exist with exit status 2", () => {
    const result = run("ls missing");
    expect(result.events).toEqual([
      stderr("ls: cannot access 'missing': No such file or directory\n"),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("reports all failed operands first and still lists the others", () => {
    const result = run("ls missing notes.txt also-missing");
    expect(result.events).toEqual([
      stderr(
        "ls: cannot access 'missing': No such file or directory\n" +
          "ls: cannot access 'also-missing': No such file or directory\n",
      ),
      stdout("notes.txt\n"),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("names the directory when another operand failed", () => {
    expect(run("ls missing docs").events).toEqual([
      stderr("ls: cannot access 'missing': No such file or directory\n"),
      stdout("docs:\nreport.txt  Übersicht.txt\n"),
    ]);
  });

  test("reports a path through a file", () => {
    const result = run("ls notes.txt/x");
    expect(result.events).toEqual([stderr("ls: cannot access 'notes.txt/x': Not a directory\n")]);
    expect(result.session.exitStatus).toBe(2);
    expect(run("ls notes.txt/").events).toEqual([
      stderr("ls: cannot access 'notes.txt/': Not a directory\n"),
    ]);
  });

  test("reports a path through a directory it may not search", () => {
    const result = run("ls /srv/closed/inside.txt");
    expect(result.events).toEqual([
      stderr("ls: cannot access '/srv/closed/inside.txt': Permission denied\n"),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("reports a directory it may not read, without its name", () => {
    const result = run("ls perm/secret");
    expect(result.events).toEqual([
      stderr("ls: cannot open directory 'perm/secret': Permission denied\n"),
    ]);
    expect(result.session.exitStatus).toBe(2);
    expect(run("ls /srv/closed").events).toEqual([
      stderr("ls: cannot open directory '/srv/closed': Permission denied\n"),
    ]);
  });

  test("names the first listed directory without a blank line before it", () => {
    const result = run("ls perm/secret projects docs");
    expect(result.events).toEqual([
      stdout("docs:\nreport.txt  Übersicht.txt\n"),
      stderr("ls: cannot open directory 'perm/secret': Permission denied\n"),
      stdout("\nprojects:\n"),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("quotes names in messages like the shell", () => {
    expect(run("ls \"it's gone\" 'a b'").events).toEqual([
      stderr(
        'ls: cannot access "it\'s gone": No such file or directory\n' +
          "ls: cannot access 'a b': No such file or directory\n",
      ),
    ]);
  });

  test("cannot open the working directory without search permission", () => {
    const inside: Session = { ...alice, cwd: "/home/alice/perm/readonly" };
    const result = run("ls", { session: inside });
    expect(result.events).toEqual([stderr("ls: cannot open directory '.': Permission denied\n")]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("lists nothing in a working directory that was removed", () => {
    const removed: Session = { ...alice, cwd: "/home/alice/gone" };
    for (const input of ["ls", "ls -a"]) {
      const result = run(input, { session: removed });
      expect(result.events).toEqual([]);
      expect(result.session.exitStatus).toBe(0);
    }
  });
});

describe("ls options", () => {
  test("stops with a notice for an option it does not simulate yet", () => {
    for (const [input, option] of [
      ["ls -lh", "-h"],
      ["ls -aR docs", "-R"],
      ["ls --color=auto", "--color"],
      ["ls --help", "--help"],
    ] as const) {
      expect(run(input).events).toEqual([
        { kind: "notice", command: "ls", notice: { key: "option-not-simulated", option } },
      ]);
    }
  });

  test("writes a usage error with exit status 2 for an invalid option", () => {
    const result = run("ls -y");
    expect(result.events).toEqual([stderr(`ls: invalid option -- 'y'\n${TRY_HELP}`)]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("writes a usage error for an ambiguous abbreviation", () => {
    const result = run("ls --al");
    expect(result.events).toEqual([
      stderr(`ls: option '--al' is ambiguous; possibilities: '--all' '--almost-all'\n${TRY_HELP}`),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("writes a usage error for a missing option argument", () => {
    const result = run("ls docs --width");
    expect(result.events).toEqual([
      stderr(`ls: option '--width' requires an argument\n${TRY_HELP}`),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });
});

describe("ls and environment variables", () => {
  test("stops with a notice for TABSIZE when it writes in columns", () => {
    expect(run("TABSIZE=4 ls").events).toEqual([
      {
        kind: "notice",
        command: "ls",
        notice: { key: "variable-not-simulated", variable: "TABSIZE" },
      },
    ]);
  });

  test("ignores TABSIZE when it writes one name per line", () => {
    expect(run("TABSIZE=4 ls -1 docs").events).toEqual([stdout("report.txt\nÜbersicht.txt\n")]);
    expect(runIntoFile("TABSIZE=4 ls docs").content).toBe("report.txt\nÜbersicht.txt\n");
  });

  test("stops with a notice for QUOTING_STYLE", () => {
    expect(run("QUOTING_STYLE=literal ls -1 docs").events).toEqual([
      {
        kind: "notice",
        command: "ls",
        notice: { key: "variable-not-simulated", variable: "QUOTING_STYLE" },
      },
    ]);
  });
});
