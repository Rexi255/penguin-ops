import { describe, expect, test } from "vitest";

import { type LexError, lex, type Token, type WordPart } from "./lexer";

function tokensOf(input: string): readonly Token[] {
  const result = lex(input);
  if (!result.ok) {
    throw new Error(`unexpected lex error: ${JSON.stringify(result.error)}`);
  }
  return result.tokens;
}

function errorOf(input: string): LexError {
  const result = lex(input);
  if (result.ok) {
    throw new Error(`expected a lex error for ${JSON.stringify(input)}`);
  }
  return result.error;
}

/** The tokens as short strings: words as their raw text, operators as themselves. */
function shapes(input: string): string[] {
  return tokensOf(input).map((token) => {
    switch (token.kind) {
      case "word":
        return `word:${token.raw}`;
      case "control":
        return `control:${token.operator}`;
      case "redirection":
        return `redirection:${token.fd ?? ""}${token.operator}`;
      case "newline":
        return "newline";
    }
  });
}

/** The parts of the only word in `input`. */
function partsOf(input: string): readonly WordPart[] {
  const tokens = tokensOf(input);
  const [first] = tokens;
  if (tokens.length !== 1 || first?.kind !== "word") {
    throw new Error(`expected exactly one word in ${JSON.stringify(input)}`);
  }
  return first.parts;
}

function text(value: string, quoted = false): WordPart {
  return { kind: "text", text: value, quoted };
}

function parameter(name: string, quoted = false): WordPart {
  return { kind: "parameter", name, quoted };
}

describe("lex: words and blanks", () => {
  test("splits words at spaces and tabs", () => {
    expect(shapes("ls  -l\t/home")).toEqual(["word:ls", "word:-l", "word:/home"]);
  });

  test("gives no tokens for empty input and blanks only", () => {
    expect(tokensOf("")).toEqual([]);
    expect(tokensOf("  \t ")).toEqual([]);
  });

  test("records the offsets and the source text of each word", () => {
    expect(tokensOf(" echo 'a b'")).toEqual([
      { kind: "word", parts: [text("echo")], start: 1, end: 5, raw: "echo" },
      { kind: "word", parts: [text("a b", true)], start: 6, end: 11, raw: "'a b'" },
    ]);
  });

  test("turns an unquoted line break into a newline token", () => {
    expect(shapes("pwd\nls\n")).toEqual(["word:pwd", "newline", "word:ls", "newline"]);
    expect(tokensOf("a\nb")[1]).toEqual({ kind: "newline", start: 1, end: 2, raw: "\n" });
  });

  test("treats a carriage return as part of a word like bash", () => {
    expect(partsOf("ls\r")).toEqual([text("ls\r")]);
  });

  test("keeps characters outside ASCII in words", () => {
    expect(partsOf("café→🐧")).toEqual([text("café→🐧")]);
  });
});

describe("lex: comments", () => {
  test("skips a comment up to the end of the line", () => {
    expect(shapes("ls # list files\npwd")).toEqual(["word:ls", "newline", "word:pwd"]);
  });

  test("skips a comment at the start of the input and after an operator", () => {
    expect(shapes("# only a comment")).toEqual([]);
    expect(shapes("ls;#comment")).toEqual(["word:ls", "control:;"]);
  });

  test("keeps # inside a word", () => {
    expect(partsOf("issue#42")).toEqual([text("issue#42")]);
    expect(partsOf("''#x")).toEqual([text("", true), text("#x")]);
  });

  test("does not continue a comment with a trailing backslash", () => {
    expect(shapes("# note \\\nls")).toEqual(["newline", "word:ls"]);
  });
});

