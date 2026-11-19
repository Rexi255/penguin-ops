// Writes and reads ICO files whose images are stored as PNG (ADR 0089). Windows reads PNG images
// in ICO files since Windows Vista, at every size, so no bitmap encoding is needed.
import { pngSize } from "./png.ts";

/** Thrown when an ICO file cannot be written or read. */
export class IcoError extends Error {
  override name = "IcoError";
}

export interface IcoImage {
  /** Width and height in pixels, 1 to 256. */
  readonly size: number;
  /** The image as a PNG file of exactly that size. */
  readonly png: Uint8Array;
}

const HEADER_LENGTH = 6;
const ENTRY_LENGTH = 16;
const MAX_SIZE = 256;

/** The size byte of a directory entry: 256 pixels are stored as 0. */
function sizeByte(size: number): number {
  return size === MAX_SIZE ? 0 : size;
}

/** Builds an ICO file from PNG images, sorted from the smallest to the largest. */
export function encodeIco(images: readonly IcoImage[]): Buffer {
  if (images.length === 0) {
    throw new IcoError("An ICO file needs at least one image.");
  }
  const sorted = images.toSorted((a, b) => a.size - b.size);
  sorted.forEach((image, index) => {
    if (!Number.isInteger(image.size) || image.size < 1 || image.size > MAX_SIZE) {
      throw new IcoError(
        `The size ${String(image.size)} is not between 1 and ${String(MAX_SIZE)}.`,
      );
    }
    if (index > 0 && sorted[index - 1]?.size === image.size) {
      throw new IcoError(`The size ${String(image.size)} appears twice.`);
    }
    const { width, height } = pngSize(image.png);
    if (width !== image.size || height !== image.size) {
      throw new IcoError(
        `The image for ${String(image.size)} px is ${String(width)} × ${String(height)} px.`,
      );
    }
  });

  const header = Buffer.alloc(HEADER_LENGTH + ENTRY_LENGTH * sorted.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1: icon
  header.writeUInt16LE(sorted.length, 4);
  let offset = header.length;
  sorted.forEach((image, index) => {
    const entry = HEADER_LENGTH + ENTRY_LENGTH * index;
    header.writeUInt8(sizeByte(image.size), entry);
    header.writeUInt8(sizeByte(image.size), entry + 1);
    header.writeUInt8(0, entry + 2); // no palette
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(image.png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.png.length;
  });
  return Buffer.concat([header, ...sorted.map((image) => image.png)]);
}

/** Reads the images of an ICO file in the order of its directory. */
export function decodeIco(bytes: Uint8Array): IcoImage[] {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.length < HEADER_LENGTH || data.readUInt16LE(0) !== 0 || data.readUInt16LE(2) !== 1) {
    throw new IcoError("The file is not an ICO file.");
  }
  const count = data.readUInt16LE(4);
  if (data.length < HEADER_LENGTH + ENTRY_LENGTH * count) {
    throw new IcoError("The ICO directory is cut off.");
  }
  const images: IcoImage[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = HEADER_LENGTH + ENTRY_LENGTH * index;
    const width = data.readUInt8(entry) || MAX_SIZE;
    const height = data.readUInt8(entry + 1) || MAX_SIZE;
    if (width !== height) {
      throw new IcoError(`Image ${String(index + 1)} is not square.`);
    }
    const length = data.readUInt32LE(entry + 8);
    const start = data.readUInt32LE(entry + 12);
    if (start + length > data.length) {
      throw new IcoError(`Image ${String(index + 1)} lies outside the file.`);
    }
    images.push({ size: width, png: data.subarray(start, start + length) });
  }
  return images;
}
