// Command-line entry of `npm run brand:rasters` (ADR 0089): draws every raster brand file of
// raster-plan.ts from its logo SVG in Playwright's Chromium and writes it. Run it after a change
// to a colour SVG in assets/brand/svg/ and commit the SVGs and the raster files together.
//
// Chromium has to be installed once with `npx playwright install chromium`. A machine that cannot
// download it sets STYLEGUIDE_CHROMIUM_PATH to an installed Chromium, like the styleguide tests.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Page } from "@playwright/test";

import { encodeIco } from "./brand/ico.ts";
import {
  placement,
  RASTER_FILES,
  readViewBox,
  type Box,
  type RasterImage,
} from "./brand/raster-plan.ts";

const root = join(import.meta.dirname, "..");
const brand = join(root, "assets", "brand");

interface RenderRequest {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly background: string | null;
  readonly box: Box;
}

/**
 * Runs in the page, so it may only use its argument. The SVG gets the drawn size as its width and
 * height, so that Chromium rasterises the vector shapes at that size instead of scaling a bitmap.
 */
async function renderInPage({ svg, width, height, background, box }: RenderRequest) {
  const sized = svg.replace(
    "<svg ",
    `<svg width="${String(box.width)}" height="${String(box.height)}" `,
  );
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("The canvas has no 2D context.");
  }
  if (background !== null) {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, box.x, box.y, box.width, box.height);
  return canvas.toDataURL("image/png");
}

const DATA_URL_PREFIX = "data:image/png;base64,";

async function render(page: Page, image: RasterImage): Promise<Buffer> {
  const svg = readFileSync(join(brand, image.source), "utf8");
  const request: RenderRequest = {
    svg,
    width: image.width,
    height: image.height,
    background: image.background,
    box: placement(readViewBox(svg), image),
  };
  const dataUrl = await page.evaluate(renderInPage, request);
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) {
    throw new Error(`Chromium did not return a PNG image for ${image.source}.`);
  }
  return Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), "base64");
}

const executablePath = process.env["STYLEGUIDE_CHROMIUM_PATH"];
const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
try {
  const page = await browser.newPage();
  await page.setContent("<!doctype html><title>Brand rasters</title>");
  for (const file of RASTER_FILES) {
    const bytes =
      file.kind === "png"
        ? await render(page, file.image)
        : encodeIco(
            await Promise.all(
              file.images.map(async (image) => ({
                size: image.width,
                png: await render(page, image),
              })),
            ),
          );
    writeFileSync(join(root, file.path), bytes);
    console.log(`Wrote ${file.path}`);
  }
} catch (error) {
  console.error(
    `Could not draw the brand files: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
