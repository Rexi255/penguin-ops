// Placeholder screen until the real start screen exists (ROADMAP M0.7). It shows only the
// product name and the version, which are not translated.
import type { AppInfo } from "./desktop-api";

export interface AppProps {
  readonly info: AppInfo;
}

export function App({ info }: AppProps) {
  return (
    <main className="placeholder">
      <h1 className="placeholder__title">{info.name}</h1>
      <p className="placeholder__version" data-testid="app-version">
        {info.version}
      </p>
    </main>
  );
}
