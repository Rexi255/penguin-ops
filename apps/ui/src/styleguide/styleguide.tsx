// The styleguide page (ROADMAP M3.0c, ADR 0083): every design token of tokens.css, rendered with
// the real stylesheets, and the game's icons (ADR 0087). A switch shows the page in every colour
// scheme (ADR 0111). It is a page for the people who build the game, so its texts are English and
// not translated. It is never part of the packaged app; `npm run styleguide` serves it.
import { COLOR_SCHEMES, type ColorScheme } from "@penguin-ops/gameplay";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

// The logo files of the brand package (ADR 0088). `no-inline` keeps Vite from turning the small
// signet into a data URL, so every image is the file itself.
import logoHorizontalDark from "../../../../assets/brand/svg/logo-horizontal-dark.svg?no-inline";
import logoHorizontalLight from "../../../../assets/brand/svg/logo-horizontal-light.svg?no-inline";
import logoSignet from "../../../../assets/brand/svg/logo-signet.svg?no-inline";
import { Icon, ICON_NAMES, type IconName } from "../icons/icon";
import {
  checkContrast,
  contrastMinimums,
  contrastPairs,
  type ContrastResult,
  schemeTokens,
} from "../token-contrast";
import { catalogTokens, type CatalogSection, type Token, type TokenKind } from "./token-catalog";

export interface StyleguideProps {
  /** The default token values by name, from the `:root` rule of tokens.css. */
  readonly defaults: ReadonlyMap<string, string>;
  /** The colour values of every colour scheme but the default, by the scheme's name. */
  readonly schemes: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** The note next to every token in tokens.css, by token name. */
  readonly notes: ReadonlyMap<string, string>;
}

/** The names of the colour schemes on this English-only page. */
const SCHEME_NAMES: Readonly<Record<ColorScheme, string>> = {
  default: "Default",
  "retro-crt": "Retro CRT",
  solarized: "Solarized",
  "high-contrast": "High contrast",
};

