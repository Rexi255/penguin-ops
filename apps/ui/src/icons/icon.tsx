// The game's own icons (ADR 0086), drawn from the SVG files in this folder (ADR 0087). Vite
// bundles the files as text; they are read once when the module loads, so a broken file stops
// the app at start instead of showing a wrong icon.
import { ICON_SVG_ATTRIBUTES, parseIconSvg, type IconShape } from "./icon-svg";

/** Every icon, in the order the styleguide shows them. Each has a file `<name>.svg`. */
export const ICON_NAMES = [
  "ticket",
  "mail",
  "handbook",
  "incident",
  "hint",
  "solved",
  "settings",
  "terminal",
  "network-map",
  "server",
  "user",
  "lock",
  "folder",
  "close",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const ICON_FILES = import.meta.glob<string>("./*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Reads the icon files, keyed by their path relative to this folder (`./ticket.svg`). Every name
 * in ICON_NAMES needs a file, and every file needs a name.
 */
export function readIcons(
  files: Readonly<Record<string, string>>,
): ReadonlyMap<IconName, readonly IconShape[]> {
  const icons = new Map<IconName, readonly IconShape[]>();
  for (const name of ICON_NAMES) {
    const source = files[`./${name}.svg`];
    if (source === undefined) {
      throw new Error(`The icon "${name}" has no file ${name}.svg.`);
    }
    try {
      icons.set(name, parseIconSvg(source).shapes);
    } catch (error) {
      throw new Error(`${name}.svg: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }
  const unnamed = Object.keys(files).filter(
    (file) => !ICON_NAMES.some((name) => file === `./${name}.svg`),
  );
  if (unnamed.length > 0) {
    throw new Error(`The icon files ${unnamed.join(", ")} are not in ICON_NAMES.`);
  }
  return icons;
}

const ICONS = readIcons(ICON_FILES);

function Shape({ shape }: { readonly shape: IconShape }) {
  switch (shape.kind) {
    case "path":
      return <path d={shape.data} strokeLinecap={shape.buttCaps ? "butt" : undefined} />;
    case "circle":
      return <circle cx={shape.centerX} cy={shape.centerY} r={shape.radius} />;
  }
}

export interface IconProps {
  readonly name: IconName;
  /** More classes, for example a cable colour where the icon marks a kind of work or a state. */
  readonly className?: string;
}

/**
 * An icon, one cell in size, in the colour of its text. It is hidden from screen readers: it
 * always stands next to a visible label, or its control has an accessible name (the Labelled
 * Icon Rule of DESIGN.md).
 */
export function Icon({ name, className }: IconProps) {
  const shapes = ICONS.get(name);
  if (shapes === undefined) {
    throw new Error(`There is no icon "${name}".`);
  }
  return (
    <svg
      className={className === undefined ? "icon" : `icon ${className}`}
      viewBox={ICON_SVG_ATTRIBUTES.viewBox}
      fill={ICON_SVG_ATTRIBUTES.fill}
      stroke={ICON_SVG_ATTRIBUTES.stroke}
      strokeWidth={ICON_SVG_ATTRIBUTES["stroke-width"]}
      strokeLinecap={ICON_SVG_ATTRIBUTES["stroke-linecap"]}
      strokeLinejoin={ICON_SVG_ATTRIBUTES["stroke-linejoin"]}
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map((shape, index) => (
        // The shapes of an icon never change order, so their index is a stable key.
        <Shape key={index} shape={shape} />
      ))}
    </svg>
  );
}
