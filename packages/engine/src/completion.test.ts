import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import { COMMANDS } from "./commands";
import {
  complete,
  type Completion,
  COMPLETION_QUERY_ITEMS,
  completionQuestion,
  formatCompletionList,
} from "./completion";
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
        ],
        files: {
          "/root/": { mode: 0o700 },
          "/home/alice/.bashrc": "",
          "/home/alice/.hidden/": {},
          "/home/alice/Desktop/": {},
          "/home/alice/Documents/": {},
          "/home/alice/Downloads/": {},
          "/home/alice/notes.md": "",
          "/home/alice/notes.txt": "",
          "/home/alice/report.txt": "",
          "/home/alice/my dir/f1": "",
          "/home/alice/my dir/f2": "",
          "/home/alice/scripts/run": { mode: 0o755 },
          "/home/alice/scripts/data": "",
          "/home/alice/scripts/inner/": {},
          "/home/alice/secret/x": "",
          "/home/alice/secret/": { mode: 0o300 },
          "/home/alice/odd/it's": "",
          "/home/alice/odd/a b.txt": "",
          "/home/alice/odd/x$y": "",
          "/home/alice/odd/g!h": "",
          "/home/alice/odd/#x": "",
          "/home/alice/odd/h#x": "",
          "/home/alice/odd/~t": "",
          "/home/alice/odd/k[1]": "",
          "/home/alice/odd/q]": "",
          "/home/alice/odd/t b,c^d%e}f]g+h-i.j_k~l#m": "",
          "/home/alice/odd/u{b}": "",
          "/home/alice/odd/n\nl": "",
          "/home/alice/odd/c:d": "",
          "/home/alice/odd/e@f": "",
          "/home/alice/pair/ab c1": "",
          "/home/alice/pair/ab c2": "",
          "/home/alice/glob/a*b": "",
          "/home/alice/glob/a b.txt": "",
        },
      },
    ],
  },
  createGameClock(1_700_000_000_000),
);

const alice = createSession(world, "ws01", "alice");
const commandNames = COMMANDS.map((command) => command.name);

/** The cursor in test lines. */
const CURSOR = "▮";

interface Pressed {
  /** The line after the Tab press, with the cursor marked. */
  readonly line: string;
  readonly bell: boolean;
  /** The matches as readline lists them, with `/` for directories. */
  readonly matches: readonly string[];
}

/** Presses Tab in `marked`, a line with the cursor marked by `CURSOR` (at the end if missing). */
function press(marked: string, cwd = "/home/alice", session: Session = alice): Pressed {
  const at = marked.indexOf(CURSOR);
  const cursor = at === -1 ? marked.length : at;
  const line = marked.replace(CURSOR, "");
  const result: Completion = complete({
    world,
    session: { ...session, cwd },
    commandNames,
    line,
    cursor,
  });
  return {
    line: result.line.slice(0, result.cursor) + CURSOR + result.line.slice(result.cursor),
    bell: result.bell,
    matches: result.matches.map((match) => match.name + (match.directory ? "/" : "")),
  };
}

/** The line after pressing Tab in `marked`. */
function tab(marked: string, cwd?: string): string {
  return press(marked, cwd).line;
}

