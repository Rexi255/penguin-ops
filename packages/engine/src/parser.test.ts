import { describe, expect, test } from "vitest";

import { type WordPart } from "./lexer";
import {
  type AndOrList,
  parse,
  type ParseError,
  type Pipeline,
  type Script,
  type SimpleCommand,
} from "./parser";

function scriptOf(input: string): Script {
  const result = parse(input);
  if (!result.ok) {
    throw new Error(`unexpected parse error: ${JSON.stringify(result.error)}`);
  }
  return result.script;
}

function errorOf(input: string): ParseError {
  const result = parse(input);
  if (result.ok) {
    throw new Error(`expected a parse error for ${JSON.stringify(input)}`);
  }
  return result.error;
}

/** A simple command as `{assignments words redirections}`. */
function commandShape(command: SimpleCommand): string {
  const items = [
    ...command.assignments.map((assignment) => assignment.raw),
    ...command.words.map((word) => word.raw),
    ...command.redirections.map(
      (redirection) => `${redirection.fd ?? ""}${redirection.operator}${redirection.target.raw}`,
    ),
  ];
  return `{${items.join(" ")}}`;
}

function pipelineShape(pipeline: Pipeline): string {
  return pipeline.commands.map(commandShape).join(" | ");
}

function listShape(list: AndOrList): string {
  return [
    pipelineShape(list.first),
    ...list.rest.map((part) => `${part.operator} ${pipelineShape(part.pipeline)}`),
  ].join(" ");
}

/**
 * The tree as a short string: commands in braces with assignments, words and redirections (in
 * this order), pipelines with `|`, and-or lists with their operators, lists joined with `; `.
 */
function shape(input: string): string {
  return scriptOf(input).lists.map(listShape).join("; ");
}

/** The only simple command of `input`. */
function commandOf(input: string): SimpleCommand {
  const [list, ...otherLists] = scriptOf(input).lists;
  const [command, ...otherCommands] = list?.first.commands ?? [];
  if (
    command === undefined ||
    otherLists.length > 0 ||
    otherCommands.length > 0 ||
    list?.rest.length !== 0
  ) {
    throw new Error(`expected exactly one command in ${JSON.stringify(input)}`);
  }
  return command;
}

/** The value of the only assignment of `input`. */
function valueOf(input: string): readonly WordPart[] {
  const [assignment, ...others] = commandOf(input).assignments;
  if (assignment === undefined || others.length > 0) {
    throw new Error(`expected exactly one assignment in ${JSON.stringify(input)}`);
  }
  return assignment.value;
}

/** The parts of the argument words of the only command of `input`. */
function argumentPartsOf(input: string): (readonly WordPart[])[] {
  return commandOf(input)
    .words.slice(1)
    .map((word) => word.parts);
}

function text(value: string, quoted = false): WordPart {
  return { kind: "text", text: value, quoted };
}

function tilde(user = ""): WordPart {
  return { kind: "tilde", user };
}

function parameter(name: string, quoted = false): WordPart {
  return { kind: "parameter", name, quoted };
}

function syntax(near: string, start: number): ParseError {
  return { kind: "syntax", near, start };
}

describe("parse: empty input", () => {
  test("gives no lists for empty input, blanks, line breaks and comments", () => {
    expect(scriptOf("").lists).toEqual([]);
    expect(scriptOf("  \t").lists).toEqual([]);
    expect(scriptOf("\n\n").lists).toEqual([]);
    expect(scriptOf("# only a comment\n  # another").lists).toEqual([]);
  });
});

