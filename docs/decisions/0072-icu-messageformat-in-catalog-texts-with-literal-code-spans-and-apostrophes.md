# 0072. ICU MessageFormat in catalog texts with literal code spans and apostrophes

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0012 chose ICU MessageFormat with `intl-messageformat` for placeholders and plurals in the
translation catalogs, and a small markup with `code`. ROADMAP M2.3b asks for the syntax to be
checked when the content is loaded and for formatting with values and plurals.

Plain ICU MessageFormat fits texts about the shell badly. Braces start placeholders, so
`awk '{print $1}'`, `find . -exec rm {} \;`, `${HOME}` or `echo {a,b}` are syntax errors or,
worse, change silently. An apostrophe before a brace, `<`, `>` or (in a plural) `#` starts a
quoted section and disappears: `'{print $1}'` is shown as `{print $1}`. These texts are common
in a game that teaches Linux commands, and authors and translators should not have to learn
ICU's quoting.

Some catalog texts are not formatted at all: the commands in `explanation.example` and in the
first column of `explanation.options`, and the prose file contents that `level.yaml` references
with `{ text: <key> }`, which become files in the simulated world.

Values that the game passes (later for example a player's name, a count or an option name)
must not be able to produce markup when the markup is parsed after formatting (M2.3c).

## Decision

- **Libraries:** `intl-messageformat` (BSD-3-Clause) formats, and its parser
  `@formatjs/icu-messageformat-parser` (MIT) is a direct dependency of the content package for
  the syntax tree and error locations. Versions at least two weeks old are pinned in the lock
  file.
- **Code spans are never ICU:** a code span starts at a backtick and ends at the next backtick
  on the same line. Before parsing, every code span becomes an internal placeholder, so its
  content stays exactly as written (braces, `#`, apostrophes, `<`, `>`). An unclosed code span
  (also one that would go over a line break) and an empty one are problems.
- **Apostrophes are always literal:** every apostrophe outside code is doubled before parsing,
  so ICU's quoting does not exist in catalog texts. A literal brace outside a placeholder
  belongs in code.
- **Tags are text:** the parser runs with `ignoreTag`, so `<file>` and `a > b` need no escaping.
  There is no HTML.
- **Supported placeholders:** `{name}`, `{name, number}` (with styles and skeletons),
  `{name, plural, ...}`, `{name, selectordinal, ...}` and `{name, select, ...}`. `plural`,
  `selectordinal` and `select` need an `other` option. Dates and times are not supported (the
  game has no real time in its pure packages). Placeholder names are camelCase, like the value
  names in TypeScript.
- **Plural options of the language:** the options of `plural` and `selectordinal` (other than
  exact values like `=0`) must be categories of the text's language in `Intl.PluralRules`, so
  `few` is a problem in English but not in Polish.
- **Languages:** a catalog's language must be known to `Intl` (`Intl.PluralRules`); `xx.yaml`
  is a problem. `pt-br` is formatted as `pt-BR`.
- **Level texts have no placeholders:** the game passes no values to level texts yet, so any
  placeholder in a level text is a problem. UI texts may use placeholders; which values the UI
  passes is checked with the UI (M3).
- **What is checked:** title, ticket, hints, `explanation.text`, the description column of
  `explanation.options`, extra goal descriptions, free texts that `level.yaml` does not use for
  file contents, and every UI text. Free texts are checked only when the level file is valid,
  because only it says which texts are file contents. Literal texts are not checked.
- **Problems** name the file, line and column of the spot inside the text: exact for literal
  blocks (`|`) and for texts on one line without escapes, otherwise at the start of the text.
  Messages are readable English, not the parser's error codes.
- **Formatting:** `formatMessage({ language, source }, values)` returns parts: text written in
  the catalog (which may hold markup), the text of a value (never markup) and code (code spans
  and code values `{ code: "--color" }`). Values are strings, numbers or code values; a missing
  value or a value of the wrong type (a string for a plural, code for a select) throws, because
  it is a mistake of the calling code. A number in a simple placeholder is written like
  `String()`, as `intl-messageformat` does; `{name, number}` uses the language's digits.

## Alternatives considered

- **Plain ICU everywhere, with ICU quoting in code:** standard, but every shell example would
  need quoting such as `'{'print $1'}'`, and a forgotten quote changes a hint silently instead
  of failing.
- **Markup first, ICU inside the text nodes:** plural options often contain markup and code, so
  the markup would cut through ICU syntax.
- **Placeholders inside code spans:** would allow `` `cd /home/{user}` ``, but would break
  `${HOME}` and brace expansion in code; the game passes code values instead.
- **Formatting values as plain text that the markup parser reads:** a value such as `**Max**`
  or `- x` would become markup. Escaping values would also break `select`, which compares the
  raw value.
- **ICU and markup in prose file contents:** a file's content is what `cat` shows; braces and
  backticks in a note must stay as written.
- **Allowing any placeholders in level texts:** a placeholder that the game never fills would
  only fail when the text is shown. The list can grow when the game passes values to level
  texts.
- **Reporting problems only at the key:** simpler, but a long ticket text would leave the author
  searching for the brace.

## Consequences

- Authors write shell code in backticks without escaping and apostrophes without thinking about
  ICU. A literal brace in prose needs code; this is documented in `docs/LEVEL-AUTHORING.md`.
- Placeholders cannot appear inside code spans; code-like values are passed as code values.
- The markup parser (M2.3c) works on the parts, so values never become markup.
- Whether the English and German texts use the same placeholders is checked with the
  completeness of the catalogs (M2.4).
