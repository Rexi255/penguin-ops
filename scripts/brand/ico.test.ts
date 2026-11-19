import { describe, expect, it } from "vitest";

import { decodeIco, encodeIco, IcoError } from "./ico.ts";

/** The start of a PNG file of the given size: enough for the size check of the encoder. */
function pngStub(size: number): Uint8Array {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(size, 16);
  bytes.writeUInt32BE(size, 20);
  bytes.writeUInt8(size % 256, 32); // makes the stubs of different sizes differ
  return bytes;
}

describe("encodeIco", () => {
  it("writes a directory entry per image, sorted by size, and reads it back", () => {
    const images = [256, 16, 48].map((size) => ({ size, png: pngStub(size) }));
    const file = encodeIco(images);

    expect(file.readUInt16LE(0)).toBe(0);
    expect(file.readUInt16LE(2)).toBe(1);
    expect(file.readUInt16LE(4)).toBe(3);
    // 256 px is stored as 0, with 32 bits per pixel and one colour plane.
    expect(file.readUInt8(6 + 2 * 16)).toBe(0);
    expect(file.readUInt16LE(6 + 4)).toBe(1);
    expect(file.readUInt16LE(6 + 6)).toBe(32);
    // The first image starts right after the directory.
    expect(file.readUInt32LE(6 + 12)).toBe(6 + 3 * 16);

    const decoded = decodeIco(file);
    expect(decoded.map((image) => image.size)).toEqual([16, 48, 256]);
    for (const image of decoded) {
      expect(Buffer.from(image.png).equals(Buffer.from(pngStub(image.size)))).toBe(true);
    }
  });

  it("rejects an empty list", () => {
    expect(() => encodeIco([])).toThrow(IcoError);
    expect(() => encodeIco([])).toThrow("An ICO file needs at least one image.");
  });

  it("rejects sizes outside 1 to 256 and sizes that appear twice", () => {
    expect(() => encodeIco([{ size: 512, png: pngStub(512) }])).toThrow(
      "The size 512 is not between 1 and 256.",
    );
    expect(() => encodeIco([{ size: 0, png: pngStub(0) }])).toThrow(
      "The size 0 is not between 1 and 256.",
    );
    expect(() =>
      encodeIco([
        { size: 32, png: pngStub(32) },
        { size: 32, png: pngStub(32) },
      ]),
    ).toThrow("The size 32 appears twice.");
  });

  it("rejects an image whose size does not match its entry", () => {
    expect(() => encodeIco([{ size: 32, png: pngStub(16) }])).toThrow(
      "The image for 32 px is 16 × 16 px.",
    );
  });

  it("rejects images that are not PNG files", () => {
    expect(() => encodeIco([{ size: 16, png: Buffer.from("BM") }])).toThrow(
      "The file is not a PNG file.",
    );
  });
});

describe("decodeIco", () => {
  it("rejects files that are not ICO files", () => {
    expect(() => decodeIco(pngStub(16))).toThrow("The file is not an ICO file.");
  });

  it("rejects a cut-off directory", () => {
    const file = encodeIco([{ size: 16, png: pngStub(16) }]);
    expect(() => decodeIco(file.subarray(0, 10))).toThrow("The ICO directory is cut off.");
  });

  it("rejects images outside the file", () => {
    const file = encodeIco([{ size: 16, png: pngStub(16) }]);
    expect(() => decodeIco(file.subarray(0, file.length - 1))).toThrow(
      "Image 1 lies outside the file.",
    );
  });

  it("rejects images that are not square", () => {
    const file = encodeIco([{ size: 16, png: pngStub(16) }]);
    file.writeUInt8(32, 6 + 1);
    expect(() => decodeIco(file)).toThrow("Image 1 is not square.");
  });
});
