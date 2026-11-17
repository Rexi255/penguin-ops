import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import { type ExpansionError, expandAssignment, expandWords } from "./expand";
import { toUid } from "./ids";
import { parse, type SimpleCommand } from "./parser";
import { createSession, type Session } from "./session";
import { buildWorld } from "./world-builder";

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [
          { name: "root", gid: 0 },
          { name: "alice", gid: 1000 },
          { name: "bob", gid: 1001 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "alice", uid: 1000 },
          { name: "bob", uid: 1001 },
          { name: "backup", uid: 34, group: "root", home: "/var/backups" },
        ],
        files: {
          "/home/alice/.bashrc": "",
          "/home/alice/notes.txt": "",
          "/home/alice/report.log": "",
          "/home/alice/archive.tar": "",
          "/home/alice/Archive/": {},
          "/home/alice/docs/b.md": "",
          "/home/alice/docs/a.md": "",
          "/home/alice/docs/README": "",
          "/home/alice/logs/README": "",
          "/home/alice/data1": "",
          "/home/alice/data2": "",
          "/home/alice/data10": "",
          "/home/alice/[x]": "",
          "/home/alice/locked/": { owner: "root", mode: 0o711 },
          "/home/alice/locked/inside.txt": { owner: "root" },
          "/home/bob/": { owner: "bob", mode: 0o700 },
          "/home/bob/todo.txt": { owner: "bob" },
          "/etc/hostname": "ws01\n",
          "/etc/hosts": "",
          "/etc/ssh/": {},
        },
      },
    ],
  },
  createGameClock(0),
);

const alice = createSession(world, "ws01", "alice");

function withVariables(session: Session, variables: Record<string, string>): Session {
  return { ...session, variables: new Map([...session.variables, ...Object.entries(variables)]) };
}

function withoutVariables(session: Session, ...names: string[]): Session {
  return {
    ...session,
    variables: new Map([...session.variables].filter(([name]) => !names.includes(name))),
  };
}

function command(input: string): SimpleCommand {
  const parsed = parse(input);
  if (!parsed.ok) {
    throw new Error(`cannot parse ${input}`);
  }
  const first = parsed.script.lists[0]?.first.commands[0];
  if (first === undefined) {
    throw new Error(`no command in ${input}`);
  }
  return first;
}

/** Expands all words of `input`, including the command name. */
function expand(input: string, session: Session = alice): readonly string[] {
  const result = expandWords(world, session, command(input).words);
  if (!result.ok) {
    throw new Error(`cannot expand ${input}: ${result.error.feature}`);
  }
  return result.fields;
}

function expansionError(input: string): ExpansionError | undefined {
  const result = expandWords(world, alice, command(input).words);
  return result.ok ? undefined : result.error;
}

describe("expandWords: quote removal", () => {
  test("removes quotes and backslashes", () => {
    expect(expand(`echo 'a b' "c d" e\\ f`)).toEqual(["echo", "a b", "c d", "e f"]);
  });

  test("keeps an empty quoted word as an empty field", () => {
    expect(expand(`echo "" ''`)).toEqual(["echo", "", ""]);
  });

  test("keeps braces as ordinary characters", () => {
    expect(expand("echo {a,b} file{1..3}")).toEqual(["echo", "{a,b}", "file{1..3}"]);
  });
});

describe("expandWords: parameters", () => {
  test("expands a set variable", () => {
    expect(expand("echo $USER ${HOME}/x", alice)).toEqual(["echo", "alice", "/home/alice/x"]);
  });

  test("expands an unset variable to nothing", () => {
    expect(expand("echo $nothing end")).toEqual(["echo", "end"]);
    expect(expand('echo "[$nothing]"')).toEqual(["echo", "[]"]);
  });

  test("removes a word whose unquoted expansion is empty", () => {
    const session = withVariables(alice, { empty: "" });
    expect(expand("echo $empty $empty$nothing", session)).toEqual(["echo"]);
  });

  test("keeps a quoted empty expansion as an empty field", () => {
    const session = withVariables(alice, { empty: "" });
    expect(expand('echo "$empty" $empty""', session)).toEqual(["echo", "", ""]);
  });

  test("expands $? to the last exit status", () => {
    expect(expand("echo $?")).toEqual(["echo", "0"]);
    expect(expand('echo "${?}"', { ...alice, exitStatus: 127 })).toEqual(["echo", "127"]);
  });

  test("has no positional parameters in an interactive shell", () => {
    expect(expand("echo $1 ${10} $@ $* $# x")).toEqual(["echo", "0", "x"]);
    expect(expand('echo "$*" "$@" "a$@b"')).toEqual(["echo", "", "ab"]);
  });

  test("@differential expands $0 to the login shell name and $! to nothing", () => {
    expect(expand("echo $0 $! x")).toEqual(["echo", "-bash", "x"]);
  });

  test("reports $$ and $- as unsupported with the offset of the word", () => {
    expect(expansionError("echo ok $$")).toEqual({
      kind: "unsupported",
      feature: "process-id",
      start: 8,
    });
    expect(expansionError('echo "flags: $-"')).toEqual({
      kind: "unsupported",
      feature: "shell-options",
      start: 5,
    });
  });
});