describe("parse: simple commands", () => {
  test("reads the command name and its arguments as words", () => {
    expect(shape("ls -l /home")).toBe("{ls -l /home}");
  });

  test("keeps the parts of each word from the lexer", () => {
    expect(commandOf("echo 'a b' $HOME").words.map((word) => word.parts)).toEqual([
      [text("echo")],
      [text("a b", true)],
      [parameter("HOME")],
    ]);
  });

  test("records the offsets of the whole tree", () => {
    expect(scriptOf(" cat a > b | wc").lists).toEqual([
      {
        first: {
          commands: [
            {
              kind: "simple",
              assignments: [],
              words: [
                { parts: [text("cat")], start: 1, end: 4, raw: "cat" },
                { parts: [text("a")], start: 5, end: 6, raw: "a" },
              ],
              redirections: [
                {
                  operator: ">",
                  fd: undefined,
                  target: { parts: [text("b")], start: 9, end: 10, raw: "b" },
                  start: 7,
                  end: 10,
                },
              ],
              start: 1,
              end: 10,
            },
            {
              kind: "simple",
              assignments: [],
              words: [{ parts: [text("wc")], start: 13, end: 15, raw: "wc" }],
              redirections: [],
              start: 13,
              end: 15,
            },
          ],
          start: 1,
          end: 15,
        },
        rest: [],
        start: 1,
        end: 15,
      },
    ]);
  });

  test("treats reserved words after the command name as arguments", () => {
    expect(shape("echo if then fi in }")).toBe("{echo if then fi in }}");
  });

  test("treats quoted or escaped reserved words as command names", () => {
    expect(shape("'fi'; \\if; \"then\"")).toBe("{'fi'}; {\\if}; {\"then\"}");
  });

  test("@differential treats reserved words after an assignment or redirection as words", () => {
    expect(shape("x=1 if")).toBe("{x=1 if}");
    expect(shape(">f if")).toBe("{if >f}");
  });

  test("@differential treats time after a pipe as a command name", () => {
    expect(shape("echo a | time cat")).toBe("{echo a} | {time cat}");
  });

  test("treats a word with brackets as a command name when no ]= follows", () => {
    expect(shape("a[1] x")).toBe("{a[1] x}");
  });
});

describe("parse: pipelines and lists", () => {
  test("connects commands with |", () => {
    expect(shape("cat f|grep a | wc -l")).toBe("{cat f} | {grep a} | {wc -l}");
  });

  test("connects pipelines with && and || from left to right", () => {
    expect(shape("a && b || c && d")).toBe("{a} && {b} || {c} && {d}");
    const [list] = scriptOf("a && b || c").lists;
    expect(list?.rest.map((part) => part.operator)).toEqual(["&&", "||"]);
  });

  test("binds | more strongly than && and || and those more strongly than ;", () => {
    expect(shape("a | b && c || d | e; f")).toBe("{a} | {b} && {c} || {d} | {e}; {f}");
  });

  test("separates lists with ; and line breaks", () => {
    expect(shape("a; b\nc")).toBe("{a}; {b}; {c}");
  });

  test("allows a trailing ;, empty lines and comment lines between lists", () => {
    expect(shape("a;")).toBe("{a}");
    expect(shape("a ;\n")).toBe("{a}");
    expect(shape("\n\na\n\n# comment\nb # trailing comment\n\n")).toBe("{a}; {b}");
    expect(shape("a;\n\nb")).toBe("{a}; {b}");
  });

  test("allows line breaks after |, && and ||", () => {
    expect(shape("a |\n\n b")).toBe("{a} | {b}");
    expect(shape("a &&\n b ||\n c")).toBe("{a} && {b} || {c}");
  });

  test("records where a list and a pipeline start and end", () => {
    const [, second] = scriptOf("a; b | c && d").lists;
    expect(second?.start).toBe(3);
    expect(second?.end).toBe(13);
    expect(second?.first.start).toBe(3);
    expect(second?.first.end).toBe(8);
  });
});

