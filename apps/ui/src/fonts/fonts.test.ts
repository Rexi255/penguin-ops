// Guards the bundled fonts of ADR 0085: every face in fonts.css points to a WOFF2 file in this
// folder, every file has a face and a license, THIRD-PARTY-LICENSES.md lists every family, and
// the font tokens name the bundled families first with the weights their roles need.
import { describe, expect, test } from "vitest";

import thirdPartyLicenses from "../../../../THIRD-PARTY-LICENSES.md?raw";
import { readCssRules, rootCustomProperties } from "../css-rules";
import tokensCss from "../tokens.css?raw";
import fontsCss from "./fonts.css?raw";

// Binary files read as text: enough to check the four bytes of the WOFF2 signature.
const fontFiles = import.meta.glob<string>("./**/*.woff2", {
  query: "?raw",
  import: "default",
  eager: true,
});
const licenseFiles = import.meta.glob<string>("./*/ofl.txt", {
  query: "?raw",
  import: "default",
  eager: true,
});
const allFiles = import.meta.glob("./**/*", { query: "?url", import: "default", eager: true });

/** An @font-face rule of fonts.css. */
interface FontFace {
  readonly family: string;
  /** The file, relative to this folder, for example `./inter/inter-variable.woff2`. */
  readonly file: string;
  readonly minWeight: number;
  readonly maxWeight: number;
  readonly descriptors: ReadonlyMap<string, string>;
}

const SOURCE = /^url\("(\.\/[a-z0-9-]+\/[a-z0-9-]+\.woff2)"\) format\("woff2"\)$/;

function readFaces(css: string): FontFace[] {
  return readCssRules(css)
    .filter((rule) => rule.selector === "@font-face")
    .map((rule) => {
      const descriptors = rule.declarations;
      const family = /^"([^"]+)"$/.exec(descriptors.get("font-family") ?? "")?.[1] ?? "";
      const file = SOURCE.exec(descriptors.get("src") ?? "")?.[1] ?? "";
      const weights = (descriptors.get("font-weight") ?? "").split(" ").map(Number);
      return {
        family,
        file,
        minWeight: weights[0] ?? Number.NaN,
        maxWeight: weights[1] ?? weights[0] ?? Number.NaN,
        descriptors,
      };
    });
}

/** The first family of a font stack, without its quotes. */
function firstFamily(stack: string): string {
  return /^"([^"]+)"/.exec(stack)?.[1] ?? "";
}

/** The folder of a font file, for example `inter` for `./inter/inter-variable.woff2`. */
function folderOf(file: string): string {
  return file.split("/")[1] ?? "";
}

const faces = readFaces(fontsCss);
const tokens = rootCustomProperties(readCssRules(tokensCss));

function token(name: string): string {
  const value = tokens.get(name);
  if (value === undefined) {
    throw new Error(`tokens.css has no ${name}.`);
  }
  return value;
}

/** The bundled family each font token names first, and the weight tokens its role uses. */
const FONT_ROLES = [
  {
    token: "--font-ui",
    family: "Inter",
    weights: ["--font-weight-body", "--font-weight-control", "--font-weight-heading"],
  },
  {
    token: "--font-mono",
    family: "JetBrains Mono",
    weights: ["--font-weight-body", "--font-weight-strong"],
  },
  { token: "--font-tape", family: "Barlow Condensed", weights: ["--font-weight-strong"] },
] as const;

describe("the font faces", () => {
  test("exist", () => {
    expect(faces.length).toBeGreaterThan(0);
  });

  test("each name a family and a single WOFF2 file in a folder of their own", () => {
    for (const face of faces) {
      expect(face.family, `font-family of ${face.descriptors.get("src") ?? ""}`).not.toBe("");
      expect(face.file, `src of ${face.family}`).not.toBe("");
    }
  });

  test("point to files that exist", () => {
    const missing = faces.map((face) => face.file).filter((file) => !(file in fontFiles));
    expect(missing).toEqual([]);
  });

  test("use every bundled file exactly once", () => {
    const used = faces.map((face) => face.file).toSorted();
    expect(used).toEqual(Object.keys(fontFiles).toSorted());
  });

  test("have a weight or a weight range, an upright style and block display", () => {
    for (const face of faces) {
      expect(Number.isInteger(face.minWeight), face.file).toBe(true);
      expect(Number.isInteger(face.maxWeight), face.file).toBe(true);
      expect(face.minWeight, face.file).toBeLessThanOrEqual(face.maxWeight);
      expect(face.descriptors.get("font-style"), face.file).toBe("normal");
      expect(face.descriptors.get("font-display"), face.file).toBe("block");
    }
  });

  test("keep the files of one family in one folder", () => {
    const folders = new Map<string, Set<string>>();
    for (const face of faces) {
      folders.set(face.family, (folders.get(face.family) ?? new Set()).add(folderOf(face.file)));
    }
    for (const [family, set] of folders) {
      expect([...set], family).toHaveLength(1);
    }
  });
});

describe("the font files", () => {
  test.each(Object.entries(fontFiles))("%s is a WOFF2 file", (_file, content) => {
    expect(content.slice(0, 4)).toBe("wOF2");
  });

  test("are only WOFF2 files and their license texts", () => {
    const others = Object.keys(allFiles).filter(
      (file) =>
        !(file in fontFiles) &&
        !(file in licenseFiles) &&
        file !== "./fonts.css" &&
        file !== "./fonts.test.ts",
    );
    expect(others).toEqual([]);
  });
});

describe("the font licenses", () => {
  const folders = [...new Set(faces.map((face) => folderOf(face.file)))];

  test.each(folders)("%s has the SIL Open Font License 1.1 with its copyright", (folder) => {
    const license = licenseFiles[`./${folder}/ofl.txt`] ?? "";
    expect(license).toMatch(/^Copyright .+/);
    expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007");
  });

  test.each([...new Set(faces.map((face) => face.family))])(
    "%s is listed in THIRD-PARTY-LICENSES.md",
    (family) => {
      const folder = folderOf(faces.find((face) => face.family === family)?.file ?? "");
      const row = thirdPartyLicenses
        .split("\n")
        .find((line) => line.startsWith(`| ${family} `) && line.includes("| Font |"));
      expect(row, `a Font row for ${family}`).toBeDefined();
      expect(row).toContain("| OFL-1.1 |");
      expect(row).toContain(`apps/ui/src/fonts/${folder}/`);
    },
  );
});

describe("the font tokens", () => {
  test.each(FONT_ROLES)("$token names the bundled $family first", ({ token: name, family }) => {
    expect(firstFamily(token(name))).toBe(family);
    expect(faces.some((face) => face.family === family)).toBe(true);
  });

  test("cover every bundled family", () => {
    const named = FONT_ROLES.map((role) => role.family).toSorted();
    expect([...new Set(faces.map((face) => face.family))].toSorted()).toEqual(named);
  });

  test.each(FONT_ROLES)(
    "$family has a face for every weight of its role",
    ({ family, weights }) => {
      for (const weightToken of weights) {
        const weight = Number(token(weightToken));
        const face = faces.find(
          (candidate) =>
            candidate.family === family &&
            candidate.minWeight <= weight &&
            weight <= candidate.maxWeight,
        );
        expect(face, `${family} at ${weightToken} (${String(weight)})`).toBeDefined();
      }
    },
  );
});