/** The radio buttons that choose the page's colour scheme. */
function SchemeSwitch({
  scheme,
  onChange,
}: {
  readonly scheme: ColorScheme;
  readonly onChange: (scheme: ColorScheme) => void;
}) {
  return (
    <fieldset className="settings__group sg-schemes">
      <legend className="sg-schemes__legend">Colour scheme</legend>
      <div className="choices sg-schemes__choices">
        {COLOR_SCHEMES.map((candidate) => (
          <label key={candidate} className="choice">
            <input
              className="choice__input visually-hidden"
              type="radio"
              name="sg-color-scheme"
              value={candidate}
              checked={scheme === candidate}
              onChange={() => {
                onChange(candidate);
              }}
            />
            <span className="choice__marker" aria-hidden="true" />
            {SCHEME_NAMES[candidate]}
          </label>
        ))}
      </div>
    </fieldset>
  );
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

/** The tabs of the side panel (ADR 0020), as the first screen will label them. */
const PANEL_TABS: readonly { readonly icon: IconName; readonly label: string }[] = [
  { icon: "ticket", label: "Tickets" },
  { icon: "mail", label: "Mail" },
  { icon: "handbook", label: "Handbook" },
];

/** Icons in a cable colour, where they mark a kind of work or a state (the Icon Colour Rule). */
const CABLE_ICONS: readonly {
  readonly icon: IconName;
  readonly label: string;
  readonly cable: string;
}[] = [
  { icon: "ticket", label: "Ticket", cable: "ticket" },
  { icon: "mail", label: "Mail", cable: "mail" },
  { icon: "solved", label: "Solved", cable: "handbook" },
  { icon: "incident", label: "Incident", cable: "incident" },
];

function IconSection() {
  return (
    <section className="sg-section" aria-labelledby="sg-heading-icons" data-section="icons">
      <h2 id="sg-heading-icons" className="sg-section__title">
        Icons
      </h2>
      <p className="sg-section__intro">
        The game’s own outline icons from apps/ui/src/icons (ADR 0086): one cell in size, a 2 px
        stroke in the colour of the text, square caps and miter joins on whole pixels. An icon never
        stands alone; it sits next to its label.
      </p>
      <ul className="sg-icon-tabs" aria-label="Side panel tabs">
        {PANEL_TABS.map(({ icon, label }) => (
          <li key={icon} className="sg-icon-tabs__tab">
            <Icon name={icon} />
            {label}
          </li>
        ))}
      </ul>
      <ul className="sg-icon-cables" aria-label="Icons in cable colours">
        {CABLE_ICONS.map(({ icon, label, cable }) => (
          <li key={icon} className="sg-icon-cables__item" data-cable={cable}>
            <Icon name={icon} className={`sg-icon--cable-${cable}`} />
            {label}
          </li>
        ))}
      </ul>
      <ul className="sg-icons">
        {ICON_NAMES.map((name) => (
          <li key={name} className="sg-icon" data-icon={name}>
            <span className="sg-icon__actual">
              <Icon name={name} />
            </span>
            {/* Three times larger on a grid of the icon's 24 units, to check the drawing. */}
            <span className="sg-icon__enlarged">
              <Icon name={name} />
            </span>
            <code className="sg-icon__name">{name}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The surfaces the logo is shown on: the four dark surfaces and the white tape as a light one. */
const LOGO_SURFACES: readonly { readonly token: string; readonly logo: string }[] = [
  { token: "--color-surface-terminal", logo: logoHorizontalDark },
  { token: "--color-surface-ground", logo: logoHorizontalDark },
  { token: "--color-surface-panel", logo: logoHorizontalDark },
  { token: "--color-surface-raised", logo: logoHorizontalDark },
  { token: "--color-tape-secondary", logo: logoHorizontalLight },
];

/** Signet sizes in pixels: the small app icon sizes and the size of a large side panel icon. */
const SIGNET_SIZES = [16, 24, 32, 48, 64] as const;

function LogoSection() {
  return (
    <section className="sg-section" aria-labelledby="sg-heading-logo" data-section="logo">
      <h2 id="sg-heading-logo" className="sg-section__title">
        Logo
      </h2>
      <p className="sg-section__intro">
        The logo from assets/brand (ADR 0040) in the colours of ADR 0088: black is surface-terminal,
        white is text and the prompt is player. The values are copied into the files, so the logo
        does not follow the colour schemes.
      </p>
      <ul className="sg-logos">
        {LOGO_SURFACES.map(({ token, logo }) => (
          <li key={token} className="sg-logo" data-surface={token}>
            {/* Only the stage has the surface colour; the label stays on the page ground, so that
                it keeps its contrast on the light tape. */}
            <span className="sg-logo__stage" style={{ backgroundColor: tokenVar(token) }}>
              <img className="sg-logo__horizontal" src={logo} alt="PenguinOps" />
            </span>
            <code className="sg-logo__surface">{token}</code>
          </li>
        ))}
      </ul>
      <ul className="sg-signets" aria-label="Signet sizes">
        {SIGNET_SIZES.map((size) => (
          <li key={size} className="sg-signet" data-size={size}>
            <img src={logoSignet} alt="PenguinOps" width={size} height={size} />
            <code className="sg-signet__size">{`${String(size)} px`}</code>
          </li>
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

function ContrastSection({
  tokens,
  scheme,
}: {
  readonly tokens: ReadonlyMap<string, string>;
  readonly scheme: ColorScheme;
}) {
  const results = checkContrast(tokens, contrastPairs(scheme), contrastMinimums(scheme));
  return (
    <section className="sg-section" aria-labelledby="sg-heading-contrast" data-section="contrast">
      <h2 id="sg-heading-contrast" className="sg-section__title">
        Contrast pairs
      </h2>
      <p className="sg-section__intro">
        Every text and background pair must meet WCAG AA in every colour scheme: 4.5:1 for text, 3:1
        for the focus ring. The high contrast scheme needs 7:1 for text and visible dividers. The
        design token test checks the same pairs. These are the pairs of the {SCHEME_NAMES[scheme]}{" "}
        scheme.
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

export function Styleguide({ defaults, schemes, notes }: StyleguideProps) {
  const [scheme, setScheme] = useState<ColorScheme>("default");
  // The page's colour scheme is the root's attribute, as in the game (ADR 0111).
  useLayoutEffect(() => {
    document.documentElement.dataset["colorScheme"] = scheme;
  }, [scheme]);
  const tokens = schemeTokens(defaults, schemes, scheme);
  const catalog = catalogTokens(tokens, notes);
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
              <a href="#sg-heading-icons">Icons</a>
            </li>
            <li>
              <a href="#sg-heading-logo">Logo</a>
            </li>
            <li>
              <a href="#sg-heading-contrast">Contrast pairs</a>
            </li>
          </ul>
        </nav>
        <SchemeSwitch scheme={scheme} onChange={setScheme} />
      </header>
      <main className="sg-main">
        {catalog.sections.map((entry) => (
          <TokenSectionView key={entry.section.id} entry={entry} />
        ))}
        <IconSection />
        <LogoSection />
        <ContrastSection tokens={tokens} scheme={scheme} />
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