describe("lex: quotes", () => {
  test("keeps everything inside single quotes literally", () => {
    expect(partsOf("'$HOME \\n \"x\" ~ * # ! |'")).toEqual([text('$HOME \\n "x" ~ * # ! |', true)]);
  });

  test("keeps a line break inside single quotes", () => {
    expect(partsOf("'a\nb'")).toEqual([text("a\nb", true)]);
  });

  test("keeps blanks and operators inside double quotes", () => {
    expect(partsOf('"a  b | c > d ; # e"')).toEqual([text("a  b | c > d ; # e", true)]);
  });

  test("keeps an empty quoted word as an empty argument", () => {
    expect(shapes("echo '' \"\"")).toEqual(["word:echo", "word:''", 'word:""']);
    expect(partsOf("''")).toEqual([text("", true)]);
    expect(partsOf('""')).toEqual([text("", true)]);
  });

  test("joins quoted and unquoted parts of one word", () => {
    expect(partsOf("a'b'\"c\"d")).toEqual([text("a"), text("bc", true), text("d")]);
  });

  test("expands parameters inside double quotes but not inside single quotes", () => {
    expect(partsOf("\"home: $HOME\"'$HOME'")).toEqual([
      text("home: ", true),
      parameter("HOME", true),
      text("$HOME", true),
    ]);
  });
});

describe("lex: backslashes", () => {
  test("quotes the next character outside quotes", () => {
    expect(partsOf("a\\ b")).toEqual([text("a"), text(" ", true), text("b")]);
    expect(partsOf("\\*")).toEqual([text("*", true)]);
    expect(partsOf("\\$HOME")).toEqual([text("$", true), text("HOME")]);
    expect(partsOf("\\\\")).toEqual([text("\\", true)]);
  });

  test("quotes operator characters, # and ~", () => {
    expect(partsOf("a\\|b\\;c\\>d")).toEqual([
      text("a"),
      text("|", true),
      text("b"),
      text(";", true),
      text("c"),
      text(">", true),
      text("d"),
    ]);
    expect(partsOf("\\#x")).toEqual([text("#", true), text("x")]);
    expect(partsOf("\\~")).toEqual([text("~", true)]);
  });

  test("removes a backslash and the line break after it", () => {
    expect(partsOf("ec\\\nho")).toEqual([text("echo")]);
    expect(shapes("echo \\\nhello")).toEqual(["word:echo", "word:hello"]);
    expect(shapes("echo \\\n")).toEqual(["word:echo"]);
  });

  test('escapes only $, `, ", \\ and the line break inside double quotes', () => {
    expect(partsOf('"\\$ \\` \\" \\\\"')).toEqual([text('$ ` " \\', true)]);
    expect(partsOf('"\\n \\a \\*"')).toEqual([text("\\n \\a \\*", true)]);
    expect(partsOf('"a\\\nb"')).toEqual([text("ab", true)]);
  });
});

describe("lex: parameters", () => {
  test("reads $name with letters, digits and underscores", () => {
    expect(partsOf("$HOME")).toEqual([parameter("HOME")]);
    expect(partsOf("$_my_var2/x")).toEqual([parameter("_my_var2"), text("/x")]);
    expect(partsOf("$USER.log")).toEqual([parameter("USER"), text(".log")]);
  });

  test("reads ${name} and text directly after it", () => {
    expect(partsOf("${USER}name")).toEqual([parameter("USER"), text("name")]);
    expect(partsOf('"${HOME}/x"')).toEqual([parameter("HOME", true), text("/x", true)]);
  });

  test("adds no empty text part to double quotes with content", () => {
    expect(partsOf('"$HOME"')).toEqual([parameter("HOME", true)]);
    expect(partsOf('"\\\n"')).toEqual([text("", true)]);
  });

  test("reads special parameters", () => {
    for (const name of ["?", "$", "!", "#", "@", "*", "-"]) {
      expect(partsOf(`$${name}`)).toEqual([parameter(name)]);
      expect(partsOf(`\${${name}}`)).toEqual([parameter(name)]);
    }
  });

  test("reads one digit as a positional parameter and more digits only in braces", () => {
    expect(partsOf("$0")).toEqual([parameter("0")]);
    expect(partsOf("$10")).toEqual([parameter("1"), text("0")]);
    expect(partsOf("${10}")).toEqual([parameter("10")]);
  });

  test("keeps $ as text when no name follows", () => {
    expect(partsOf("$")).toEqual([text("$")]);
    expect(partsOf("a$/b")).toEqual([text("a$/b")]);
    expect(partsOf("5$%")).toEqual([text("5$%")]);
    expect(shapes("echo $ x")).toEqual(["word:echo", "word:$", "word:x"]);
    expect(partsOf('"cost: 5$"')).toEqual([text("cost: 5$", true)]);
  });

  test("keeps $' and $\" as text inside double quotes", () => {
    expect(partsOf('"a$\'b"')).toEqual([text("a$'b", true)]);
    expect(partsOf('"a$"')).toEqual([text("a$", true)]);
  });

  test("ends a parameter at an operator", () => {
    expect(shapes("echo $?;ls")).toEqual(["word:echo", "word:$?", "control:;", "word:ls"]);
  });
});

