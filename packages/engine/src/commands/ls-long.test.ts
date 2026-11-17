// Tests of `ls` in the long format (`-l`, `-g`, `-o`, `-G`, `-n`; ADR 0055). The other tests of
// `ls` are in `ls.test.ts`.

import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { runScript, type ScriptResult, type ShellEvent, TIME_PER_INPUT } from "../interpreter";
import { lookup } from "../lookup";
import { parse } from "../parser";
import { createSession, type Session } from "../session";
import { createWorld, findHost, type World } from "../world";
import { buildWorld } from "../world-builder";
import { COMMANDS } from ".";

/** The game time when the world is built: 2026-11-17 22:46:00 UTC. */
const START = Date.UTC(2026, 10, 17, 22, 46, 0);

/** The game time when `ls` runs: the interpreter advances the clock once per input. */
const NOW = START + TIME_PER_INPUT;

/** Half a Gregorian year, the limit of `ls` for recent times. */
const SIX_MONTHS = 15_778_476_000;

const RECENT = Date.UTC(2026, 10, 17, 9, 30);
const YESTERDAY = Date.UTC(2026, 10, 16, 10, 0);
const OLD = Date.UTC(2025, 0, 5, 9, 0);

const subdirectories = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [`/home/alice/links/big/d${String(i)}/`, {}]),
);

const built = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [
          { name: "root", gid: 0 },
          { name: "staff", gid: 50 },
          { name: "alice", gid: 1000 },
          { name: "bob", gid: 1001 },
          { name: "ghost", gid: 2001 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "alice", uid: 1000 },
          { name: "bob", uid: 1001 },
          { name: "ghost", uid: 2001 },
        ],
        files: {
          "/home/alice/basic/": { mtime: YESTERDAY },
          "/home/alice/basic/docs/": { mtime: YESTERDAY },
          "/home/alice/basic/docs/sub/": {},
          "/home/alice/basic/notes.txt": { content: "hello\n", mtime: RECENT },
          "/home/alice/empty/": {},
          "/home/alice/owners/alice.txt": "",
          "/home/alice/owners/orphan.txt": { owner: "ghost" },
          "/home/alice/owners/rootfile": { owner: "root" },
          "/home/alice/owners/shared.txt": { owner: "bob", group: "staff", mode: 0o664 },
          "/home/alice/modes/none": { mode: 0o000 },
          "/home/alice/modes/setgid/": { mode: 0o2775 },
          "/home/alice/modes/setuid": { mode: 0o4755 },
          "/home/alice/modes/sticky/": { mode: 0o1777 },
          "/home/alice/sizes/big": "x".repeat(5000),
          "/home/alice/sizes/empty": "",
          "/home/alice/sizes/one": "x",
          "/home/alice/sizes/umlaut": "äöü\n",
          "/home/alice/times/edge-old": { mtime: NOW - SIX_MONTHS },
          "/home/alice/times/edge-recent": { mtime: NOW - SIX_MONTHS + 1 },
          "/home/alice/times/future": { mtime: Date.UTC(2026, 11, 24, 18, 0) },
          "/home/alice/times/now": { mtime: NOW },
          "/home/alice/times/old": { mtime: OLD },
          "/home/alice/times/recent": { mtime: RECENT },
          "/home/alice/times/soon": { mtime: NOW + 1 },
          "/home/alice/links/big/": {},
          ...subdirectories,
          "/home/alice/links/x": "",
          "/home/alice/quoting/my file": "",
          "/home/alice/quoting/plain": "",
          "/home/alice/perm/readonly/": { mode: 0o600 },
          "/home/alice/perm/readonly/a.txt": "",
          "/home/alice/perm/readonly/sub/": {},
          "/home/alice/perm/secret/": { mode: 0o300 },
        },
      },
    ],
  },
  createGameClock(START),
);

/** The world without the user and the group `ghost`, which still own `owners/orphan.txt`. */
const world = withoutGhost(built);

function withoutGhost(original: World): World {
  const host = findHost(original, "ws01");
  if (host === undefined) {
    throw new Error("no host ws01");
  }
  return createWorld({
    hosts: [
      {
        ...host,
        users: host.users.filter((user) => user.name !== "ghost"),
        groups: host.groups.filter((group) => group.name !== "ghost"),
      },
    ],
  });
}

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

function lines(...text: string[]): string {
  return text.map((line) => `${line}\n`).join("");
}

/** Runs `input` with its standard output redirected to a file and returns what the file got. */
function runIntoFile(input: string): string {
  const result = run(`${input} > /home/alice/out.txt`);
  const host = findHost(result.world, "ws01");
  if (host === undefined) {
    throw new Error("no host ws01");
  }
  const found = lookup(host.root, root.credentials, "/", "/home/alice/out.txt");
  if (!found.ok || found.node.kind !== "file") {
    throw new Error("no file out.txt");
  }
  return found.node.content;
}

