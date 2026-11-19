// Entry point of the styleguide page, loaded by styleguide.html (ADR 0083). The app never imports
// anything from this folder; `styleguide-isolation.test.ts` checks that.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { readCssRules, rootCustomProperties } from "../css-rules";
import "../fonts/fonts.css";
import "../tokens.css";
import tokensCss from "../tokens.css?raw";
import "../styles.css";
import { Styleguide } from "./styleguide";
import "./styleguide.css";
import { readTokenCatalog } from "./token-catalog";

const container = document.getElementById("root");
if (container === null) {
  throw new Error('styleguide.html has no element with the id "root".');
}

createRoot(container).render(
  <StrictMode>
    <Styleguide
      catalog={readTokenCatalog(tokensCss)}
      tokens={rootCustomProperties(readCssRules(tokensCss))}
    />
  </StrictMode>,
);
