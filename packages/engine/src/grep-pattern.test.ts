import { describe, expect, test } from "vitest";

import { literalSource, type PatternSyntax, translatePattern } from "./grep-pattern";

/** Whether `pattern` in `syntax` matches somewhere in `line`. */
function matches(
  pattern: string,
  line: string,
  syntax: PatternSyntax = "basic",
  flags = "u",
): boolean {
  const translated = translatePattern(pattern, syntax);
  if (!translated.ok) {
    throw new Error(`the pattern ${pattern} failed: ${translated.error}`);
  }
  return new RegExp(translated.source, flags).test(line);
}

function warnings(pattern: string, syntax: PatternSyntax = "basic"): readonly string[] {
  const translated = translatePattern(pattern, syntax);
  if (!translated.ok) {
    throw new Error(`the pattern ${pattern} failed: ${translated.error}`);
  }
  return translated.warnings;
}

describe("basic regular expressions", () => {
  test.each([
    ["abc", "xabcx", true],
    ["abc", "ab", false],
    ["a.c", "abc", true],
    ["a.c", "a\rc", true],
    ["ab*c", "ac", true],
    ["ab*c", "abbbc", true],
    ["a\\+b", "aab", true],
    ["a\\+b", "b", false],
    ["a+b", "a+b", true],
    ["a+b", "aab", false],
    ["a\\?b", "b", true],
    ["a?b", "a?b", true],
    ["a\\{2\\}", "aa", true],
    ["a\\{2\\}", "a", false],
    ["^a\\{1,2\\}$", "aaa", false],
    ["a\\{2,\\}", "aaa", true],
    ["^a\\{,2\\}$", "aa", true],
    ["a{2}", "a{2}", true],
    ["^abc", "abcd", true],
    ["^abc", "xabc", false],
    ["abc$", "xabc", true],
    ["a^b", "a^b", true],
    ["a$b", "a$b", true],
    ["\\(ab\\)*c", "ababc", true],
    ["\\(a\\)\\1", "aa", true],
    ["\\(a\\)\\1", "ab", false],
    ["\\(a\\)\\10", "aa0", true],
    ["cat\\|dog", "hotdog", true],
    ["^\\(cat\\|dog\\)$", "dog", true],
    ["*a", "*a", true],
    ["*a", "a", false],
    ["\\(*a\\)", "*a", true],
    ["^*", "*", true],
    ["a**", "aaa", true],
    ["\\.", "a.b", true],
    ["\\.", "ab", false],
    ["\\*", "*", true],
    ["\\[", "[", true],
    ["\\\\", "a\\b", true],
    ["(a)", "(a)", true],
    ["a|b", "a|b", true],
    ["a|b", "a", false],
  ])("%j matches %j: %s", (pattern, line, expected) => {
    expect(matches(pattern, line)).toBe(expected);
  });
});

describe("extended regular expressions", () => {
  test.each([
    ["a+b", "aab", true],
    ["a+b", "a+b", false],
    ["a?b", "b", true],
    ["(ab)+c", "ababc", true],
    ["cat|dog", "dog", true],
    ["^(cat|dog)$", "cat", true],
    ["a{2}", "aa", true],
    ["a{x", "a{x", true],
    ["a{,2}b", "b", true],
    ["\\(a\\)", "(a)", true],
    ["a\\+", "a+", true],
    ["a^b", "a^b", false],
    ["(a)\\1", "aa", true],
    ["()", "anything", true],
    ["a|", "b", true],
  ])("%j matches %j: %s", (pattern, line, expected) => {
    expect(matches(pattern, line, "extended")).toBe(expected);
  });

  test.each([
    ["*a", "* at start of expression"],
    ["+a", "+ at start of expression"],
    ["?a", "? at start of expression"],
    ["{2}a", "{...} at start of expression"],
    ["(*a)", "* at start of expression"],
    ["a|*b", "* at start of expression"],
    ["^*a", "* at start of expression"],
  ])("%j warns %j and ignores the operator", (pattern, warning) => {
    expect(warnings(pattern, "extended")).toEqual([warning]);
    expect(matches(pattern, "a", "extended")).toBe(true);
  });

  test("a repetition at the start of a basic expression is ordinary and gives no warning", () => {
    expect(warnings("*a")).toEqual([]);
  });
});

