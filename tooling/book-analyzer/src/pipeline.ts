// Orchestrator of the book → universe pipeline (ADR-029, book-mode slice-1).
// INGEST → EXTRACT → DESIGN → LANG-FIT → EMIT. The first 4 are honest stubs (they pass the intermediate as is);
// EMIT is real (validates against @lg/content-schema and writes the universe's canonical YAML).
//
// M3 SEAM: once the upstream stages become real, THEY change; this order and EMIT's signature do not.
import { design } from "./stages/design.ts";
import { emit } from "./stages/emit.ts";
import type { SalidaEmit } from "./stages/emit.ts";
import { extract } from "./stages/extract.ts";
import { ingest } from "./stages/ingest.ts";
import { langFit } from "./stages/langfit.ts";

export interface OpcionesPipeline {
  /** Path of the book. In slice-1, it points to the hand-made intermediate (INGEST reads it as is). */
  book: string;
  /** Output directory of the universe: content/universes/<id>/ (S1/D-804). */
  outDir: string;
}

/** Runs the whole chain and returns EMIT's result (written paths or validation errors). */
export const correrPipeline = ({ book, outDir }: OpcionesPipeline): SalidaEmit => {
  const intermedio = langFit(design(extract(ingest(book))));
  return emit(intermedio, outDir);
};
