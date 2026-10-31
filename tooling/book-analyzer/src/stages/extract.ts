// EXTRACT stage (honest stub, book-mode slice-1).
//
// Real contract (future): from the segmented book, extracts the backbone (thesis/plot tree), the figures
// (carriers of the argument, with partial_view) and the world axes (Stages 1-2 of the interpretation).
//
// Slice-1: identity. The intermediate already brings that hand-made reading; EXTRACT adds and removes nothing.
// M3 SEAM: the thematic analyzer and the real figure extractor go here.
import type { Intermedio } from "../intermediate.ts";

export const extract = (intermedio: Intermedio): Intermedio => intermedio;