describe("ls -l", () => {
  test("writes a line per file after the total, sorted by name", () => {
    const result = run("ls -l basic");
    expect(result.events).toEqual([
      stdout(
        lines(
          "total 8",
          "drwxr-xr-x 3 alice alice 4096 Nov 16 10:00 docs",
          "-rw-r--r-- 1 alice alice    6 Nov 17 09:30 notes.txt",
        ),
      ),
    ]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("lists the working directory without operands", () => {
    const inside: Session = { ...alice, cwd: "/home/alice/basic" };
    expect(run("ls -l", inside).events).toEqual(run("ls -l basic").events);
  });

  test("writes only the total for an empty directory", () => {
    expect(run("ls -l empty").events).toEqual([stdout("total 0\n")]);
  });

  test("shows the owner and the group by name, or by ID if they have none", () => {
    expect(run("ls -l owners").events).toEqual([
      stdout(
        lines(
          "total 0",
          "-rw-r--r-- 1 alice alice 0 Nov 17 22:46 alice.txt",
          "-rw-r--r-- 1  2001  2001 0 Nov 17 22:46 orphan.txt",
          "-rw-r--r-- 1 root  root  0 Nov 17 22:46 rootfile",
          "-rw-rw-r-- 1 bob   staff 0 Nov 17 22:46 shared.txt",
        ),
      ),
    ]);
  });

  test("shows the special mode bits", () => {
    expect(run("ls -l modes").events).toEqual([
      stdout(
        lines(
          "total 8",
          "---------- 1 alice alice    0 Nov 17 22:46 none",
          "drwxrwsr-x 2 alice alice 4096 Nov 17 22:46 setgid",
          "-rwsr-xr-x 1 alice alice    0 Nov 17 22:46 setuid",
          "drwxrwxrwt 2 alice alice 4096 Nov 17 22:46 sticky",
        ),
      ),
    ]);
  });

  test("shows sizes in bytes and the total in KiB of 4 KiB blocks", () => {
    expect(run("ls -l sizes").events).toEqual([
      stdout(
        lines(
          "total 16",
          "-rw-r--r-- 1 alice alice 5000 Nov 17 22:46 big",
          "-rw-r--r-- 1 alice alice    0 Nov 17 22:46 empty",
          "-rw-r--r-- 1 alice alice    1 Nov 17 22:46 one",
          "-rw-r--r-- 1 alice alice    7 Nov 17 22:46 umlaut",
        ),
      ),
    ]);
  });

  test("shows the time for the last six months and the year for older or future times", () => {
    expect(run("ls -l times").events).toEqual([
      stdout(
        lines(
          "total 0",
          "-rw-r--r-- 1 alice alice 0 May 19  2026 edge-old",
          "-rw-r--r-- 1 alice alice 0 May 19 07:51 edge-recent",
          "-rw-r--r-- 1 alice alice 0 Dec 24  2026 future",
          "-rw-r--r-- 1 alice alice 0 Nov 17 22:46 now",
          "-rw-r--r-- 1 alice alice 0 Jan  5  2025 old",
          "-rw-r--r-- 1 alice alice 0 Nov 17 09:30 recent",
          "-rw-r--r-- 1 alice alice 0 Nov 17  2026 soon",
        ),
      ),
    ]);
  });

  test("aligns the link counts to the right", () => {
    expect(run("ls -l links").events).toEqual([
      stdout(
        lines(
          "total 4",
          "drwxr-xr-x 11 alice alice 4096 Nov 17 22:46 big",
          "-rw-r--r--  1 alice alice    0 Nov 17 22:46 x",
        ),
      ),
    ]);
  });

  test("lists . and .. with -a and counts them in the total", () => {
    expect(run("ls -la basic/docs").events).toEqual([
      stdout(
        lines(
          "total 12",
          "drwxr-xr-x 3 alice alice 4096 Nov 16 10:00 .",
          "drwxr-xr-x 3 alice alice 4096 Nov 16 10:00 ..",
          "drwxr-xr-x 2 alice alice 4096 Nov 17 22:46 sub",
        ),
      ),
    ]);
    expect(run("ls -al basic/docs").events).toEqual(run("ls -la basic/docs").events);
  });

  test("is not undone by -1 before or after it", () => {
    const expected = run("ls -l basic").events;
    expect(run("ls -1l basic").events).toEqual(expected);
    expect(run("ls -l1 basic").events).toEqual(expected);
    expect(run("ls -l -1 basic").events).toEqual(expected);
  });
});

describe("ls -l with operands", () => {
  test("lists a file operand by the name given, without a total", () => {
    expect(run("ls -l basic/notes.txt").events).toEqual([
      stdout("-rw-r--r-- 1 alice alice 6 Nov 17 09:30 basic/notes.txt\n"),
    ]);
  });

  test("@differential measures the columns of file operands also over the directory operands", () => {
    expect(run("ls -l basic/notes.txt basic/docs").events).toEqual([
      stdout(
        lines(
          "-rw-r--r-- 1 alice alice    6 Nov 17 09:30 basic/notes.txt",
          "",
          "basic/docs:",
          "total 4",
          "drwxr-xr-x 2 alice alice 4096 Nov 17 22:46 sub",
        ),
      ),
    ]);
  });

  test("writes the total of each directory after its name", () => {
    expect(run("ls -l empty sizes/big links").events).toEqual([
      stdout(
        lines(
          "-rw-r--r-- 1 alice alice 5000 Nov 17 22:46 sizes/big",
          "",
          "empty:",
          "total 0",
          "",
          "links:",
          "total 4",
          "drwxr-xr-x 11 alice alice 4096 Nov 17 22:46 big",
          "-rw-r--r--  1 alice alice    0 Nov 17 22:46 x",
        ),
      ),
    ]);
  });

  test("quotes names on a terminal and moves the others one space aside", () => {
    expect(run("ls -l quoting").events).toEqual([
      stdout(
        lines(
          "total 0",
          "-rw-r--r-- 1 alice alice 0 Nov 17 22:46 'my file'",
          "-rw-r--r-- 1 alice alice 0 Nov 17 22:46  plain",
        ),
      ),
    ]);
  });

  test("writes names as they are into a file", () => {
    expect(runIntoFile("ls -l quoting")).toBe(
      lines(
        "total 0",
        "-rw-r--r-- 1 alice alice 0 Nov 17 22:46 my file",
        "-rw-r--r-- 1 alice alice 0 Nov 17 22:46 plain",
      ),
    );
  });
});

describe("ls -l options for the owner and the group", () => {
  test("-n shows the IDs instead of the names and selects the long format", () => {
    const expected = [
      stdout(
        lines(
          "total 0",
          "-rw-r--r-- 1 1000 1000 0 Nov 17 22:46 alice.txt",
          "-rw-r--r-- 1 2001 2001 0 Nov 17 22:46 orphan.txt",
          "-rw-r--r-- 1    0    0 0 Nov 17 22:46 rootfile",
          "-rw-rw-r-- 1 1001   50 0 Nov 17 22:46 shared.txt",
        ),
      ),
    ];
    expect(run("ls -n owners").events).toEqual(expected);
    expect(run("ls -ln owners").events).toEqual(expected);
    expect(run("ls --numeric-uid-gid owners").events).toEqual(expected);
  });

  test("-g leaves out the owner and selects the long format", () => {
    expect(run("ls -g owners").events).toEqual([
      stdout(
        lines(
          "total 0",
          "-rw-r--r-- 1 alice 0 Nov 17 22:46 alice.txt",
          "-rw-r--r-- 1  2001 0 Nov 17 22:46 orphan.txt",
          "-rw-r--r-- 1 root  0 Nov 17 22:46 rootfile",
          "-rw-rw-r-- 1 staff 0 Nov 17 22:46 shared.txt",
        ),
      ),
    ]);
  });

  test("-o leaves out the group and selects the long format, like -lG", () => {
    const expected = [
      stdout(
        lines(
          "total 0",
          "-rw-r--r-- 1 alice 0 Nov 17 22:46 alice.txt",
          "-rw-r--r-- 1  2001 0 Nov 17 22:46 orphan.txt",
          "-rw-r--r-- 1 root  0 Nov 17 22:46 rootfile",
          "-rw-rw-r-- 1 bob   0 Nov 17 22:46 shared.txt",
        ),
      ),
    ];
    expect(run("ls -o owners").events).toEqual(expected);
    expect(run("ls -lG owners").events).toEqual(expected);
    expect(run("ls -l --no-group owners").events).toEqual(expected);
  });

  test("-g and -o together leave out both", () => {
    expect(run("ls -go owners/alice.txt").events).toEqual([
      stdout("-rw-r--r-- 1 0 Nov 17 22:46 owners/alice.txt\n"),
    ]);
  });

  test("-G alone does not select the long format", () => {
    expect(run("ls -G owners").events).toEqual(run("ls owners").events);
  });
});

describe("ls -l errors", () => {
  // The messages come in the order of readdir(3), which on ext4 depends on hashes of the names.
  test("@differential lists entries of a directory it may read but not search with ?", () => {
    const result = run("ls -l perm/readonly");
    expect(result.events).toEqual([
      stderr(
        "ls: cannot access 'perm/readonly/a.txt': Permission denied\n" +
          "ls: cannot access 'perm/readonly/sub': Permission denied\n",
      ),
      stdout(
        lines(
          "total 0",
          "-????????? ? ? ? ?            ? a.txt",
          "d????????? ? ? ? ?            ? sub",
        ),
      ),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("@differential reports the failed entries before the total, also . and .. with -a", () => {
    const result = run("ls -la perm/readonly/");
    expect(result.events).toEqual([
      stderr(
        "ls: cannot access 'perm/readonly/.': Permission denied\n" +
          "ls: cannot access 'perm/readonly/..': Permission denied\n" +
          "ls: cannot access 'perm/readonly/a.txt': Permission denied\n" +
          "ls: cannot access 'perm/readonly/sub': Permission denied\n",
      ),
      stdout(
        lines(
          "total 0",
          "d????????? ? ? ? ?            ? .",
          "d????????? ? ? ? ?            ? ..",
          "-????????? ? ? ? ?            ? a.txt",
          "d????????? ? ? ? ?            ? sub",
        ),
      ),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("names the entries of the working directory without a path", () => {
    const inside: Session = { ...alice, cwd: "/home/alice/perm/readonly" };
    const result = run("ls -l", inside);
    expect(result.events).toEqual([stderr("ls: cannot open directory '.': Permission denied\n")]);
    const searchable: Session = { ...alice, cwd: "/home/alice/basic" };
    expect(run("ls -l docs", searchable).events).toEqual([
      stdout("total 4\ndrwxr-xr-x 2 alice alice 4096 Nov 17 22:46 sub\n"),
    ]);
  });

  test("lets root list every entry", () => {
    expect(run("ls -l /home/alice/perm/readonly", root).events).toEqual([
      stdout(
        lines(
          "total 4",
          "-rw-r--r-- 1 alice alice    0 Nov 17 22:46 a.txt",
          "drwxr-xr-x 2 alice alice 4096 Nov 17 22:46 sub",
        ),
      ),
    ]);
  });

  test("keeps exit status 2 when an operand failed too", () => {
    const result = run("ls -l missing perm/readonly/sub perm/readonly");
    expect(result.events).toEqual([
      stderr(
        "ls: cannot access 'missing': No such file or directory\n" +
          "ls: cannot access 'perm/readonly/sub': Permission denied\n",
      ),
      stdout("perm/readonly:\n"),
      stderr(
        "ls: cannot access 'perm/readonly/a.txt': Permission denied\n" +
          "ls: cannot access 'perm/readonly/sub': Permission denied\n",
      ),
      stdout(
        lines(
          "total 0",
          "-????????? ? ? ? ?            ? a.txt",
          "d????????? ? ? ? ?            ? sub",
        ),
      ),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("reports operands it cannot access or directories it cannot read with exit status 2", () => {
    const missing = run("ls -l missing basic/notes.txt");
    expect(missing.events).toEqual([
      stderr("ls: cannot access 'missing': No such file or directory\n"),
      stdout("-rw-r--r-- 1 alice alice 6 Nov 17 09:30 basic/notes.txt\n"),
    ]);
    expect(missing.session.exitStatus).toBe(2);
    const notADirectory = run("ls -l basic/notes.txt/");
    expect(notADirectory.events).toEqual([
      stderr("ls: cannot access 'basic/notes.txt/': Not a directory\n"),
    ]);
    expect(notADirectory.session.exitStatus).toBe(2);
    const secret = run("ls -l perm/secret");
    expect(secret.events).toEqual([
      stderr("ls: cannot open directory 'perm/secret': Permission denied\n"),
    ]);
    expect(secret.session.exitStatus).toBe(2);
  });

  test("writes total 0 in a working directory that was removed", () => {
    const removed: Session = { ...alice, cwd: "/home/alice/gone" };
    const result = run("ls -la", removed);
    expect(result.events).toEqual([stdout("total 0\n")]);
    expect(result.session.exitStatus).toBe(0);
  });
});

describe("ls -l and environment variables", () => {
  test("stops with a notice for variables that change times or sizes", () => {
    for (const variable of ["TIME_STYLE", "TZ", "LS_BLOCK_SIZE", "BLOCK_SIZE", "BLOCKSIZE"]) {
      expect(run(`${variable}=x ls -l basic`).events).toEqual([
        { kind: "notice", command: "ls", notice: { key: "variable-not-simulated", variable } },
      ]);
    }
  });

  test("ignores them without the long format", () => {
    expect(run("TZ=Europe/Berlin TIME_STYLE=iso ls basic").events).toEqual([
      stdout("docs  notes.txt\n"),
    ]);
  });

  test("ignores TABSIZE, which only changes columns", () => {
    expect(run("TABSIZE=4 ls -l empty").events).toEqual([stdout("total 0\n")]);
  });
});