describe("parse: assignments", () => {
  test("reads name=value words before the command name as assignments", () => {
    const command = commandOf("LANG=C TZ=UTC date -u");
    expect(command.assignments.map((assignment) => [assignment.name, assignment.value])).toEqual([
      ["LANG", [text("C")]],
      ["TZ", [text("UTC")]],
    ]);
    expect(command.words.map((word) => word.raw)).toEqual(["date", "-u"]);
  });

  test("records name, append flag, offsets and source text", () => {
    expect(commandOf(" x+=a").assignments).toEqual([
      { name: "x", append: true, value: [text("a")], start: 1, end: 5, raw: "x+=a" },
    ]);
    expect(commandOf("x=a").assignments[0]?.append).toBe(false);
  });

  test("accepts a command of assignments only", () => {
    expect(shape("x=1 y=2")).toBe("{x=1 y=2}");
    expect(commandOf("x=1 y=2").words).toEqual([]);
  });

  test("gives an empty value for name= and an empty quoted text for name=''", () => {
    expect(valueOf("x=")).toEqual([]);
    expect(valueOf("x=''")).toEqual([text("", true)]);
  });

  test("keeps quoted parts and parameters of the value", () => {
    expect(valueOf('x=a"b c"$y')).toEqual([text("a"), text("b c", true), parameter("y")]);
    expect(valueOf("x=$y")).toEqual([parameter("y")]);
  });

  test("keeps the = inside the value", () => {
    expect(valueOf("x=a=b")).toEqual([text("a=b")]);
  });

  test("reads assignments after a redirection", () => {
    expect(shape(">log x=1 cmd")).toBe("{x=1 cmd >log}");
  });

  test("treats name=value after the command name as an argument", () => {
    expect(shape("env x=1")).toBe("{env x=1}");
    expect(commandOf("env x=1").assignments).toEqual([]);
  });

  test("needs an unquoted name and = for an assignment", () => {
    expect(commandOf('"x"=1').assignments).toEqual([]);
    expect(commandOf('x"=1"').assignments).toEqual([]);
    expect(commandOf("x\\=1").assignments).toEqual([]);
    expect(commandOf("1x=1").assignments).toEqual([]);
    expect(commandOf("-x=1").assignments).toEqual([]);
  });
});

describe("parse: tildes in assignments", () => {
  test("finds a tilde right after the =", () => {
    expect(valueOf("x=~")).toEqual([tilde()]);
    expect(valueOf("x=~/bin")).toEqual([tilde(), text("/bin")]);
    expect(valueOf("x=~root/bin")).toEqual([tilde("root"), text("/bin")]);
  });

  test("@differential finds tildes after each unquoted colon", () => {
    expect(valueOf("PATH=~/bin:~:/usr/bin:~tux/x")).toEqual([
      tilde(),
      text("/bin:"),
      tilde(),
      text(":/usr/bin:"),
      tilde("tux"),
      text("/x"),
    ]);
  });

  test("@differential finds a tilde after a colon that follows a quoted part", () => {
    expect(valueOf('x="a":~')).toEqual([text("a", true), text(":"), tilde()]);
  });

  test("@differential keeps a tilde literal if quotes or expansions follow in its prefix", () => {
    expect(valueOf('x=~"/b"')).toEqual([text("~"), text("/b", true)]);
    expect(valueOf("x=~$HOME")).toEqual([text("~"), parameter("HOME")]);
    expect(valueOf("x=a:~'b'")).toEqual([text("a:~"), text("b", true)]);
  });

  test("keeps quoted tildes, tildes inside text and tildes with ! literal", () => {
    expect(valueOf("x=\\~")).toEqual([text("~", true)]);
    expect(valueOf('x=a:"~"')).toEqual([text("a:"), text("~", true)]);
    expect(valueOf("x=a~")).toEqual([text("a~")]);
    expect(valueOf("x=~a!")).toEqual([text("~a!")]);
  });

  test("ends a tilde prefix at a colon", () => {
    expect(valueOf("x=~:")).toEqual([tilde(), text(":")]);
  });

  test("@differential finds tildes in arguments that look like assignments", () => {
    expect(argumentPartsOf("echo a=~ b=x:~/y")).toEqual([
      [text("a="), tilde()],
      [text("b=x:"), tilde(), text("/y")],
    ]);
  });

  test("@differential keeps tildes literal in arguments that do not look like assignments", () => {
    expect(argumentPartsOf('echo --prefix=~ x"="~ a:~')).toEqual([
      [text("--prefix=~")],
      [text("x"), text("=", true), text("~")],
      [text("a:~")],
    ]);
  });

  test("keeps the word parts of a redirection target", () => {
    expect(commandOf("echo > ~/x").redirections[0]?.target.parts).toEqual([tilde(), text("/x")]);
  });

  test("@differential finds tildes in redirection targets that look like assignments", () => {
    expect(commandOf("echo > a=~").redirections[0]?.target.parts).toEqual([text("a="), tilde()]);
  });
});

