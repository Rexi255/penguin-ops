// Tests of the game notices' texts (ADR 0102): an input for every notice the game can give shows
// that notice's own text, in both languages, as one paragraph; the inputs cover every notice text
// of the UI catalogs.
import { MANDATORY_LANGUAGES, type RichText } from "@penguin-ops/content";
import { createGameClock } from "@penguin-ops/engine";
import { GAME_START_TIME, levelSetup, runInput, startLevel } from "@penguin-ops/gameplay";
import { describe, expect, test } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { createTexts, paragraphOf, UI_TEXT_PLACEHOLDERS } from "../texts/ui-texts";
import { noticeKey, noticeText } from "./notice-text";
import type { NoticeEvent } from "./terminal-model";

const content = loadBundledContent();

/** An input that stops with each notice, by the notice's text key. */
const INPUTS: Readonly<Record<string, string>> = {
  "notices.option-not-simulated": "ls -Z",
  "notices.variable-not-simulated": "HISTTIMEFORMAT=%F history",
  "notices.invalid-utf8-not-simulated": "echo -e '\\xff'",
  "notices.terminal-input-not-simulated": "cat",
  "notices.game-output-not-simulated": "help > out.txt",
  "notices.command-substitution": "echo $(pwd)",
  "notices.arithmetic-expansion": "echo $((1 + 2))",
  "notices.parameter-expansion": "echo ${HOME:-/}",
  "notices.process-substitution": "cat <(ls)",
  "notices.ansi-c-quoting": "echo $'a'",
  "notices.locale-quoting": 'echo $"a"',
  "notices.history-expansion": "echo !!",
  "notices.background-job": "ls &",
  "notices.subshell": "(ls)",
  "notices.arithmetic-command": "((1))",
  "notices.stderr-pipe": "ls |& cat",
  "notices.here-document": "cat <<END",
  "notices.here-string": "cat <<< a",
  "notices.fd-duplication": "ls 2>&1",
  "notices.output-and-error-redirection": "ls &> out.txt",
  "notices.read-write-redirection": "ls <> out.txt",
  "notices.clobber-redirection": "ls >| out.txt",
  "notices.pipeline-negation": "! ls",
  "notices.time-keyword": "time ls",
  "notices.if-clause": "if ls; then ls; fi",
  "notices.while-loop": "while ls; do ls; done",
  "notices.until-loop": "until ls; do ls; done",
  "notices.for-loop": "for name in a b; do ls; done",
  "notices.select-loop": "select name in a b; do ls; done",
  "notices.case-clause": "case a in a) ls;; esac",
  "notices.command-group": "{ ls; }",
  "notices.conditional-command": "[[ -e a ]]",
  "notices.function-definition": "list() { ls; }",
  "notices.coprocess": "coproc ls",
  "notices.array": "names=(a b)",
  "notices.process-id": "echo $$",
  "notices.shell-options": "echo $-",
  "notices.file-descriptor": "ls 3> out.txt",
  "notices.reversed-redirection": "ls 0> out.txt",
  "notices.command-path": "/bin/ls",
};

/** The notice that `input` stops with in the first level. */
function noticeOf(input: string): NoticeEvent {
  const clock = createGameClock(GAME_START_TIME);
  const session = startLevel(levelSetup(content, "first-steps", "en", "max"), clock);
  const result = runInput(session, input, { clock, terminal: { columns: 80 } });
  if (result.kind !== "ran") {
    throw new Error(`The input "${input}" needs another line.`);
  }
  const last = result.terminal.at(-1);
  if (
    last?.kind !== "unsupported" &&
    last?.kind !== "notice" &&
    last?.kind !== "syntax-unsupported"
  ) {
    throw new Error(`The input "${input}" did not stop with a notice.`);
  }
  return last;
}

/** A text as plain text, code included. */
function plain(text: RichText): string {
  return paragraphOf(text, "notice")
    .map((inline) => (inline.type === "text" || inline.type === "code" ? inline.text : ""))
    .join("");
}

describe("noticeKey", () => {
  test("covers every notice text of the catalogs", () => {
    const keys = Object.keys(UI_TEXT_PLACEHOLDERS).filter((key) => key.startsWith("notices."));
    expect(Object.keys(INPUTS).sort()).toEqual(keys.sort());
  });

  test.each(Object.entries(INPUTS))("names %s for the input %j", (key, input) => {
    expect(noticeKey(noticeOf(input))).toBe(key);
  });
});

describe("noticeText", () => {
  test.each(MANDATORY_LANGUAGES)(
    "gives every notice one paragraph of its own in %s",
    (language) => {
      const texts = createTexts(content.uiCatalogs, language);
      const shown = Object.values(INPUTS).map((input) => plain(noticeText(texts, noticeOf(input))));
      expect(new Set(shown).size).toBe(shown.length);
    },
  );

  test("shows the command and its option as code", () => {
    const texts = createTexts(content.uiCatalogs, "en");
    expect(noticeText(texts, noticeOf("ls -Z"))).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "PenguinOps does not simulate the option " },
          { type: "code", text: "-Z" },
          { type: "text", text: " of " },
          { type: "code", text: "ls" },
          { type: "text", text: " yet, so the input stopped here." },
        ],
      },
    ]);
  });

  test("names the variable in German", () => {
    const texts = createTexts(content.uiCatalogs, "de");
    expect(plain(noticeText(texts, noticeOf("HISTTIMEFORMAT=%F history")))).toBe(
      "Die Wirkung der Variablen HISTTIMEFORMAT auf history simuliert PenguinOps noch nicht, " +
        "darum hat die Eingabe hier angehalten.",
    );
  });

  test("names the command as the player wrote it", () => {
    const texts = createTexts(content.uiCatalogs, "en");
    expect(plain(noticeText(texts, noticeOf("c'a't")))).toBe(
      "cat would now wait for you to type something. PenguinOps does not simulate typing into " +
        "a running command yet, so the input stopped here.",
    );
  });

  test("explains a feature of the shell with its syntax", () => {
    const texts = createTexts(content.uiCatalogs, "en");
    expect(plain(noticeText(texts, noticeOf("cat <<< a")))).toBe(
      "PenguinOps does not simulate here strings (<<<) yet, so the input stopped here.",
    );
  });
});
