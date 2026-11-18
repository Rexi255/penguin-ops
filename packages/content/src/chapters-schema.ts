// Schema of `content/chapters.yaml` (ADR 0070): the order of the chapters and of the levels in
// each chapter, described in docs/LEVEL-AUTHORING.md. Chapter titles and texts live in the
// translation catalogs (ROADMAP M2.3), so the file holds only IDs.
//
// What the schema cannot see is checked by the content loader (`content-loader.ts`): that every
// listed level exists and that every level is in exactly one chapter.

import { z } from "zod";

import { idSchema, reportDuplicates } from "./level-schema";

/** The chapters file format version that this schema reads. */
export const CHAPTERS_FORMAT_VERSION = 1;

/** A chapter: its levels in the order the game offers them. */
export interface Chapter {
  /** Stable kebab-case ID; save files and text catalogs use it. */
  readonly id: string;
  /** Level IDs in order. */
  readonly levels: readonly string[];
}

/** The checked chapters file. */
export interface Chapters {
  readonly format: typeof CHAPTERS_FORMAT_VERSION;
  /** Chapters in order. */
  readonly chapters: readonly Chapter[];
}

const chapterSchema = z.strictObject({
  id: idSchema("a chapter ID").meta({
    description: "Stable chapter ID; must never change.",
  }),
  levels: z
    .array(idSchema("a level ID"))
    .min(1, { error: "a chapter has at least one level" })
    .meta({ description: "Level IDs in the order the game offers them." }),
});

/** Schema of `content/chapters.yaml`. */
export const chaptersSchema = z
  .strictObject({
    format: z
      .literal(CHAPTERS_FORMAT_VERSION, {
        error: `the chapters format version must be ${String(CHAPTERS_FORMAT_VERSION)}`,
      })
      .meta({ description: "Chapters file format version." }),
    chapters: z
      .array(chapterSchema)
      .min(1, { error: "the game needs at least one chapter" })
      .superRefine((chapters, context) => {
        reportDuplicates(
          chapters.map((chapter) => chapter.id),
          "the chapter ID",
          context,
          (index) => [index, "id"],
        );
      })
      .meta({ description: "Chapters in order." }),
  })
  .transform((file): Chapters => file)
  .meta({
    title: "PenguinOps chapters",
    description: "The order of chapters and their levels (docs/LEVEL-AUTHORING.md).",
  });

/** The chapters file as authors write it, before parsing. */
export type ChaptersInput = z.input<typeof chaptersSchema>;
