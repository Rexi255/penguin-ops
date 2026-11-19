// A small PNG reader for the brand tests (ADR 0089): it reads the size of a PNG file and decodes
// the 8-bit RGB and RGBA images that Chromium's canvas writes, so that the tests can check the
// colours of every pixel without an image library.
import { inflateSync } from "node:zlib";

/** Thrown when a file is not a PNG file or uses a format this reader does not support. */
export class PngError extends Error {
  override name = "PngError";
}

export interface PngSize {
  readonly width: number;
  readonly height: number;
}

export interface DecodedPng extends PngSize {
  /** Four bytes per pixel (red, green, blue, alpha), row by row from the top left. */
  readonly pixels: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG colour types this reader decodes, with their number of channels. */
const CHANNELS: Readonly<Record<number, number>> = { 2: 3, 6: 4 };

interface Header extends PngSize {
  readonly channels: number;
}

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function checkSignature(data: Buffer): void {
  if (data.length < SIGNATURE.length || !data.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
    throw new PngError("The file is not a PNG file.");
  }
}

/** Width and height from the IHDR chunk, which every PNG file has first. */
export function pngSize(bytes: Uint8Array): PngSize {
  const data = toBuffer(bytes);
  checkSignature(data);
  if (data.length < 24 || data.toString("latin1", 12, 16) !== "IHDR") {
    throw new PngError("The PNG file has no IHDR chunk.");
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function readHeader(body: Buffer): Header {
  if (body.length !== 13) {
    throw new PngError("The IHDR chunk has the wrong length.");
  }
  const bitDepth = body.readUInt8(8);
  const colourType = body.readUInt8(9);
  const interlace = body.readUInt8(12);
  const channels = CHANNELS[colourType];
  if (bitDepth !== 8 || channels === undefined || interlace !== 0) {
    throw new PngError("Only 8-bit RGB and RGBA PNG files without interlacing are supported.");
  }
  return { width: body.readUInt32BE(0), height: body.readUInt32BE(4), channels };
}

/** The Paeth predictor of the PNG specification. */
function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }
  return toUp <= toUpLeft ? up : upLeft;
}

/** Reverses the per-row filters and returns the raw samples, row by row. */
function unfilter(raw: Buffer, header: Header): Uint8Array {
  const stride = header.width * header.channels;
  if (raw.length !== header.height * (stride + 1)) {
    throw new PngError("The image data does not match the image size.");
  }
  const samples = new Uint8Array(header.height * stride);
  const sample = (index: number): number => (index < 0 ? 0 : (samples[index] ?? 0));
  for (let row = 0; row < header.height; row += 1) {
    const filter = raw.readUInt8(row * (stride + 1));
    const source = row * (stride + 1) + 1;
    const target = row * stride;
    for (let column = 0; column < stride; column += 1) {
      const value = raw.readUInt8(source + column);
      const hasLeft = column >= header.channels;
      const left = hasLeft ? sample(target + column - header.channels) : 0;
      const up = row > 0 ? sample(target - stride + column) : 0;
      const upLeft = row > 0 && hasLeft ? sample(target - stride + column - header.channels) : 0;
      let predictor: number;
      switch (filter) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = left;
          break;
        case 2:
          predictor = up;
          break;
        case 3:
          predictor = Math.floor((left + up) / 2);
          break;
        case 4:
          predictor = paeth(left, up, upLeft);
          break;
        default:
          throw new PngError(`Row ${String(row)} uses the unknown filter ${String(filter)}.`);
      }
      samples[target + column] = (value + predictor) & 0xff;
    }
  }
  return samples;
}

/** Decodes an 8-bit RGB or RGBA PNG file into RGBA pixels. */
export function decodePng(bytes: Uint8Array): DecodedPng {
  const data = toBuffer(bytes);
  checkSignature(data);
  let header: Header | undefined;
  const imageData: Buffer[] = [];
  let ended = false;
  let offset = SIGNATURE.length;
  while (!ended && offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("latin1", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > data.length) {
      throw new PngError(`The ${type} chunk is cut off.`);
    }
    const body = data.subarray(start, end);
    if (type === "IHDR") {
      header = readHeader(body);
    } else if (type === "IDAT") {
      imageData.push(body);
    } else if (type === "IEND") {
      ended = true;
    }
    offset = end + 4;
  }
  if (header === undefined || imageData.length === 0 || !ended) {
    throw new PngError("The PNG file is incomplete.");
  }
  const samples = unfilter(inflateSync(Buffer.concat(imageData)), header);
  if (header.channels === 4) {
    return { width: header.width, height: header.height, pixels: samples };
  }
  const pixels = new Uint8Array(header.width * header.height * 4);
  for (let pixel = 0; pixel < header.width * header.height; pixel += 1) {
    pixels.set(samples.subarray(pixel * 3, pixel * 3 + 3), pixel * 4);
    pixels[pixel * 4 + 3] = 0xff;
  }
  return { width: header.width, height: header.height, pixels };
}