describe("complete: file names", () => {
  test("a unique file name is completed and followed by a space", () => {
    expect(press("cat rep")).toEqual({
      line: `cat report.txt ${CURSOR}`,
      bell: false,
      matches: ["report.txt"],
    });
  });

  test("several file names insert their common prefix and ring the bell", () => {
    expect(press("cat no")).toEqual({
      line: `cat notes.${CURSOR}`,
      bell: true,
      matches: ["notes.md", "notes.txt"],
    });
    expect(press("cat notes.")).toEqual({
      line: `cat notes.${CURSOR}`,
      bell: true,
      matches: ["notes.md", "notes.txt"],
    });
  });

  test("a unique directory gets a slash instead of a space", () => {
    expect(tab("cat Docu")).toBe(`cat Documents/${CURSOR}`);
    expect(tab("cd Desktop")).toBe(`cd Desktop/${CURSOR}`);
  });

  test("an empty directory has no matches", () => {
    expect(press("cat Desktop/")).toEqual({
      line: `cat Desktop/${CURSOR}`,
      bell: true,
      matches: [],
    });
  });

  test("the list marks directories and keeps the common prefix", () => {
    expect(press("ls D")).toEqual({
      line: `ls D${CURSOR}`,
      bell: true,
      matches: ["Desktop/", "Documents/", "Downloads/"],
    });
  });

  test("an empty word lists all entries but . and .., also hidden ones, in locale order", () => {
    expect(press("cat ").matches).toEqual([
      ".bashrc",
      "Desktop/",
      "Documents/",
      "Downloads/",
      "glob/",
      ".hidden/",
      "my dir/",
      "notes.md",
      "notes.txt",
      "odd/",
      "pair/",
      "report.txt",
      "scripts/",
      "secret/",
    ]);
  });

  test("a word starting with . also matches . and ..", () => {
    expect(press("cat .").matches).toEqual(["./", "../", ".bashrc", ".hidden/"]);
    expect(tab("cd ..")).toBe(`cd ../${CURSOR}`);
  });

  test("paths complete in their directory and keep the typed directory part", () => {
    expect(tab("cat ~/Doc", "/")).toBe(`cat ~/Documents/${CURSOR}`);
    expect(tab("cat ~/no", "/")).toBe(`cat ~/notes.${CURSOR}`);
    expect(tab("cat ~alice/rep", "/")).toBe(`cat ~alice/report.txt ${CURSOR}`);
    expect(tab("cat /ho")).toBe(`cat /home/${CURSOR}`);
    expect(tab("cat ../alice/rep")).toBe(`cat ../alice/report.txt ${CURSOR}`);
    expect(press("cat ./scripts/").matches).toEqual(["data", "inner/", "run"]);
  });

  test("a missing or unreadable directory has no matches", () => {
    expect(press("cat nosuch/")).toEqual({ line: `cat nosuch/${CURSOR}`, bell: true, matches: [] });
    expect(press("cat secret/")).toEqual({ line: `cat secret/${CURSOR}`, bell: true, matches: [] });
    expect(press("cat ~nosuch/x")).toEqual({
      line: `cat ~nosuch/x${CURSOR}`,
      bell: true,
      matches: [],
    });
  });

  test("a directory part with a variable is not expanded", () => {
    expect(press("cat $HOME/rep")).toEqual({
      line: `cat $HOME/rep${CURSOR}`,
      bell: true,
      matches: [],
    });
  });

  test("the word starts after the word breaks of COMP_WORDBREAKS", () => {
    expect(tab("cat a:rep")).toBe(`cat a:report.txt ${CURSOR}`);
    expect(tab("cat foo=rep")).toBe(`cat foo=report.txt ${CURSOR}`);
    expect(tab("echo hi >rep")).toBe(`echo hi >report.txt ${CURSOR}`);
    expect(tab("echo hi>>rep")).toBe(`echo hi>>report.txt ${CURSOR}`);
    expect(tab("ls;cat rep")).toBe(`ls;cat report.txt ${CURSOR}`);
  });
});

describe("complete: the cursor inside the line", () => {
  test("only the text before the cursor is completed, and nothing is appended", () => {
    expect(press(`cat rep${CURSOR}Z`)).toEqual({
      line: `cat report.txt${CURSOR}Z`,
      bell: false,
      matches: ["report.txt"],
    });
    expect(tab(`cat rep${CURSOR} b`)).toBe(`cat report.txt${CURSOR} b`);
  });

  test("a directory still gets its slash, unless a slash follows", () => {
    expect(tab(`cat Docu${CURSOR}x`)).toBe(`cat Documents/${CURSOR}x`);
    expect(tab(`cat Docu${CURSOR}/x`)).toBe(`cat Documents${CURSOR}/x`);
  });

  test("an opened quote is not closed", () => {
    expect(tab(`cat "rep${CURSOR}Z`)).toBe(`cat "report.txt${CURSOR}Z`);
  });

  test("a cursor before the word completes the empty word", () => {
    expect(press(`cat ${CURSOR}rep`).line).toBe(`cat ${CURSOR}rep`);
    expect(press(`${CURSOR}cat`).matches).toEqual(commandNames);
  });
});