describe("expandWords: field splitting", () => {
  test("splits an unquoted expansion at blanks and line breaks", () => {
    const session = withVariables(alice, { x: "  a  b\tc\nd  " });
    expect(expand("echo $x", session)).toEqual(["echo", "a", "b", "c", "d"]);
  });

  test("does not split quoted expansions or literal text", () => {
    const session = withVariables(alice, { x: "a  b" });
    expect(expand("echo \"$x\" '$x'", session)).toEqual(["echo", "a  b", "$x"]);
  });

  test("joins split parts with the text around them", () => {
    const session = withVariables(alice, { x: "a b" });
    expect(expand('echo pre$x"post"', session)).toEqual(["echo", "prea", "bpost"]);
  });

  test("ends a field at blanks at the edge of an expansion", () => {
    const session = withVariables(alice, { x: " a ", y: "b" });
    expect(expand("echo pre${x}post $y$x$y", session)).toEqual([
      "echo",
      "pre",
      "a",
      "post",
      "b",
      "a",
      "b",
    ]);
  });

  test("splits at other IFS characters and keeps empty fields between them", () => {
    const session = withVariables(alice, { IFS: ":", path: "/bin::/usr/bin:" });
    expect(expand("echo $path", session)).toEqual(["echo", "/bin", "", "/usr/bin"]);
  });

  test("@differential treats IFS whitespace around another IFS character as one separator", () => {
    const session = withVariables(alice, { IFS: ": ", x: "a : b", y: " :c", z: "a: :b" });
    expect(expand("echo $x", session)).toEqual(["echo", "a", "b"]);
    expect(expand("echo $y", session)).toEqual(["echo", "", "c"]);
    expect(expand("echo $z", session)).toEqual(["echo", "a", "", "b"]);
  });

  test("does not split when IFS is empty", () => {
    const session = withVariables(alice, { IFS: "", x: "a b" });
    expect(expand("echo $x", session)).toEqual(["echo", "a b"]);
  });

  test("uses bash's default IFS when IFS is unset", () => {
    const session = withVariables(withoutVariables(alice, "IFS"), { x: "a\tb" });
    expect(expand("echo $x", session)).toEqual(["echo", "a", "b"]);
  });
});

describe("expandWords: tilde", () => {
  test("expands ~ and ~/ to HOME", () => {
    expect(expand("echo ~ ~/docs")).toEqual(["echo", "/home/alice", "/home/alice/docs"]);
    const session = withVariables(alice, { HOME: "/tmp/elsewhere" });
    expect(expand("echo ~/x", session)).toEqual(["echo", "/tmp/elsewhere/x"]);
  });

  test("uses the home of the user list when HOME is unset", () => {
    expect(expand("echo ~", withoutVariables(alice, "HOME"))).toEqual(["echo", "/home/alice"]);
  });

  test("keeps ~ when HOME is unset and the session's UID has no user", () => {
    const nobody: Session = {
      ...withoutVariables(alice, "HOME"),
      credentials: { ...alice.credentials, uid: toUid(5000) },
    };
    expect(expand("echo ~", nobody)).toEqual(["echo", "~"]);
  });

  test("expands ~name to the home of that user and keeps an unknown name", () => {
    expect(expand("echo ~backup ~root/.bashrc ~carol ~carol/x")).toEqual([
      "echo",
      "/var/backups",
      "/root/.bashrc",
      "~carol",
      "~carol/x",
    ]);
  });

  test("expands ~+ to PWD and ~- to OLDPWD, and keeps them when unset", () => {
    expect(expand("echo ~+ ~-")).toEqual(["echo", "/home/alice", "~-"]);
    const session = withVariables(alice, { OLDPWD: "/etc" });
    expect(expand("echo ~-/hosts", session)).toEqual(["echo", "/etc/hosts"]);
  });

  test("does not split or glob the home directory", () => {
    const session = withVariables(alice, { HOME: "/srv/my files/*" });
    expect(expand("echo ~", session)).toEqual(["echo", "/srv/my files/*"]);
  });

  test("expands only an unquoted tilde at the start of a word", () => {
    expect(expand(`echo "~" \\~ a~ ~"/x"`)).toEqual(["echo", "~", "~", "a~", "~/x"]);
  });

  test("@differential joins the home / and the rest without removing the double slash", () => {
    const session = withVariables(alice, { HOME: "/" });
    expect(expand("echo ~/x", session)).toEqual(["echo", "//x"]);
  });
});