describe("bracket expressions", () => {
  test.each([
    ["[abc]", "b", true],
    ["[abc]", "d", false],
    ["[^abc]", "d", true],
    ["^[^abc]$", "a", false],
    ["[a-c]", "b", true],
    ["[a-c]", "d", false],
    ["[]a]", "]", true],
    ["[^]a]", "]", false],
    ["[a-]", "-", true],
    ["[\\]", "\\", true],
    ["[[:digit:]]", "5", true],
    ["[[:digit:]]", "x", false],
    ["[[:alpha:]]", "ä", true],
    ["[[:upper:]]", "A", true],
    ["[[:upper:]]", "a", false],
    ["[[:lower:]]", "a", true],
    ["[[:space:]]", "\t", true],
    ["[[:space:]]", "\u00a0", false],
    ["[[:blank:]]", " ", true],
    ["[[:punct:]]", "!", true],
    ["[[:alnum:]_]", "_", true],
    ["[[:xdigit:]]", "F", true],
    ["[[:cntrl:]]", "\u0001", true],
    ["[[:print:]]", " ", true],
    ["[[:graph:]]", " ", false],
    ["[[=a=]]", "a", true],
    ["[[.-.]]", "-", true],
    ["[[.a.]-c]", "b", true],
  ])("%j matches %j: %s", (pattern, line, expected) => {
    expect(matches(pattern, line)).toBe(expected);
  });

  test("[[:upper:]] matches lower case letters when case is ignored", () => {
    expect(matches("[[:upper:]]", "a", "basic", "iu")).toBe(true);
  });
});

describe("GNU escapes", () => {
  test.each([
    ["\\<cat", "a cat", true],
    ["\\<cat", "concat", false],
    ["cat\\>", "cat!", true],
    ["cat\\>", "cats", false],
    ["\\bcat\\b", "a cat b", true],
    ["\\bcat\\b", "cats", false],
    ["a\\Bb", "ab", true],
    ["a\\Bb", "a b", false],
    ["\\w\\+", "ä_1", true],
    ["^\\W$", "!", true],
    ["a\\sb", "a b", true],
    ["a\\Sb", "a-b", true],
    ["\\`a", "ab", true],
    ["b\\'", "ab", true],
  ])("%j matches %j: %s", (pattern, line, expected) => {
    expect(matches(pattern, line)).toBe(expected);
  });

  test.each([
    ["\\d", "stray \\ before d"],
    ["\\-", "stray \\ before -"],
    ["\\/", "stray \\ before /"],
    ["\\ ", "stray \\ before white space"],
    ["\\\u0001", "stray \\ before unprintable character"],
  ])("%j warns %j and stays ordinary", (pattern, warning) => {
    expect(warnings(pattern)).toEqual([warning]);
  });

  test("a backslash before a known character gives no warning", () => {
    expect(warnings("\\.\\*\\[\\^\\$\\\\")).toEqual([]);
    expect(warnings("\\{\\(\\)\\|\\+\\?", "extended")).toEqual([]);
  });
});

describe("errors", () => {
  test.each([
    ["[abc", "Unmatched [, [^, [:, [., or [="],
    ["[[:alpha:]", "Unmatched [, [^, [:, [., or [="],
    ["[[:alpha", "Unmatched [, [^, [:, [., or [="],
    ["\\(a", "Unmatched ( or \\("],
    ["a\\)", "Unmatched ) or \\)"],
    ["a\\", "Trailing backslash"],
    ["\\1", "Invalid back reference"],
    ["\\(a\\1\\)", "Invalid back reference"],
    ["a\\{1", "Unmatched \\{"],
    ["a\\{x\\}", "Invalid content of \\{\\}"],
    ["a\\{2,1\\}", "Invalid content of \\{\\}"],
    ["a\\{99999\\}", "Regular expression too big"],
    ["[z-a]", "Invalid range end"],
    ["[[:foo:]]", "Invalid character class name"],
    ["[[.ab.]]", "Invalid collation character"],
  ])("basic %j fails with %j", (pattern, error) => {
    expect(translatePattern(pattern, "basic")).toEqual({ ok: false, stage: "regcomp", error });
  });

  test.each([
    ["(a", "Unmatched ( or \\("],
    ["a)", "Unmatched ) or \\)"],
    ["a{2,1}", "Invalid content of \\{\\}"],
  ])("extended %j fails with %j", (pattern, error) => {
    expect(translatePattern(pattern, "extended")).toEqual({ ok: false, stage: "regcomp", error });
  });

  test("dfa rejects a character class without its brackets", () => {
    expect(translatePattern("[:space:]", "basic")).toEqual({
      ok: false,
      stage: "dfa",
      error: "character class syntax is [[:space:]], not [:space:]",
    });
  });
});

describe("literalSource", () => {
  test("escapes every special character", () => {
    const source = literalSource("a.b*c[d](e)|f\\g^h$i{j}+k?l/m-n");
    expect(new RegExp(source, "u").test("a.b*c[d](e)|f\\g^h$i{j}+k?l/m-n")).toBe(true);
    expect(new RegExp(source, "u").test("aXb*c[d](e)|f\\g^h$i{j}+k?l/m-n")).toBe(false);
  });
});
