# 0065. Tab completion like bash 5.2 and readline 8.2 without programmable completion

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.11 asks for the engine APIs behind the terminal's Tab key and history keys. This
record covers Tab completion (M1.11a); history navigation follows in M1.11b. Players press Tab
all the time on a real system, so the game's terminal must complete the way bash does: the
same insertions, the same quoting of special characters, the same bell and the same list on
the second Tab.

Bash completes with readline's `rl_complete` and its own `attempt_shell_completion`. Neither
source could be fetched from the session, but the container runs bash 5.2.21 with readline 8.2
(Debian 13 ships bash 5.2.37 with the same readline). Every rule below was measured on that
bash through a pseudo terminal, with `--norc`, an empty `INPUTRC` and readline's defaults:
`mark-directories` and `match-hidden-files` on, `show-all-if-ambiguous` off,
`completion-query-items` 100.

Debian 13 installs the `bash-completion` package only with the "standard system utilities"
task, and many systems (containers, minimal installs) do not have it. Its programmable
completion (`complete -F`) adds option and argument completion per command and would be a
large project of its own.

## Decision

- **API.** The new `src/completion.ts` exports `complete(request)`. The request holds the
  world, the session, the command names the shell can run (the game's `PATH`), the input line
  and the cursor (UTF-16 offset). The result is the new line and cursor, whether readline rings
  the bell, and the matches readline lists on the second Tab (sorted with `compareNames`, each
  with its printed name and a directory flag). `formatCompletionList(matches, columns)` lays
  them out like readline's `rl_display_match_list`, and `completionQuestion(count)` gives the
  question `Display all N possibilities? (y or n)` from 100 matches on. The UI owns the keys:
  it applies the result, rings the bell, and lists the matches on a second Tab right after a
  Tab that left the line unchanged, like readline.
- **The word.** It ends at the cursor and starts after an unclosed `'` or `"`, else after the
  last unquoted character of bash's `COMP_WORDBREAKS` (` \t\n"'@><=;|&(:`); `@` stays part of
  the word. Quoting is judged like bash's `char_is_quoted`.
- **The order of attempts**, like `attempt_shell_completion`: a word starting with `$`
  completes shell variables (`$NAME`, `${NAME}`); a word starting with `~` without `/`
  completes user names (`~name`); a word in command position (at the start of the line, after
  `;`, `|`, `&`, `{`, `(` that are not part of `>&`, `<&`, `>|` or `${`, also after assignments)
  completes the command names, or with a `/` the directories and executable files of its path;
  then a word with an unquoted `*`, `?` or `[` completes to the one path it matches (several
  paths only fill the list); last, file names. In command position only directories remain of
  the file names and patterns (`bash_ignore_filenames`).
- **File names.** The word is dequoted like `bash_dequote_filename`. The entries of its
  directory part (tilde expanded; `.` if there is none) that start with the rest match; an empty
  rest gives all entries but `.` and `..`, hidden ones included. Matching is case-sensitive.
- **Insertion.** One match replaces the word. Then, like readline's `append_to_match`: a
  directory gets `/` (also inside the line, unless a `/` follows or already ends the line);
  anything else gets, at the end of the line only, the closing quote the player opened and a
  space. A variable that names a directory gets `/` instead of the space. Several matches
  insert their longest common prefix (or the word itself if they have none) and ring the bell.
- **Quoting**, like `make_quoted_replacement` and `bash_quote_filename`: only a match with one
  of `` \t\n\"'@<>=;|&()#$`?*[!:{~`` is quoted. Without an opened quote it gets backslashes
  before `` \t\n\"'$`!&()*,:;<=>?@[]^{|}``, and before `#` and `~` at its start; a name with a
  newline goes into single quotes. With an opened quote it is written in that quote's style
  (double quotes escape `$`, `` ` ``, `"`, `\`), and several matches lose the closing quote. In
  double quotes a match with `!` switches to backslashes and drops the opening quote (history
  expansion). A tilde prefix the player typed is never quoted.
- **Not simulated:** programmable completion (`bash-completion`, `complete`, `compgen`),
  bash's builtins, keywords, aliases and functions as command names, hostname completion after
  `@`, variables in the directory part (`$HOME/D` completes nothing; bash expands it), patterns
  with a tilde prefix, completion inside backquotes, readline's other completion keys (`M-?`,
  `M-*`) and settings. The list pager (`--More--`) is part of the UI's terminal (M3).
- Behaviour measured on bash 5.2.21 and not yet checked on Debian 13 itself is marked
  `@differential` in the tests where it is unusual: the quoting of `]` and `}`, the missing
  closing quote after a directory, and the assignments before a command name.

## Alternatives considered

- **Programmable completion of `bash-completion`:** completes options and only directories
  after `cd`, which would help players. But it is not there on every Debian 13, its scripts are
  thousands of lines of bash, and simulating them per command multiplies the work of every
  command. It can follow as an idea once the command set is stable.
- **A simpler completion (common prefix of file names only):** quick to build, but players who
  know bash would notice at once: no quoting of `my file`, no `/` after directories, no
  commands, and a different second Tab.
- **Completion inside the UI:** the UI would need the file system and the shell's quoting
  rules, which belong to the engine; it could not be tested without the DOM.

## Consequences

- The terminal of M3 calls `complete` on Tab, prints `formatCompletionList` after the input
  line on the second Tab and asks `completionQuestion` before long lists.
- New commands automatically take part through the command names the game passes in.
- Bash's quirks become part of the game, for example `cat ""` plus Tab giving `\"\"`.
- When M6 compares the game with a real Debian 13, the `@differential` tests and this record's
  list of measured rules are the checklist.