describe("complete: quoting", () => {
  test("quotes and backslashes in the word are removed before matching", () => {
    expect(tab("cat \\no")).toBe(`cat notes.${CURSOR}`);
    expect(tab("cat no\\")).toBe(`cat notes.${CURSOR}`);
    expect(tab('cat ""r')).toBe(`cat report.txt ${CURSOR}`);
    expect(tab('cat m"y d"')).toBe(`cat my\\ dir/${CURSOR}`);
    expect(tab("cat my\\ ")).toBe(`cat my\\ dir/${CURSOR}`);
    expect(tab("cat my\\ dir/f1")).toBe(`cat my\\ dir/f1 ${CURSOR}`);
    expect(tab('cat "my dir"/')).toBe(`cat my\\ dir/f${CURSOR}`);
  });

  test("@differential an opened double or single quote is kept and closed after a file", () => {
    expect(tab('cat "rep')).toBe(`cat "report.txt" ${CURSOR}`);
    expect(tab("cat 'rep")).toBe(`cat 'report.txt' ${CURSOR}`);
    expect(tab('cat "Docu')).toBe(`cat "Documents/${CURSOR}`);
    expect(tab('cat "my')).toBe(`cat "my dir"/${CURSOR}`);
    expect(tab("cat 'my")).toBe(`cat 'my dir'/${CURSOR}`);
    expect(tab('cat "my dir/')).toBe(`cat "my dir/f${CURSOR}`);
  });

  test("a word with an unclosed quote in its middle starts after the quote", () => {
    expect(press('cat my"').line).toBe(`cat my"${CURSOR}`);
    expect(press('cat "')).toEqual({
      line: `cat "${CURSOR}`,
      bell: true,
      matches: press("cat ").matches,
    });
  });

  test("quoted word breaks before the word do not end it", () => {
    expect(tab('cat "a\\" b" no')).toBe(`cat "a\\" b" notes.${CURSOR}`);
  });

  test("a backslash inside single quotes is part of the name", () => {
    expect(press("cat 'no\\")).toEqual({ line: `cat 'no\\${CURSOR}`, bell: true, matches: [] });
    expect(press('cat "no\\a')).toEqual({ line: `cat "no\\a${CURSOR}`, bell: true, matches: [] });
  });

  test("a name without special characters is inserted as it is", () => {
    expect(tab("cat my", "/home/alice")).toBe(`cat my\\ dir/${CURSOR}`);
    expect(tab("cat q", "/home/alice/odd")).toBe(`cat q] ${CURSOR}`);
  });

  test("@differential special characters get backslashes", () => {
    const odd = "/home/alice/odd";
    expect(tab("cat it", odd)).toBe(`cat it\\'s ${CURSOR}`);
    expect(tab("cat a", odd)).toBe(`cat a\\ b.txt ${CURSOR}`);
    expect(tab("cat x", odd)).toBe(`cat x\\$y ${CURSOR}`);
    expect(tab("cat g", odd)).toBe(`cat g\\!h ${CURSOR}`);
    expect(tab("cat c", odd)).toBe(`cat c\\:d ${CURSOR}`);
    expect(tab("cat e", odd)).toBe(`cat e\\@f ${CURSOR}`);
    expect(tab("cat k", odd)).toBe(`cat k\\[1\\] ${CURSOR}`);
    expect(tab("cat u", odd)).toBe(`cat u\\{b\\} ${CURSOR}`);
    expect(tab("cat t", odd)).toBe(`cat t\\ b\\,c\\^d%e\\}f\\]g+h-i.j_k~l#m ${CURSOR}`);
  });

  test("# and ~ get a backslash only at the start", () => {
    const odd = "/home/alice/odd";
    expect(tab("cat \\#", odd)).toBe(`cat \\#x ${CURSOR}`);
    expect(tab("cat h", odd)).toBe(`cat h#x ${CURSOR}`);
    expect(tab("cat \\~", odd)).toBe(`cat \\~t ${CURSOR}`);
  });

  test("a name with a newline goes into single quotes", () => {
    expect(tab("cat n", "/home/alice/odd")).toBe(`cat 'n\nl' ${CURSOR}`);
  });

  test("special characters in quotes are quoted the way of that quote", () => {
    const odd = "/home/alice/odd";
    expect(tab('cat "it', odd)).toBe(`cat "it's" ${CURSOR}`);
    expect(tab("cat 'it", odd)).toBe(`cat 'it'\\''s' ${CURSOR}`);
    expect(tab('cat "x', odd)).toBe(`cat "x\\$y" ${CURSOR}`);
  });

  test("a ! in double quotes gets a backslash and the quote goes, for history expansion", () => {
    expect(tab('cat "g', "/home/alice/odd")).toBe(`cat g\\!h ${CURSOR}`);
  });

  test("a common prefix is quoted too, without a closing quote", () => {
    const pair = "/home/alice/pair";
    expect(press("cat a", pair)).toEqual({
      line: `cat ab\\ c${CURSOR}`,
      bell: true,
      matches: ["ab c1", "ab c2"],
    });
    expect(tab('cat "a', pair)).toBe(`cat "ab c${CURSOR}`);
    expect(tab("cat 'a", pair)).toBe(`cat 'ab c${CURSOR}`);
  });

  test("without a common prefix, a quoted word is quoted again as typed", () => {
    expect(press('cat ""')).toEqual({
      line: `cat \\"\\"${CURSOR}`,
      bell: true,
      matches: press("cat ").matches,
    });
  });

  test("a typed tilde prefix stays unquoted", () => {
    expect(tab("cat ~/my", "/")).toBe(`cat ~/my\\ dir/${CURSOR}`);
  });
});