describe("expandWords: pathname expansion", () => {
  test("expands * to the sorted names in the working directory without hidden ones", () => {
    expect(expand("echo *")).toEqual([
      "echo",
      "Archive",
      "archive.tar",
      "data1",
      "data10",
      "data2",
      "docs",
      "locked",
      "logs",
      "notes.txt",
      "report.log",
      "[x]",
    ]);
  });

  test("matches hidden names only with a literal dot at the start", () => {
    expect(expand("echo .* ?bashrc [.]bashrc")).toEqual([
      "echo",
      ".bashrc",
      "?bashrc",
      "[.]bashrc",
    ]);
  });

  test("matches ? and bracket expressions", () => {
    expect(expand("echo data? data[0-9][0-9] [ab]*.tar [^a-z]rchive")).toEqual([
      "echo",
      "data1",
      "data2",
      "data10",
      "archive.tar",
      "Archive",
    ]);
  });

  test("supports character classes and ^ for negation", () => {
    expect(expand("echo data[[:digit:]] [[:upper:]]* [^[:lower:][]*")).toEqual([
      "echo",
      "data1",
      "data2",
      "Archive",
      "Archive",
    ]);
  });

  test("keeps a pattern without matches as it is", () => {
    expect(expand("echo *.pdf missing/*")).toEqual(["echo", "*.pdf", "missing/*"]);
  });

  test("does not use quoted pattern characters as patterns", () => {
    expect(expand(`echo "*" '*.txt' \\*.log "data"?`)).toEqual([
      "echo",
      "*",
      "*.txt",
      "*.log",
      "data1",
      "data2",
    ]);
  });

  test("globs unquoted expansion results but not quoted ones", () => {
    const session = withVariables(alice, { pattern: "*.log" });
    expect(expand('echo $pattern "$pattern"', session)).toEqual(["echo", "report.log", "*.log"]);
  });

  test("treats [ without a closing ] as an ordinary character", () => {
    expect(expand("echo [x] [x [")).toEqual(["echo", "[x]", "[x", "["]);
  });

  test("expands patterns in several components and keeps the path as written", () => {
    expect(expand("echo docs/*.md */README ./d*s /etc/host*")).toEqual([
      "echo",
      "docs/a.md",
      "docs/b.md",
      "docs/README",
      "logs/README",
      "./docs",
      "/etc/hostname",
      "/etc/hosts",
    ]);
  });

  test("lets only directories match a pattern with a trailing slash", () => {
    expect(expand("echo *s/ /etc/*/")).toEqual(["echo", "docs/", "logs/", "/etc/ssh/"]);
  });

  test("finds nothing in a directory without read permission", () => {
    expect(expand("echo locked/* /home/bob/*")).toEqual(["echo", "locked/*", "/home/bob/*"]);
  });

  test("finds a literal name below a pattern only where the user may search", () => {
    expect(expand("echo /home/*/todo.txt /home/*/docs")).toEqual([
      "echo",
      "/home/*/todo.txt",
      "/home/alice/docs",
    ]);
  });

  test("lets root read every directory", () => {
    const root = createSession(world, "ws01", "root");
    expect(expand("echo /home/bob/* /home/alice/locked/*", root)).toEqual([
      "echo",
      "/home/bob/todo.txt",
      "/home/alice/locked/inside.txt",
    ]);
  });

  test("never matches . and ..", () => {
    expect(expand("echo /etc/.*")).toEqual(["echo", "/etc/.*"]);
  });
});

describe("expandWords: errors", () => {
  test("throws when the session's host is not part of the world", () => {
    const lost: Session = { ...alice, host: "gone" };
    expect(() => expandWords(world, lost, command("echo").words)).toThrow(
      `the session's host "gone" is not part of the world`,
    );
  });
});

describe("expandAssignment", () => {
  function assign(input: string, session: Session = alice): string {
    const assignment = command(input).assignments[0];
    if (assignment === undefined) {
      throw new Error(`no assignment in ${input}`);
    }
    const result = expandAssignment(world, session, assignment);
    if (!result.ok) {
      throw new Error(`cannot expand ${input}`);
    }
    return result.value;
  }

  test("expands tildes after = and :, and parameters", () => {
    expect(assign("PATH=~/bin:~backup:$PATH")).toBe(
      "/home/alice/bin:/var/backups:/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games",
    );
  });

  test("neither splits nor globs the value", () => {
    const session = withVariables(alice, { x: "a  b" });
    expect(assign("v=$x", session)).toBe("a  b");
    expect(assign("v=*")).toBe("*");
  });

  test("gives the empty string for an empty value", () => {
    expect(assign("v=")).toBe("");
  });

  test("reports $$ as unsupported with the offset of the assignment", () => {
    const assignment = command("x=1 pid=$$ cmd").assignments[1];
    if (assignment === undefined) {
      throw new Error("no second assignment");
    }
    expect(expandAssignment(world, alice, assignment)).toEqual({
      ok: false,
      error: { kind: "unsupported", feature: "process-id", start: 4 },
    });
  });
});
