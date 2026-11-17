import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { runScript, type ScriptResult, type ShellEvent } from "../interpreter";
import { parse } from "../parser";
import { createSession, type Session } from "../session";
import { buildWorld } from "../world-builder";
import { COMMANDS } from ".";

const START = 1_700_000_000_000;

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
          "/home/alice/docs/report.txt": "Q3\n",
          "/home/alice/notes.txt": "",
          "/home/alice/old files/": {},
          // Only root may enter or look into it.
          "/srv/locked/": { mode: 0o700 },
          "/srv/locked/inner/deep/": {},
          // Readable, but nobody except root may enter it.
          "/srv/closed/": { mode: 0o644 },
          // Others may pass through, but not list it.
          "/srv/passage/": { mode: 0o711 },
          "/srv/passage/room/": {},
          "/tmp/": { mode: 0o1777 },
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

/** `session` with the working directory `cwd`, as if the player had gone there before. */
function inDirectory(session: Session, cwd: string): Session {
  const variables = new Map(session.variables);
  variables.set("PWD", cwd);
  return { ...session, cwd, variables };
}

/** `session` without the shell variable `name`. */
function without(session: Session, name: string): Session {
  const variables = new Map(session.variables);
  variables.delete(name);
  return { ...session, variables };
}

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

/** The working directory, `PWD`, `OLDPWD` and exit status after `result`. */
function state(result: ScriptResult): {
  cwd: string;
  pwd: string | undefined;
  oldPwd: string | undefined;
  exitStatus: number;
} {
  const { session } = result;
  return {
    cwd: session.cwd,
    pwd: session.variables.get("PWD"),
    oldPwd: session.variables.get("OLDPWD"),
    exitStatus: session.exitStatus,
  };
}

describe("cd: changing the directory", () => {
  test("goes to a relative directory and sets PWD and OLDPWD, without output", () => {
    const result = run("cd docs");
    expect(result.events).toEqual([]);
    expect(state(result)).toEqual({
      cwd: "/home/alice/docs",
      pwd: "/home/alice/docs",
      oldPwd: "/home/alice",
      exitStatus: 0,
    });
  });

  test("goes to an absolute directory", () => {
    expect(state(run("cd /srv/passage/room")).cwd).toBe("/srv/passage/room");
  });

  test("goes to a name with a space", () => {
    expect(state(run("cd 'old files'")).cwd).toBe("/home/alice/old files");
  });

  test("goes to the home directory without an operand", () => {
    const result = run("cd", inDirectory(alice, "/tmp"));
    expect(state(result)).toEqual({
      cwd: "/home/alice",
      pwd: "/home/alice",
      oldPwd: "/tmp",
      exitStatus: 0,
    });
  });

  test("uses HOME as it is set for the command", () => {
    const result = run("HOME=/tmp cd");
    expect(state(result).cwd).toBe("/tmp");
    expect(result.session.variables.get("HOME")).toBe("/home/alice");
  });

  test("works out `.`, `..` and repeated slashes by text", () => {
    expect(state(run("cd docs/..")).cwd).toBe("/home/alice");
    expect(state(run("cd ./docs/./")).cwd).toBe("/home/alice/docs");
    expect(state(run("cd ../..")).cwd).toBe("/");
    expect(state(run("cd /home//alice///docs")).cwd).toBe("/home/alice/docs");
  });

  test("`..` in the root directory stays there", () => {
    expect(state(run("cd /..; cd ..")).cwd).toBe("/");
  });

  test("passes through a directory it may only search", () => {
    expect(state(run("cd /srv/passage; cd room")).cwd).toBe("/srv/passage/room");
  });

  test("the empty operand stays in the directory and still sets OLDPWD", () => {
    expect(state(run("cd ''", inDirectory(alice, "/tmp")))).toEqual({
      cwd: "/tmp",
      pwd: "/tmp",
      oldPwd: "/tmp",
      exitStatus: 0,
    });
  });

  test("keeps exactly two leading slashes, like bash", () => {
    expect(state(run("cd //tmp")).cwd).toBe("//tmp");
    expect(state(run("cd //")).cwd).toBe("//");
    expect(state(run("cd //tmp/..")).cwd).toBe("//");
    expect(state(run("cd ///tmp")).cwd).toBe("/tmp");
  });

  test("relative names after `//` keep it", () => {
    expect(state(run("cd srv", inDirectory(alice, "//"))).cwd).toBe("//srv");
  });

  test("OLDPWD gets the value of the PWD variable, not the real directory", () => {
    const result = run("PWD=/elsewhere; cd /tmp");
    expect(state(result)).toMatchObject({ cwd: "/tmp", pwd: "/tmp", oldPwd: "/elsewhere" });
  });

  test("OLDPWD is empty when PWD is unset", () => {
    const result = run("cd /tmp", without(alice, "PWD"));
    expect(state(result)).toMatchObject({ pwd: "/tmp", oldPwd: "" });
  });

  test("an assignment to PWD before cd only lasts for the command, like bash", () => {
    const result = run("PWD=/elsewhere cd /tmp");
    expect(state(result)).toMatchObject({ cwd: "/tmp", pwd: "/home/alice", oldPwd: "/elsewhere" });
  });

  test("root may enter every directory", () => {
    expect(state(run("cd /srv/locked/inner", root)).cwd).toBe("/srv/locked/inner");
    expect(state(run("cd /srv/closed", root)).cwd).toBe("/srv/closed");
  });

  test("the next command runs in the new directory", () => {
    expect(run("cd /srv && pwd").events).toEqual([stdout("/srv\n")]);
  });

  test("in a pipeline the change is lost, like in a subshell", () => {
    const result = run("cd /tmp | pwd");
    expect(result.events).toEqual([stdout("/home/alice\n")]);
    expect(state(result).cwd).toBe("/home/alice");
  });
});

