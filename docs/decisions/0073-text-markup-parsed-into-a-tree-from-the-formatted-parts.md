# 0073. Text markup parsed into a tree from the formatted parts

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0012 gives catalog texts a small markup without HTML: `code`, **bold**, lists and
paragraphs. ROADMAP M2.3c asks for it to be parsed into a tree. ADR 0072 already takes code
spans out before ICU formatting and returns the formatted message as parts: catalog text,
values of the game and code. The rules for blocks and bold were not fixed yet, and texts are
written in YAML blocks (`|`), where every line break is kept.

## Decision

- **Tree:** `RichText` is a list of blocks. A block is a `paragraph` with inline content or a
  `list` with items of inline content. Inline content is `text`, `code`, `bold` (with text,
  code and line breaks inside) and `break`. The UI renders the tree with its own elements;
  nothing is read as HTML, so `<b>` is text.
- **Lines and blocks:**
  - A line that starts with `- ` is a list item; the marker and the spaces after it are not
    part of the item. Consecutive items form one list, also right after a paragraph line.
  - Other lines form a paragraph. A line break inside a paragraph is kept as a `break`: what
    the author writes in a `|` block is what the player sees.
  - An empty line, or a line of spaces only, ends a paragraph or a list.
  - There are no nested lists, no numbered lists and no continuation lines of an item.
- **Bold:** `**` opens and closes bold on the same line. Markers pair in order; an unpaired
  marker stays as text, and empty bold is left out. A single `*` is text.
- **Values are not markup:** only catalog text is searched for markers. A value of the game
  (for example `- **Max**`) is text as it is, also at the start of a line. A code value is code.
- **Parsing never fails.** The checks when loading report what would not show as the author
  meant, at the spot in the text:
  - bold that is not closed on its line, or not in its plural or select option;
  - empty bold (`****`, `** **`);
  - bold around a plural or select whose options have a line break;
  - an empty list item.
  Markup is checked only when the ICU syntax is valid. Literal texts (ADR 0072) are not
  checked.
- **API:** `formatText({ language, source }, values)` formats and parses; `parseMarkup(parts)`
  parses formatted parts; `checkText(source, language, rules)` runs the ICU and markup checks
  and is used by `loadContent`.

## Alternatives considered

- **A Markdown library (for example `marked` or `micromark`):** much more syntax than the game
  allows (headings, links, HTML, emphasis with `_`), produces HTML or a large tree, and does not
  know which parts are values.
- **Soft line breaks as in Markdown (joined with a space):** flowing text in the UI, but a
  ticket written like a mail ("Hi,\nthe printer ...") would lose its lines; authors would need
  a special syntax for hard breaks.
- **Bold over line breaks:** possible, but a forgotten `**` would make the rest of a long
  paragraph bold; on one line it is found at once.
- **Lazy continuation lines of list items:** a wrapped item would be written without the
  marker, but then a paragraph after a list would need an empty line; the simple rule "a line
  without `- ` is not an item" is easier to predict.
- **Errors at run time for invalid markup:** the checks when loading find them; a total parser
  keeps the game running with texts from a newer or broken translation.

## Consequences

- The UI (M3) renders `RichText` into React elements, so no translation can inject HTML.
- Authors can write mails, lists and paragraphs as they should look; long lines are wrapped by
  the UI.
- Numbered lists, nested lists, links and headings need a new decision if a text needs them.
