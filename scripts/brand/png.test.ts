import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { decodePng, PngError, pngSize } from "./png.ts";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** One PNG chunk; the reader does not check the CRC, so it is left at zero. */
function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([length, Buffer.from(type, "latin1"), body, Buffer.alloc(4)]);
}

function header(width: number, height: number, colourType: number, bitDepth = 8): Buffer {
  const body = Buffer.alloc(13);
  body.writeUInt32BE(width, 0);
  body.writeUInt32BE(height, 4);
  body.writeUInt8(bitDepth, 8);
  body.writeUInt8(colourType, 9);
  return chunk("IHDR", body);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const distances = [left, up, upLeft].map((value) => Math.abs(estimate - value));
  const [toLeft = 0, toUp = 0, toUpLeft = 0] = distances;
  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }
  return toUp <= toUpLeft ? up : upLeft;
}

/** Applies a PNG filter to every row, as an encoder does. */
function filterRows(rows: readonly number[][], channels: number, filter: number): Buffer {
  const out: number[] = [];
  rows.forEach((row, rowIndex) => {
    const above = rows[rowIndex - 1];
    out.push(filter);
    row.forEach((value, column) => {
      const left = column >= channels ? (row[column - channels] ?? 0) : 0;
      const up = above?.[column] ?? 0;
      const upLeft = column >= channels ? (above?.[column - channels] ?? 0) : 0;
      const predictors = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upLeft)];
      out.push((value - (predictors[filter] ?? 0)) & 0xff);
    });
  });
  return Buffer.from(out);
}

function png(
  width: number,
  rows: readonly number[][],
  colourType: number,
  filter: number,
): Uint8Array {
  const channels = colourType === 6 ? 4 : 3;
  return Buffer.concat([
    SIGNATURE,
    header(width, rows.length, colourType),
    chunk("IDAT", deflateSync(filterRows(rows, channels, filter))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A 3 × 2 RGBA image whose neighbouring values differ, so that every filter has work to do.
const RGBA_ROWS = [
  [10, 20, 30, 255, 200, 100, 50, 128, 0, 0, 0, 0],
  [15, 250, 35, 255, 90, 110, 120, 64, 255, 255, 255, 255],
];

describe("decodePng", () => {
  it.each([0, 1, 2, 3, 4])("reverses filter %i", (filter) => {
    const decoded = decodePng(png(3, RGBA_ROWS, 6, filter));
    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(2);
    expect([...decoded.pixels]).toEqual(RGBA_ROWS.flat());
  });

  it("adds an opaque alpha channel to RGB images", () => {
    const decoded = decodePng(png(2, [[1, 2, 3, 4, 5, 6]], 2, 4));
    expect([...decoded.pixels]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it("joins image data split over several IDAT chunks", () => {
    const data = deflateSync(filterRows(RGBA_ROWS, 4, 0));
    const file = Buffer.concat([
      SIGNATURE,
      header(3, 2, 6),
      chunk("tEXt", Buffer.from("Comment\0ignored", "latin1")),
      chunk("IDAT", data.subarray(0, 5)),
      chunk("IDAT", data.subarray(5)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    expect([...decodePng(file).pixels]).toEqual(RGBA_ROWS.flat());
  });

  it("rejects files that are not PNG files", () => {
    expect(() => decodePng(Buffer.from("<svg/>"))).toThrow(PngError);
    expect(() => decodePng(Buffer.from("<svg/>"))).toThrow("The file is not a PNG file.");
  });

  it("rejects formats it does not decode", () => {
    const palette = Buffer.concat([SIGNATURE, header(1, 1, 3), chunk("IEND", Buffer.alloc(0))]);
    const sixteenBit = Buffer.concat([
      SIGNATURE,
      header(1, 1, 6, 16),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    for (const file of [palette, sixteenBit]) {
      expect(() => decodePng(file)).toThrow(
        "Only 8-bit RGB and RGBA PNG files without interlacing are supported.",
      );
    }
  });

  it("rejects a header of the wrong length", () => {
    const file = Buffer.concat([SIGNATURE, chunk("IHDR", Buffer.alloc(12))]);
    expect(() => decodePng(file)).toThrow("The IHDR chunk has the wrong length.");
  });

  it("rejects incomplete and cut-off files", () => {
    const complete = Buffer.from(png(3, RGBA_ROWS, 6, 0));
    const withoutEnd = complete.subarray(0, complete.length - 12);
    expect(() => decodePng(withoutEnd)).toThrow("The PNG file is incomplete.");
    expect(() => decodePng(complete.subarray(0, complete.length - 14))).toThrow(
      "The IDAT chunk is cut off.",
    );
  });

  it("rejects image data that does not match the size", () => {
    const file = Buffer.concat([
      SIGNATURE,
      header(4, 2, 6),
      chunk("IDAT", deflateSync(filterRows(RGBA_ROWS, 4, 0))),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    expect(() => decodePng(file)).toThrow("The image data does not match the image size.");
  });

  it("rejects an unknown filter", () => {
    const raw = filterRows(RGBA_ROWS, 4, 0);
    raw[0] = 5;
    const file = Buffer.concat([
      SIGNATURE,
      header(3, 2, 6),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    expect(() => decodePng(file)).toThrow("Row 0 uses the unknown filter 5.");
  });
});

describe("pngSize", () => {
  it("reads the size from the header", () => {
    expect(pngSize(png(3, RGBA_ROWS, 6, 0))).toEqual({ width: 3, height: 2 });
  });

  it("rejects files without a header", () => {
    expect(() => pngSize(Buffer.from("not a png"))).toThrow("The file is not a PNG file.");
    expect(() => pngSize(Buffer.concat([SIGNATURE, chunk("IEND", Buffer.alloc(0))]))).toThrow(
      "The PNG file has no IHDR chunk.",
    );
  });
});