describe("lex: tilde", () => {
  test("reads ~ and ~/path at the start of a word", () => {
    expect(partsOf("~")).toEqual([{ kind: "tilde", user: "" }]);
    expect(partsOf("~/notes")).toEqual([{ kind: "tilde", user: "" }, text("/notes")]);
  });

  test("reads ~name, ~+ and ~- up to the first slash", () => {
    expect(partsOf("~alice/docs")).toEqual([{ kind: "tilde", user: "alice" }, text("/docs")]);
    expect(partsOf("~+")).toEqual([{ kind: "tilde", user: "+" }]);
    expect(partsOf("~-/x")).toEqual([{ kind: "tilde", user: "-" }, text("/x")]);
  });

  test("ends the tilde prefix at blanks and operators", () => {
    expect(shapes("cd ~;ls ~ ~>x")).toEqual([
      "word:cd",
      "word:~",
      "control:;",
      "word:ls",
      "word:~",
      "word:~",
      "redirection:>",
      "word:x",
    ]);
  });

  test("keeps ~ as text inside a word and in quotes", () => {
    expect(partsOf("a~")).toEqual([text("a~")]);
    expect(partsOf("'~'")).toEqual([text("~", true)]);
    expect(partsOf('"~"')).toEqual([text("~", true)]);
    expect(partsOf("''~")).toEqual([text("", true), text("~")]);
  });

  test("keeps ~ as text when the prefix contains quotes or expansions", () => {
    expect(partsOf("~'alice'")).toEqual([text("~"), text("alice", true)]);
    expect(partsOf("~$USER")).toEqual([text("~"), parameter("USER")]);
    expect(partsOf("~a\\b")).toEqual([text("~a"), text("b", true)]);
  });

  test("expands the tilde before a quoted rest of the path", () => {
    expect(partsOf("~/'a b'")).toEqual([{ kind: "tilde", user: "" }, text("/"), text("a b", true)]);
  });
});

describe("lex: operators", () => {
  test("reads control operators with and without blanks", () => {
    expect(shapes("a|b||c&&d;e&f")).toEqual([
      "word:a",
      "control:|",
      "word:b",
      "control:||",
      "word:c",
      "control:&&",
      "word:d",
      "control:;",
      "word:e",
      "control:&",
      "word:f",
    ]);
  });

  test("reads the rare control operators as one token", () => {
    expect(shapes(";;& ;; ;& |& ( )")).toEqual([
      "control:;;&",
      "control:;;",
      "control:;&",
      "control:|&",
      "control:(",
      "control:)",
    ]);
  });

  test("reads every redirection operator, longest first", () => {
    expect(shapes("<<< <<- << <> <& < &>> &> >> >& >| >")).toEqual([
      "redirection:<<<",
      "redirection:<<-",
      "redirection:<<",
      "redirection:<>",
      "redirection:<&",
      "redirection:<",
      "redirection:&>>",
      "redirection:&>",
      "redirection:>>",
      "redirection:>&",
      "redirection:>|",
      "redirection:>",
    ]);
  });

  test("splits operators without blanks like bash", () => {
    expect(shapes("ls>out.txt")).toEqual(["word:ls", "redirection:>", "word:out.txt"]);
    expect(shapes("|||")).toEqual(["control:||", "control:|"]);
    expect(shapes(">>>")).toEqual(["redirection:>>", "redirection:>"]);
  });

  test("records the offsets of operators", () => {
    expect(tokensOf("a && b")[1]).toEqual({
      kind: "control",
      operator: "&&",
      start: 2,
      end: 4,
      raw: "&&",
    });
  });
});