describe("parse: redirections", () => {
  test("reads <, > and >> with their targets", () => {
    expect(shape("sort < in > out")).toBe("{sort <in >out}");
    expect(shape("echo a >> log")).toBe("{echo a >>log}");
  });

  test("keeps the file descriptor as written", () => {
    expect(commandOf("ls 2> err 2>>err2 0<in").redirections.map((r) => r.fd)).toEqual([
      "2",
      "2",
      "0",
    ]);
    expect(commandOf("ls > out").redirections[0]?.fd).toBeUndefined();
  });

  test("records the offsets of a redirection with a file descriptor", () => {
    const [redirection] = commandOf("ls 2>  err").redirections;
    expect(redirection?.start).toBe(3);
    expect(redirection?.end).toBe(10);
  });

  test("accepts redirections before, between and after words, in order", () => {
    const command = commandOf(">a echo >b x <c");
    expect(command.words.map((word) => word.raw)).toEqual(["echo", "x"]);
    expect(command.redirections.map((r) => `${r.operator}${r.target.raw}`)).toEqual([
      ">a",
      ">b",
      "<c",
    ]);
  });

  test("accepts a command of redirections only", () => {
    expect(shape("> new-file")).toBe("{>new-file}");
  });

  test("ends a command at a redirection target and goes on with the pipeline", () => {
    expect(shape("cat < in | sort > out")).toBe("{cat <in} | {sort >out}");
  });
});

describe("parse: syntax errors", () => {
  test("@differential reports a redirection without a target at the end like a line break", () => {
    expect(errorOf("ls >")).toEqual(syntax("newline", 4));
    expect(errorOf("ls 2>  ")).toEqual(syntax("newline", 7));
  });

  test("reports a redirection followed by a line break or an operator", () => {
    expect(errorOf("ls >\npwd")).toEqual(syntax("newline", 4));
    expect(errorOf("ls > ;")).toEqual(syntax(";", 5));
    expect(errorOf("ls > | wc")).toEqual(syntax("|", 5));
    expect(errorOf("ls > &")).toEqual(syntax("&", 5));
  });

  test("@differential names only the file descriptor of a redirection token", () => {
    expect(errorOf("ls > 2>f")).toEqual(syntax("2", 5));
    expect(errorOf("ls > >f")).toEqual(syntax(">", 5));
  });

  test("reports an operator where a command must start", () => {
    expect(errorOf("; ls")).toEqual(syntax(";", 0));
    expect(errorOf("ls; ;")).toEqual(syntax(";", 4));
    expect(errorOf("ls;\n\n;")).toEqual(syntax(";", 5));
    expect(errorOf("| wc")).toEqual(syntax("|", 0));
    expect(errorOf("ls\n| wc")).toEqual(syntax("|", 3));
    expect(errorOf("ls | ;")).toEqual(syntax(";", 5));
    expect(errorOf("ls && || pwd")).toEqual(syntax("||", 6));
    expect(errorOf("& ls")).toEqual(syntax("&", 0));
    expect(errorOf("|& ls")).toEqual(syntax("|&", 0));
    expect(errorOf("&& ls")).toEqual(syntax("&&", 0));
  });

  test("reports the case operators outside a case clause", () => {
    expect(errorOf("ls ;;")).toEqual(syntax(";;", 3));
    expect(errorOf("ls ;& x")).toEqual(syntax(";&", 3));
    expect(errorOf("ls ;;& x")).toEqual(syntax(";;&", 3));
  });

  test("reports parentheses inside a command", () => {
    expect(errorOf("echo a)")).toEqual(syntax(")", 6));
    expect(errorOf(") ls")).toEqual(syntax(")", 0));
    expect(errorOf("echo a (")).toEqual(syntax("(", 7));
    expect(errorOf("x=1 (")).toEqual(syntax("(", 4));
    expect(errorOf(">f (")).toEqual(syntax("(", 3));
    expect(errorOf("echo a=(1)")).toEqual(syntax("(", 7));
  });

  test("@differential reports reserved words that cannot start a command", () => {
    for (const word of ["then", "else", "elif", "fi", "do", "done", "esac", "in", "}", "]]"]) {
      expect(errorOf(word)).toEqual(syntax(word, 0));
    }
    expect(errorOf("ls; fi")).toEqual(syntax("fi", 4));
    expect(errorOf("true | fi")).toEqual(syntax("fi", 7));
    expect(errorOf("true && done")).toEqual(syntax("done", 8));
  });

  test("@differential reports ! after a pipe", () => {
    expect(errorOf("true | ! false")).toEqual(syntax("!", 7));
  });

  test("reports the first error of the input", () => {
    expect(errorOf("fi; ls &")).toEqual(syntax("fi", 0));
    expect(errorOf("ls &; fi")).toEqual({
      kind: "unsupported",
      feature: "background-job",
      start: 3,
    });
  });
});

