// The text of a game notice in the terminal (ROADMAP M3.6a, ADR 0102): each command notice and
// each shell feature the game does not simulate has a text of its own in the UI catalogs, named
// by its key, so the player learns what stopped the input. The template literal types make the
// compiler check that every feature and every command notice of the engine has a key in
// `UI_TEXT_PLACEHOLDERS`, and the catalog test checks that both catalogs hold it.

import type { RichText } from "@penguin-ops/content";
import type { CommandNotice } from "@penguin-ops/engine";

import type { Texts, UiTextKey } from "../texts/ui-texts";
import type { NoticeEvent } from "./terminal-model";

/** The key of the text that explains `event`. */
export function noticeKey(event: NoticeEvent): UiTextKey {
  switch (event.kind) {
    case "unsupported":
    case "syntax-unsupported":
      return `notices.${event.feature}`;
    case "notice":
      return `notices.${event.notice.key}`;
  }
}

/** The text that explains `event` in the player's language. */
export function noticeText(texts: Texts, event: NoticeEvent): RichText {
  switch (event.kind) {
    case "unsupported":
    case "syntax-unsupported":
      return texts.rich(`notices.${event.feature}`);
    case "notice":
      return commandNoticeText(texts, { code: event.command }, event.notice);
  }
}

/** The text of a command's notice; `command` is the command name as the player wrote it. */
function commandNoticeText(
  texts: Texts,
  command: { readonly code: string },
  notice: CommandNotice,
): RichText {
  switch (notice.key) {
    case "option-not-simulated":
      return texts.rich("notices.option-not-simulated", {
        command,
        option: { code: notice.option },
      });
    case "variable-not-simulated":
      return texts.rich("notices.variable-not-simulated", {
        command,
        variable: { code: notice.variable },
      });
    case "invalid-utf8-not-simulated":
    case "terminal-input-not-simulated":
    case "game-output-not-simulated":
      return texts.rich(`notices.${notice.key}`, { command });
  }
}