describe("lex: file descriptors of redirections", () => {
  test("takes digits directly before < or > as the file descriptor", () => {
    expect(tokensOf("ls 2>/dev/null")).toEqual([
      { kind: "word", parts: [text("ls")], start: 0, end: 2, raw: "ls" },
      { kind: "redirection", operator: ">", fd: "2", start: 3, end: 5, raw: "2>" },
      { kind: "word", parts: [text("/dev/null")], start: 5, end: 14, raw: "/dev/null" },
    ]);
    expect(shapes("cmd 2>>log 0<in 10>&1")).toEqual([
      "word:cmd",
      "redirection:2>>",
      "word:log",
      "redirection:0<",
      "word:in",
      "redirection:10>&",
      "word:1",
    ]);
  });

  test("keeps the digits as written", () => {
    const [token] = tokensOf("007>x");
    expect(token).toMatchObject({ kind: "redirection", fd: "007", raw: "007>" });
  });

  test("does not take digits that are separated, quoted, mixed or before &>", () => {
    expect(shapes("echo 2 >x")).toEqual(["word:echo", "word:2", "redirection:>", "word:x"]);
    expect(shapes("echo a2>x")).toEqual(["word:echo", "word:a2", "redirection:>", "word:x"]);
    expect(shapes("echo '2'>x")).toEqual(["word:echo", "word:'2'", "redirection:>", "word:x"]);
    expect(shapes("echo \\2>x")).toEqual(["word:echo", "word:\\2", "redirection:>", "word:x"]);
    expect(shapes("echo 2&>x")).toEqual(["word:echo", "word:2", "redirection:&>", "word:x"]);
  });

  test("does not take digits before a control operator", () => {
    expect(shapes("echo 2|cat")).toEqual(["word:echo", "word:2", "control:|", "word:cat"]);
  });
});

describe("lex: incomplete input", () => {
  test("reports an unterminated single quote", () => {
    expect(errorOf("echo 'abc")).toEqual({ kind: "incomplete", missing: "single-quote", start: 5 });
  });

  test("reports an unterminated double quote", () => {
    expect(errorOf('echo "abc')).toEqual({ kind: "incomplete", missing: "double-quote", start: 5 });
    expect(errorOf('echo "abc\\')).toEqual({
      kind: "incomplete",
      missing: "double-quote",
      start: 5,
    });
    expect(errorOf('echo "a\\"')).toEqual({
      kind: "incomplete",
      missing: "double-quote",
      start: 5,
    });
  });

  test("reports an unterminated ${", () => {
    expect(errorOf("echo ${HOME")).toEqual({
      kind: "incomplete",
      missing: "closing-brace",
      start: 5,
    });
    expect(errorOf('echo "${HOME"')).toEqual({
      kind: "incomplete",
      missing: "closing-brace",
      start: 6,
    });
  });

  test("reports a backslash at the end of the input", () => {
    expect(errorOf("echo a\\")).toEqual({ kind: "incomplete", missing: "next-line", start: 6 });
  });

  test("reads a quote that ends on a later line", () => {
    expect(partsOf("'a\n'")).toEqual([text("a\n", true)]);
  });
});

