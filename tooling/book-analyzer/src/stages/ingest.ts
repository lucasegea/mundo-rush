// INGEST stage (honest stub, book-mode slice-1).
//
// Real contract (future): reads the raw book (extracted text + structure metadata: TOC, pages) and
// segments it into a citable grid (Stage 0 "Segmenter" of the research's interpretation).
//
// Slice-1: does NOT read a book. It reads the hand-made INTERMEDIATE (the literary interpretation already exists in
// docs/research/book-mode/) and hands it to the chain. It is an honest stub: it invents and transforms nothing.
// M3 SEAM: the real book reader and the segmenter go here; the output (the intermediate) does not change shape.
import { readFileSync } from "node:fs";
import type { Intermedio } from "../intermediate.ts";
import { parsearIntermedio } from "../intermediate.ts";

/** Reads the hand-made intermediate from `rutaLibro` (in slice-1, `--book` points to the intermediate, not the book). */
export const ingest = (rutaLibro: string): Intermedio => parsearIntermedio(readFileSync(rutaLibro, "utf8"));