describe("cd -", () => {
  test("goes to OLDPWD and writes its name", () => {
    const result = run("cd /tmp; cd -");
    expect(result.events).toEqual([stdout("/home/alice\n")]);
    expect(state(result)).toEqual({
      cwd: "/home/alice",
      pwd: "/home/alice",
      oldPwd: "/tmp",
      exitStatus: 0,
    });
  });

  test("twice goes back and forth", () => {
    expect(state(run("cd /tmp; cd -; cd -")).cwd).toBe("/tmp");
  });

  test("after `--` is still `cd -`", () => {
    expect(run("cd /tmp; cd -- -").events).toEqual([stdout("/home/alice\n")]);
  });

  test("without OLDPWD is an error", () => {
    const result = run("cd -");
    expect(result.events).toEqual([stderr("bash: cd: OLDPWD not set\n")]);
    expect(state(result)).toMatchObject({ cwd: "/home/alice", exitStatus: 1 });
  });

  test("writes nothing when OLDPWD no longer exists", () => {
    const result = run("OLDPWD=/gone; cd -");
    expect(result.events).toEqual([stderr("bash: cd: /gone: No such file or directory\n")]);
    expect(state(result).exitStatus).toBe(1);
  });
});

describe("cd: errors", () => {
  test.each([
    ["cd nothing", "bash: cd: nothing: No such file or directory\n"],
    ["cd notes.txt", "bash: cd: notes.txt: Not a directory\n"],
    ["cd notes.txt/", "bash: cd: notes.txt/: Not a directory\n"],
    ["cd notes.txt/..", "bash: cd: notes.txt/..: Not a directory\n"],
    ["cd nothing/..", "bash: cd: nothing/..: No such file or directory\n"],
    ["cd /srv/locked", "bash: cd: /srv/locked: Permission denied\n"],
    ["cd /srv/locked/inner", "bash: cd: /srv/locked/inner: Permission denied\n"],
    ["cd /srv/closed", "bash: cd: /srv/closed: Permission denied\n"],
    ["cd -P /srv/closed", "bash: cd: /srv/closed: Permission denied\n"],
    ["cd -P nothing", "bash: cd: nothing: No such file or directory\n"],
    ["cd docs tmp", "bash: cd: too many arguments\n"],
  ])("%s", (input, message) => {
    const result = run(input);
    expect(result.events).toEqual([stderr(message)]);
    expect(state(result)).toEqual({
      cwd: "/home/alice",
      pwd: "/home/alice",
      oldPwd: undefined,
      exitStatus: 1,
    });
  });

  test("without HOME is an error", () => {
    const result = run("cd", without(alice, "HOME"));
    expect(result.events).toEqual([stderr("bash: cd: HOME not set\n")]);
    expect(state(result).exitStatus).toBe(1);
  });

  test("the message names HOME's value when it fails", () => {
    expect(run("HOME=/nowhere cd").events).toEqual([
      stderr("bash: cd: /nowhere: No such file or directory\n"),
    ]);
  });

  test("an invalid option gives the usage line and exit status 2", () => {
    const result = run("cd -x /tmp");
    expect(result.events).toEqual([
      stderr("bash: cd: -x: invalid option\ncd: usage: cd [-L|[-P [-e]] [-@]] [dir]\n"),
    ]);
    expect(state(result)).toMatchObject({ cwd: "/home/alice", exitStatus: 2 });
  });

  test("`-@` is invalid on Linux", () => {
    expect(run("cd -@ /tmp").events).toEqual([
      stderr("bash: cd: -@: invalid option\ncd: usage: cd [-L|[-P [-e]] [-@]] [dir]\n"),
    ]);
  });

  test("`--help` stops the input with a game notice", () => {
    const result = run("cd --help; cd /tmp");
    expect(result.events).toEqual([
      { kind: "notice", command: "cd", notice: { key: "option-not-simulated", option: "--help" } },
    ]);
    expect(state(result)).toMatchObject({ cwd: "/home/alice", exitStatus: 1 });
  });
});