describe("lex: unsupported features", () => {
  function unsupported(input: string): string {
    const error = errorOf(input);
    if (error.kind !== "unsupported") {
      throw new Error(`expected an unsupported feature in ${JSON.stringify(input)}`);
    }
    return `${error.feature}@${String(error.start)}`;
  }

  test("rejects command substitution with $( and backticks", () => {
    expect(unsupported("echo $(date)")).toBe("command-substitution@5");
    expect(unsupported("echo `date`")).toBe("command-substitution@5");
    expect(unsupported('echo "$(date)"')).toBe("command-substitution@6");
    expect(unsupported('echo "`date`"')).toBe("command-substitution@6");
  });

  test("rejects arithmetic expansion", () => {
    expect(unsupported("echo $((1+2))")).toBe("arithmetic-expansion@5");
    expect(unsupported("echo $[1+2]")).toBe("arithmetic-expansion@5");
  });

  test("rejects parameter expansion with operators", () => {
    expect(unsupported("echo ${HOME:-/}")).toBe("parameter-expansion@5");
    expect(unsupported("echo ${#HOME}")).toBe("parameter-expansion@5");
    expect(unsupported("echo ${!x}")).toBe("parameter-expansion@5");
    expect(unsupported('echo "${a[0]}"')).toBe("parameter-expansion@6");
  });

  test("rejects ${} as unsupported instead of reporting bash's bad substitution", () => {
    expect(unsupported("echo ${}")).toBe("parameter-expansion@5");
  });

  test("rejects process substitution", () => {
    expect(unsupported("diff <(ls) b")).toBe("process-substitution@5");
    expect(unsupported("tee >(cat)")).toBe("process-substitution@4");
  });

  test("rejects $'…' and $\"…\" quoting", () => {
    expect(unsupported("echo $'a\\n'")).toBe("ansi-c-quoting@5");
    expect(unsupported('echo $"hello"')).toBe("locale-quoting@5");
  });

  test("@differential rejects history expansion with !", () => {
    expect(unsupported("sudo !!")).toBe("history-expansion@5");
    expect(unsupported("echo !$")).toBe("history-expansion@5");
    expect(unsupported("echo a!b")).toBe("history-expansion@6");
    expect(unsupported('echo "!!"')).toBe("history-expansion@6");
  });

  test("@differential keeps ! as text where bash starts no history expansion", () => {
    expect(shapes("! true")).toEqual(["word:!", "word:true"]);
    expect(partsOf("hello!")).toEqual([text("hello!")]);
    expect(shapes("[ a != b ]")).toEqual(["word:[", "word:a", "word:!=", "word:b", "word:]"]);
    expect(partsOf('"Hello World!"')).toEqual([text("Hello World!", true)]);
    expect(partsOf("'!!'")).toEqual([text("!!", true)]);
    expect(partsOf("\\!!")).toEqual([text("!", true), text("!")]);
    expect(partsOf('"\\!x"')).toEqual([text("\\!x", true)]);
    expect(shapes("a!\nb")).toEqual(["word:a!", "newline", "word:b"]);
    expect(shapes("!(x)")).toEqual(["word:!", "control:(", "word:x", "control:)"]);
  });

  test("reports the first problem of the input", () => {
    expect(unsupported("echo $(a) 'b")).toBe("command-substitution@5");
    expect(errorOf("echo 'b $(a)")).toEqual({
      kind: "incomplete",
      missing: "single-quote",
      start: 5,
    });
  });
});

describe("lex: whole command lines", () => {
  test("splits a pipeline with redirections and a list", () => {
    expect(
      shapes("grep -i error /var/log/syslog | sort >> ~/errors.txt 2>/dev/null && echo done"),
    ).toEqual([
      "word:grep",
      "word:-i",
      "word:error",
      "word:/var/log/syslog",
      "control:|",
      "word:sort",
      "redirection:>>",
      "word:~/errors.txt",
      "redirection:2>",
      "word:/dev/null",
      "control:&&",
      "word:echo",
      "word:done",
    ]);
  });

  test("keeps the parts of an assignment for the parser", () => {
    const [assignment] = tokensOf('GREETING="hi $USER"; echo');
    expect(assignment).toMatchObject({
      kind: "word",
      parts: [text("GREETING="), text("hi ", true), parameter("USER", true)],
    });
  });
});
