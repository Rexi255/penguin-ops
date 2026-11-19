// The styleguide page (ROADMAP M3.0c, ADR 0083): every design token of tokens.css, rendered with
// the real stylesheets. It is a page for the people who build the game, so its texts are English
// and not translated. It is never part of the packaged app; `npm run styleguide` serves it.
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { checkContrast, CONTRAST_PAIRS, type ContrastResult } from "../token-contrast";
import type { CatalogSection, Token, TokenCatalog, TokenKind } from "./token-catalog";

export interface StyleguideProps {
  readonly catalog: TokenCatalog;
  /** The token values by name, for the contrast table. */
  readonly tokens: ReadonlyMap<string, string>;
}

function tokenVar(name: string): string {
  return `var(${name})`;
}

/** Shows the rendered length of a CSS length token in pixels, measured in the page. */
function MeasuredLength({
  name,
  axis,
}: {
  readonly name: string;
  readonly axis: "inline" | "block";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pixels, setPixels] = useState("");
  useLayoutEffect(() => {
    const element = ref.current;
    if (element !== null) {
      const box = element.getBoundingClientRect();
      const size = axis === "inline" ? box.width : box.height;
      // Layout rounds to fractions of a pixel, so one decimal is exact enough.
      setPixels(`${String(Math.round(size * 10) / 10)} px`);
    }
  }, [axis]);
  const style: CSSProperties =
    axis === "inline" ? { inlineSize: tokenVar(name) } : { blockSize: tokenVar(name) };
  return (
    <span className="sg-measure">
      <span ref={ref} className={`sg-measure__bar sg-measure__bar--${axis}`} style={style} />
      <span className="sg-measure__pixels">{pixels}</span>
    </span>
  );
}

function TapeDemo() {
  // A new key restarts the print animation, as when a new strip comes out of the label maker.
  const [printCount, setPrintCount] = useState(0);
  return (
    <div className="sg-motion-demo">
      <span key={printCount} className="sg-tape sg-tape--printing">
        PenguinOps
      </span>
      <button
        type="button"
        className="sg-button"
        onClick={() => {
          setPrintCount((count) => count + 1);
        }}
      >
        Print again
      </button>
    </div>
  );
}

/** A sample of a font family token in the role it is made for. */
function FontSample({ token }: { readonly token: Token }) {
  const style: CSSProperties = { fontFamily: tokenVar(token.name) };
  switch (token.name) {
    case "--font-tape":
      // German words with umlauts, because the tape face has to keep them short (ADR 0084).
      return (
        <span className="sg-tape-row">
          <span className="sg-tape">Posteingang</span>
          <span className="sg-tape">Beförderung!</span>
          <span className="sg-tape">Übergabe</span>
        </span>
      );
    case "--font-mono":
      // Bold output (a directory in ls), box drawing for tree, confusable characters, and pairs
      // that would be ligatures.
      return (
        <pre className="sg-font sg-font--mono" style={style}>
          {"~$ ls\n"}
          <b className="sg-font__strong">docs</b>
          {"  notes.txt\n~$ tree /etc\n├── hosts\n└── passwd\n0O o 1lI| -> != <="}
        </pre>
      );
    default:
      return (
        <span className="sg-font" style={style}>
          {"Ticket solved. Größe, Übergabe, 1\u00a0234\u00a0XP"}
        </span>
      );
  }
}

const TYPE_PREFIX = "--text-";
const SIZE_SUFFIX = "-size";
const LEADING_SUFFIX = "-leading";

/** The texts that show each role of the type scale. */
const TYPE_SAMPLES: Readonly<Record<string, string>> = {
  hint: "Tab completes · F1 Help",
  tape: "Ticket 1042",
  body: "The printer on the second floor is out of toner again.",
  terminal: "~$ ls /var/log",
  heading: "Printer offline",
  title: "Inbox",
  display: "PenguinOps",
};

/**
 * A sample of a size token of the type scale, set with its role's line height, face and weight:
 * tape in the tape face, the terminal in the monospace face, everything else in the UI face.
 */
