// Head of a universe generated from a book (book-mode slice-1, D-804).
// content/universes/<id>/manifiesto.yaml declares which book produced the dataset and in which language pair it runs.
// The compiler reads it as the universe head; `packages/core` never sees this type (C-A: one engine, N datasets).
import { z } from "zod";
import { UniversoId } from "../ids.ts";

/**
 * Language pair of the universe: L1 = game language, L2 = language being taught.
 * In slice-1 it is always es-AR(L1)/en(L2): conjunto.ts bakes that pair into the glossary/lumi/containment paths
 * (D-806 known limit). A universe in another pair is out of slice-1 until those paths are parameterized.
 */
export const ParIdioma = z.strictObject({
  l1: z.string().min(1),
  l2: z.string().min(1),
});
export type ParIdioma = z.infer<typeof ParIdioma>;

export const Universo = z.strictObject({
  id: UniversoId,
  titulo: z.string().min(1),
  /** The book this universe was generated from (free citation: author, title, year). */
  libro_fuente: z.string().min(1),
  par_idioma: ParIdioma,
  // M2/M3 SEAM: the analyzer (EMIT) may add head fields (e.g. default render profile
  //   from ADR-030, deferred) INSIDE this strictObject and always `.optional()` (D-801), never with `.extend()`.
});
export type Universo = z.infer<typeof Universo>;
