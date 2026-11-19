// Entry point of the renderer, loaded by index.html.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { getDesktopApi } from "./desktop-bridge";
import "./tokens.css";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error('index.html has no element with the id "root".');
}

const info = await getDesktopApi().getAppInfo();

createRoot(container).render(
  <StrictMode>
    <App info={info} />
  </StrictMode>,
);