function TypeSample({ token }: { readonly token: Token }) {
  const role = token.name.slice(TYPE_PREFIX.length, -SIZE_SUFFIX.length);
  const style: CSSProperties = {
    fontSize: tokenVar(token.name),
    lineHeight: tokenVar(`${TYPE_PREFIX}${role}${LEADING_SUFFIX}`),
  };
  const text = TYPE_SAMPLES[role] ?? role;
  switch (role) {
    case "tape":
      return (
        <span className="sg-tape" style={style}>
          {text}
        </span>
      );
    case "terminal":
      return (
        <code className="sg-type sg-type--terminal" style={style}>
          {text}
        </code>
      );
    case "heading":
    case "title":
    case "display":
      return (
        <span className="sg-type sg-type--heading" style={style}>
          {text}
        </span>
      );
    default:
      return (
        <span className="sg-type" style={style}>
          {text}
        </span>
      );
  }
}

/** The sample that shows one token of a section. */
function TokenSample({ kind, token }: { readonly kind: TokenKind; readonly token: Token }) {
  const value = tokenVar(token.name);
  switch (kind) {
    case "color":
      return <span className="sg-swatch" style={{ backgroundColor: value }} />;
    case "cell":
      return (
        <MeasuredLength
          name={token.name}
          axis={token.name.endsWith("inline") ? "inline" : "block"}
        />
      );
    case "space":
      return <MeasuredLength name={token.name} axis="inline" />;
    case "radius":
      return <span className="sg-shape" style={{ borderRadius: value }} />;
    case "line":
      return <span className="sg-line" style={{ blockSize: value }} />;
    case "shadow":
      return <span className="sg-floating" style={{ boxShadow: value }} />;
    case "motion":
      return null;
    case "font":
      return <FontSample token={token} />;
    case "weight":
      return (
        <span className="sg-weight" style={{ fontWeight: value }}>
          Ticket solved
        </span>
      );
    case "type":
      return token.name.endsWith(LEADING_SUFFIX) ? (
        <MeasuredLength name={token.name} axis="block" />
      ) : (
        <TypeSample token={token} />
      );
  }
}

/** One token; without a kind (an unsorted token) it has no sample. */
function TokenRow({ kind, token }: { readonly kind?: TokenKind; readonly token: Token }) {
  return (
    <li className="sg-token" data-token={token.name}>
      <div className="sg-token__sample">
        {kind === undefined ? null : <TokenSample kind={kind} token={token} />}
      </div>
      <div className="sg-token__text">
        <code className="sg-token__name">{token.name}</code>
        <code className="sg-token__value">{token.value}</code>
        {token.note === "" ? null : <p className="sg-token__note">{token.note}</p>}
      </div>
    </li>
  );
}

const SECTION_INTROS: Readonly<Record<TokenKind, string>> = {
  color:
    "Semantic colours of the default dark scheme. Names say what a colour is for; the colour " +
    "schemes only change the values.",
  cell:
    "The character cell of the terminal. Every size and gap snaps to it. The grid below shows " +
    "terminal text on cells of this size.",
  space: "Quarter steps of the cell height, so that gaps line up with the terminal lines.",
  radius: "Nearly square corners on panels, rows, buttons and keys.",
  line: "Hairline dividers, the cable run on tabs and the keyboard focus ring.",
  shadow: "Only floating elements that cover content get a shadow.",
  motion:
    "The tape strip printing out is the only thing that moves on its own. State changes answer " +
    "quickly. With reduce motion on, both durations are 0 ms.",
  font:
    "The three bundled faces, each for one role: Inter for the interface, JetBrains Mono for " +
    "the terminal and real code, always without ligatures, Barlow Condensed for tape, in caps.",
  weight:
    "Inter has every weight; JetBrains Mono ships regular and bold, Barlow Condensed only bold.",
  type:
    "One size and line height per role. Every line height is a whole number of quarter cells, " +
    "so text lines up with the terminal lines.",
};

function CellGrid() {
  return (
    // Focusable and named, because it scrolls sideways on a narrow window.
    <div
      className="sg-cell-grid"
      role="region"
      aria-label="Terminal text on the character cell grid"
      tabIndex={0}
    >
      <span className="sg-cell-grid__prompt">player@itdesk:~$</span> ls /etc
      <br />
      hostname hosts passwd
    </div>
  );
}

function FocusDemo() {
  return (
    <div className="sg-focus-demo">
      <button type="button" className="sg-button">
        Focus me with Tab
      </button>
    </div>
  );
}

