// Entry point of the styleguide page, loaded by styleguide.html (ADR 0083). The app never imports
// anything from this folder; `styleguide-isolation.test.ts` checks that.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { colorSchemeCustomProperties, readCssRules, rootCustomProperties } from "../css-rules";
import "../fonts/fonts.css";
import "../tokens.css";
import tokensCss from "../tokens.css?raw";
import "../styles.css";
import { Styleguide } from "./styleguide";
import "./styleguide.css";
import { readTokenNotes } from "./token-catalog";

const tokenRules = readCssRules(tokensCss);

const container = document.getElementById("root");
if (container === null) {
  throw new Error('styleguide.html has no element with the id "root".');
}

createRoot(container).render(
  <StrictMode>
    <Styleguide
      defaults={rootCustomProperties(tokenRules)}
      schemes={colorSchemeCustomProperties(tokenRules)}
      notes={readTokenNotes(tokensCss)}
    />
  </StrictMode>,
);