describe("parse: incomplete input", () => {
  test("asks for a command after |, && and || at the end of the input", () => {
    expect(errorOf("ls |")).toEqual({ kind: "incomplete", missing: "command", start: 3 });
    expect(errorOf("ls &&")).toEqual({ kind: "incomplete", missing: "command", start: 3 });
    expect(errorOf("ls ||")).toEqual({ kind: "incomplete", missing: "command", start: 3 });
  });

  test("asks for a command after an operator that only line breaks follow", () => {
    expect(errorOf("ls |\n\n")).toEqual({ kind: "incomplete", missing: "command", start: 3 });
    expect(errorOf("a && b ||\n")).toEqual({ kind: "incomplete", missing: "command", start: 7 });
  });

  test("returns incomplete input from the lexer unchanged", () => {
    expect(errorOf("echo 'a")).toEqual({ kind: "incomplete", missing: "single-quote", start: 5 });
    expect(errorOf("ls \\")).toEqual({ kind: "incomplete", missing: "next-line", start: 3 });
  });
});

describe("parse: unsupported syntax", () => {
  test.each([
    ["ls &", "background-job", 3],
    ["ls & pwd", "background-job", 3],
    ["(ls)", "subshell", 0],
    ["( (ls) )", "subshell", 0],
    ["a && (ls)", "subshell", 5],
    ["((x = 1))", "arithmetic-command", 0],
    ["ls |& wc", "stderr-pipe", 3],
    ["cat <<EOF", "here-document", 4],
    ["cat <<-EOF", "here-document", 4],
    ["cat <<< hi", "here-string", 4],
    ["ls 2>&1", "fd-duplication", 3],
    ["ls >&2", "fd-duplication", 3],
    ["cat <&3", "fd-duplication", 4],
    ["ls &> out", "output-and-error-redirection", 3],
    ["ls &>> out", "output-and-error-redirection", 3],
    ["cat <> f", "read-write-redirection", 4],
    ["ls >| out", "clobber-redirection", 3],
    ["! ls", "pipeline-negation", 0],
    ["true && ! false", "pipeline-negation", 8],
    ["time ls", "time-keyword", 0],
    ["ls; time ls", "time-keyword", 4],
    ["if true; then ls; fi", "if-clause", 0],
    ["while true; do ls; done", "while-loop", 0],
    ["until true; do ls; done", "until-loop", 0],
    ["for f in *; do ls; done", "for-loop", 0],
    ["select f in a b; do ls; done", "select-loop", 0],
    ["case x in *) ;; esac", "case-clause", 0],
    ["function f { ls; }", "function-definition", 0],
    ["f () { ls; }", "function-definition", 0],
    ["f() { ls; }", "function-definition", 0],
    ["{ ls; }", "command-group", 0],
    ["ls | { cat; }", "command-group", 5],
    ["[[ -f x ]]", "conditional-command", 0],
    ["coproc ls", "coprocess", 0],
    ["x=(1 2)", "array", 0],
    ["x+=(3)", "array", 0],
    ["a[1]=x", "array", 0],
    ["a[$i]=x cmd", "array", 0],
    ["ls; a['k']+=x", "array", 4],
  ] as const)("rejects %j as %s", (input, feature, start) => {
    expect(errorOf(input)).toEqual({ kind: "unsupported", feature, start });
  });

  test("returns unsupported features of the lexer unchanged", () => {
    expect(errorOf("echo $(date)")).toEqual({
      kind: "unsupported",
      feature: "command-substitution",
      start: 5,
    });
  });

  test("treats a space between the = and ( as a syntax error, not an array", () => {
    expect(errorOf("x= (1)")).toEqual(syntax("(", 3));
  });
});