function TokenSectionView({ entry }: { readonly entry: CatalogSection }) {
  const { section, tokens } = entry;
  const headingId = `sg-heading-${section.id}`;
  return (
    <section className="sg-section" aria-labelledby={headingId} data-section={section.id}>
      <h2 id={headingId} className="sg-section__title">
        {section.title}
      </h2>
      <p className="sg-section__intro">{SECTION_INTROS[section.kind]}</p>
      {section.kind === "cell" ? <CellGrid /> : null}
      {section.kind === "motion" ? <TapeDemo /> : null}
      {section.kind === "line" ? <FocusDemo /> : null}
      <ul className="sg-tokens">
        {tokens.map((token) => (
          <TokenRow key={token.name} kind={section.kind} token={token} />
        ))}
      </ul>
    </section>
  );
}

function ContrastRow({ result }: { readonly result: ContrastResult }) {
  const { pair, ratio, minimum, passes } = result;
  const sampleStyle: CSSProperties = { backgroundColor: tokenVar(pair.background) };
  const sample =
    pair.use === "text" ? (
      <span
        className="sg-contrast__text"
        style={{ ...sampleStyle, color: tokenVar(pair.foreground) }}
      >
        Aa Text
      </span>
    ) : (
      <span className="sg-contrast__ring-box" style={sampleStyle}>
        <span className="sg-contrast__ring" style={{ outlineColor: tokenVar(pair.foreground) }} />
      </span>
    );
  return (
    <tr>
      <td>{sample}</td>
      <td>
        <code>{pair.foreground}</code>
      </td>
      <td>
        <code>{pair.background}</code>
      </td>
      <td className="sg-number">{ratio.toFixed(2)}:1</td>
      <td className="sg-number">{String(minimum)}:1</td>
      <td>{passes ? "Passes" : "Fails"}</td>
    </tr>
  );
}

function ContrastSection({ tokens }: { readonly tokens: ReadonlyMap<string, string> }) {
  const results = checkContrast(tokens, CONTRAST_PAIRS);
  return (
    <section className="sg-section" aria-labelledby="sg-heading-contrast" data-section="contrast">
      <h2 id="sg-heading-contrast" className="sg-section__title">
        Contrast pairs
      </h2>
      <p className="sg-section__intro">
        Every text and background pair must meet WCAG AA: 4.5:1 for text, 3:1 for the focus ring.
        The design token test checks the same pairs.
      </p>
      <div className="sg-table-scroll" role="region" aria-label="Contrast pairs table" tabIndex={0}>
        <table className="sg-table">
          <thead>
            <tr>
              <th scope="col">Sample</th>
              <th scope="col">Foreground</th>
              <th scope="col">Background</th>
              <th scope="col">Ratio</th>
              <th scope="col">Needs</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <ContrastRow
                key={`${result.pair.foreground} on ${result.pair.background}`}
                result={result}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Styleguide({ catalog, tokens }: StyleguideProps) {
  return (
    <>
      <header className="sg-header">
        <h1 className="sg-header__title">
          <span className="sg-tape">PenguinOps</span> Styleguide
        </h1>
        <p className="sg-header__lead">
          The design tokens of the visual world “Label Tape &amp; Patch Cable”, read from
          apps/ui/src/tokens.css and drawn with the game’s own stylesheets.
        </p>
        <nav aria-label="Sections">
          <ul className="sg-nav">
            {catalog.sections.map(({ section }) => (
              <li key={section.id}>
                <a href={`#sg-heading-${section.id}`}>{section.title}</a>
              </li>
            ))}
            <li>
              <a href="#sg-heading-contrast">Contrast pairs</a>
            </li>
          </ul>
        </nav>
      </header>
      <main className="sg-main">
        {catalog.sections.map((entry) => (
          <TokenSectionView key={entry.section.id} entry={entry} />
        ))}
        <ContrastSection tokens={tokens} />
        {catalog.unsorted.length === 0 ? null : (
          <section className="sg-section" aria-labelledby="sg-heading-unsorted">
            <h2 id="sg-heading-unsorted" className="sg-section__title">
              Unsorted tokens
            </h2>
            <p className="sg-section__intro">
              These tokens fit no section yet. Add their prefix to TOKEN_SECTIONS.
            </p>
            <ul className="sg-tokens">
              {catalog.unsorted.map((token) => (
                <TokenRow key={token.name} token={token} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