describe("complete: patterns", () => {
  test("a pattern that matches one path completes to it", () => {
    expect(tab("cat r*t")).toBe(`cat report.txt ${CURSOR}`);
    expect(tab("cat *.md")).toBe(`cat notes.md ${CURSOR}`);
    expect(tab("cat Docu*")).toBe(`cat Documents/${CURSOR}`);
  });

  test("a pattern that matches several paths changes nothing but lists them", () => {
    expect(press("cat no*")).toEqual({
      line: `cat no*${CURSOR}`,
      bell: true,
      matches: ["notes.md", "notes.txt"],
    });
  });

  test("after several pattern matches, the word completes as a literal file name", () => {
    expect(press("cat a*", "/home/alice/glob")).toEqual({
      line: `cat a\\*b ${CURSOR}`,
      bell: false,
      matches: ["a*b", "a b.txt"],
    });
  });

  test("a pattern ending with a slash matches directories, listed with one slash", () => {
    expect(press("cat Docu*/")).toEqual({
      line: `cat Documents/${CURSOR}`,
      bell: false,
      matches: ["Documents/"],
    });
    expect(press("cat ../alice/D*/").matches).toEqual(["Desktop/", "Documents/", "Downloads/"]);
  });

  test("quoted pattern characters and tilde prefixes are not patterns", () => {
    expect(press('cat "no*').matches).toEqual([]);
    expect(press("cat ~/no*").matches).toEqual([]);
  });
});

describe("complete: variables", () => {
  test("$ completes variable names", () => {
    expect(tab("echo $PA")).toBe(`echo $PATH ${CURSOR}`);
    expect(tab("echo ${PA")).toBe(`echo \${PATH} ${CURSOR}`);
    expect(tab(`echo $PA${CURSOR}x`)).toBe(`echo $PATH${CURSOR}x`);
  });

  test("a variable that names a directory gets a slash", () => {
    expect(tab("echo $HOM")).toBe(`echo $HOME/${CURSOR}`);
  });

  test("several variables ring the bell and list the names", () => {
    expect(press("echo $HO")).toEqual({
      line: `echo $HO${CURSOR}`,
      bell: true,
      matches: ["$HOME", "$HOSTNAME"],
    });
    expect(press("echo $").matches).toEqual([...alice.variables.keys()].sort().map((n) => `$${n}`));
  });

  test("after $( comes a command name", () => {
    expect(tab("echo $(whoam")).toBe(`echo $(whoami ${CURSOR}`);
  });

  test("an unknown variable falls back to file names", () => {
    expect(press("echo $NOSUCH").matches).toEqual([]);
  });
});

describe("complete: user names", () => {
  test("~ completes user names; a user with an existing home gets a slash", () => {
    expect(tab("cat ~ro")).toBe(`cat ~root/${CURSOR}`);
    expect(tab("cat ~bo")).toBe(`cat ~bob ${CURSOR}`);
    expect(press("cat ~")).toEqual({
      line: `cat ~${CURSOR}`,
      bell: true,
      matches: ["~alice/", "~bob", "~root/"],
    });
  });

  test("an unknown user has no matches", () => {
    expect(press("cat ~nosuch")).toEqual({ line: `cat ~nosuch${CURSOR}`, bell: true, matches: [] });
  });
});