describe("cd -L and -P", () => {
  test("-P goes to the directory like -L where nothing differs", () => {
    expect(state(run("cd -P docs")).cwd).toBe("/home/alice/docs");
    expect(state(run("cd -P docs/..")).cwd).toBe("/home/alice");
    expect(state(run("cd -P //tmp")).cwd).toBe("//tmp");
  });

  test("-e without -P has no effect", () => {
    expect(state(run("cd -e docs")).exitStatus).toBe(0);
  });

  describe("@differential in a directory whose parent the user may no longer search", () => {
    // As if root had locked /srv/locked after alice entered /srv/locked/inner/deep.
    const deep = inDirectory(alice, "/srv/locked/inner/deep");

    test("the last of -L and -P wins", () => {
      expect(state(run("cd -PLe ..", deep)).exitStatus).toBe(0);
      expect(state(run("cd -LPe ..", deep)).exitStatus).toBe(1);
      expect(state(run("cd -P -L -e ..", deep)).exitStatus).toBe(0);
    });

    test("-L falls back to the operand as written and asks the kernel for the name", () => {
      expect(state(run("cd ..", deep))).toEqual({
        cwd: "/srv/locked/inner",
        pwd: "/srv/locked/inner",
        oldPwd: "/srv/locked/inner/deep",
        exitStatus: 0,
      });
    });

    test("-P goes there and asks the kernel for the name", () => {
      expect(state(run("cd -P ..", deep))).toMatchObject({
        cwd: "/srv/locked/inner",
        pwd: "/srv/locked/inner",
        exitStatus: 0,
      });
    });

    test("-Pe goes there, but fails because it cannot name the directory", () => {
      const result = run("cd -Pe ..", deep);
      expect(result.events).toEqual([]);
      expect(state(result)).toMatchObject({ cwd: "/srv/locked/inner", exitStatus: 1 });
    });

    test("an absolute name through the locked directory fails", () => {
      expect(run("cd /srv/locked/inner", deep).events).toEqual([
        stderr("bash: cd: /srv/locked/inner: Permission denied\n"),
      ]);
    });
  });
});

describe("cd with CDPATH", () => {
  test("a non-empty CDPATH stops a relative name with a game notice", () => {
    const result = run("CDPATH=/srv cd passage; cd /tmp");
    expect(result.events).toEqual([
      {
        kind: "notice",
        command: "cd",
        notice: { key: "variable-not-simulated", variable: "CDPATH" },
      },
    ]);
    expect(state(result)).toMatchObject({ cwd: "/home/alice", exitStatus: 1 });
  });

  test.each(["/srv", ".", "..", "./docs", "../alice"])(
    "is not used for %s, which starts like a path",
    (operand) => {
      expect(run(`CDPATH=/srv cd ${operand}`).session.exitStatus).toBe(0);
    },
  );

  test("is not used for `cd` and `cd -`", () => {
    expect(run("CDPATH=/srv cd").session.exitStatus).toBe(0);
    expect(run("cd /tmp; CDPATH=/srv cd -").session.exitStatus).toBe(0);
  });

  test("an empty CDPATH is like an unset one", () => {
    expect(state(run("CDPATH= cd docs")).cwd).toBe("/home/alice/docs");
  });
});
