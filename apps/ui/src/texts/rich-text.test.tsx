// @vitest-environment jsdom
// Tests of formatted texts of several blocks (ADR 0073): paragraphs, lists and inline markup as
// the UI's own elements, never as HTML.
import { formatText } from "@penguin-ops/content";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { RichTextBlocks } from "./rich-text";

function renderText(source: string) {
  return render(
    <div>
      <RichTextBlocks text={formatText({ language: "en", source })} />
    </div>,
  ).container.firstElementChild;
}

afterEach(() => {
  cleanup();
});

describe("RichTextBlocks", () => {
  test("draws paragraphs and lists in order", () => {
    const element = renderText("Before that:\n- copy `a.conf`\n- move **b**\n\nThanks, Petra");
    expect(element?.innerHTML).toBe(
      "<p>Before that:</p>" +
        "<ul><li>copy <code>a.conf</code></li><li>move <strong>b</strong></li></ul>" +
        "<p>Thanks, Petra</p>",
    );
  });

  test("keeps a line break inside a paragraph", () => {
    expect(renderText("Hi,\nthe printer is out.")?.innerHTML).toBe(
      "<p>Hi,<br>the printer is out.</p>",
    );
  });

  test("draws an empty text as nothing", () => {
    expect(renderText("")?.innerHTML).toBe("");
  });

  test("never reads a text as HTML", () => {
    const element = renderText("<b>not bold</b> and an unpaired ** star");
    expect(element?.querySelector("b")).toBeNull();
    expect(element?.textContent).toBe("<b>not bold</b> and an unpaired ** star");
  });
});