describe("complete: command names", () => {
  test("the first word completes command names", () => {
    expect(tab("whoam")).toBe(`whoami ${CURSOR}`);
    expect(press("c")).toEqual({
      line: `c${CURSOR}`,
      bell: true,
      matches: ["cat", "cd", "clear", "cp"],
    });
  });

  test("@differential a word after a command separator or assignments is a command name", () => {
    for (const before of ["A=1 ", 'A="x y" B=2 ', "ls;", "ls |", "ls && ", "ls || ", "( ", "{ "]) {
      expect(tab(`${before}whoam`)).toBe(`${before}whoami ${CURSOR}`);
    }
  });

  test("other words are not command names", () => {
    for (const before of [
      "! ",
      "time ",
      "echo hi >",
      "echo A=1 ",
      "ls >|",
      "ls >&",
      "echo a\\; ",
      "echo ${ ",
    ]) {
      expect(press(`${before}whoam`).line).toBe(`${before}whoam${CURSOR}`);
    }
  });

  test("a command word completes directories, not files", () => {
    expect(tab("Docu")).toBe(`Documents/${CURSOR}`);
    expect(press("rep")).toEqual({ line: `rep${CURSOR}`, bell: true, matches: [] });
    expect(tab("Docu*")).toBe(`Documents/${CURSOR}`);
  });

  test("a command word with a slash completes directories and executable files", () => {
    expect(press("scripts/").matches).toEqual(["inner/", "run"]);
    expect(tab("./scripts/r")).toBe(`./scripts/run ${CURSOR}`);
    expect(press("./scripts/d").matches).toEqual([]);
  });

  test("an empty line lists the commands", () => {
    expect(press("").matches).toEqual(commandNames);
  });
});

describe("complete: errors", () => {
  test("a cursor outside the line is a RangeError", () => {
    const request = { world, session: alice, commandNames, line: "ls" };
    expect(() => complete({ ...request, cursor: -1 })).toThrow(RangeError);
    expect(() => complete({ ...request, cursor: 3 })).toThrow(RangeError);
    expect(() => complete({ ...request, cursor: 0.5 })).toThrow(RangeError);
  });

  test("a session on a host outside the world is an Error", () => {
    expect(() =>
      complete({ world, session: { ...alice, host: "nosuch" }, commandNames, line: "", cursor: 0 }),
    ).toThrow(/not part of the world/u);
  });
});

describe("formatCompletionList", () => {
  const match = (name: string, directory = false) => ({ name, directory });

  test("lays out the matches down the columns like readline", () => {
    const matches = [
      match(".bash_history"),
      match(".hidden", true),
      match("Desktop", true),
      match("Documents", true),
      match("Downloads", true),
      match("a b.txt"),
      match("it's"),
      match("my dir", true),
      match("notes.md"),
      match("notes.txt"),
      match("report.txt"),
    ];
    expect(formatCompletionList(matches, 80)).toBe(
      ".bash_history  Documents/     it's           notes.txt      \n" +
        ".hidden/       Downloads/     my dir/        report.txt     \n" +
        "Desktop/       a b.txt        notes.md       \n",
    );
  });

  test("the slash of a directory does not count for the column width", () => {
    expect(formatCompletionList([match("~systemd-network", true), match("~a")], 37)).toBe(
      "~systemd-network/ ~a\n",
    );
  });

  test("columns that fill the width exactly lose one column", () => {
    expect(formatCompletionList([match("ab"), match("cd"), match("ef")], 8)).toBe("ab\ncd\nef\n");
    expect(formatCompletionList([match("ab"), match("cd"), match("ef")], 9)).toBe("ab  ef\ncd  \n");
  });

  test("a match wider than the terminal gets a row of its own", () => {
    expect(formatCompletionList([match("abcdef"), match("g")], 4)).toBe("abcdef\ng\n");
  });

  test("control characters are shown as ^X", () => {
    expect(formatCompletionList([match("n\nl"), match("d\u007f")], 80)).toBe("n^Jl  d^?   \n");
  });

  test("no matches give the empty text; an invalid width is a RangeError", () => {
    expect(formatCompletionList([], 80)).toBe("");
    expect(() => formatCompletionList([match("a")], 0)).toThrow(RangeError);
    expect(() => formatCompletionList([match("a")], 1.5)).toThrow(RangeError);
  });
});

describe("completionQuestion", () => {
  test("readline asks before it lists 100 matches or more", () => {
    expect(completionQuestion(COMPLETION_QUERY_ITEMS - 1)).toBeUndefined();
    expect(completionQuestion(COMPLETION_QUERY_ITEMS)).toBe(
      "Display all 100 possibilities? (y or n)",
    );
  });
});
