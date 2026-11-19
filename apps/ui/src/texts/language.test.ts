import { describe, expect, test } from "vitest";

import { languageForLocale } from "./language";

describe("languageForLocale", () => {
  test.each(["de", "de-DE", "de-AT", "de-CH", "DE-de"])("gives German for %s", (locale) => {
    expect(languageForLocale(locale)).toBe("de");
  });

  test.each(["en", "en-US", "en-GB", "fr-FR", "pt-BR", "dev", "", "nl-DE"])(
    "gives English for %j",
    (locale) => {
      expect(languageForLocale(locale)).toBe("en");
    },
  );
});
