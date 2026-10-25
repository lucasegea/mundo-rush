// Orquestador del pipeline libro → universo (ADR-029, book-mode slice-1).
// INGEST → EXTRACT → DESIGN → LANG-FIT → EMIT. Las 4 primeras son stubs honestos (pasan el intermedio tal cual);
// EMIT es real (valida contra @lg/content-schema y escribe los YAML canónicos del universo).
//
// M3 SEAM: cuando las etapas de arriba se vuelvan reales, cambian ELLAS; este orden y la firma de EMIT no.
import { design } from "./stages/design.ts";
import { emit } from "./stages/emit.ts";
import type { SalidaEmit } from "./stages/emit.ts";
import { extract } from "./stages/extract.ts";
import { ingest } from "./stages/ingest.ts";
import { langFit } from "./stages/langfit.ts";

export interface OpcionesPipeline {
  /** Ruta del libro. En slice-1, apunta al intermedio hecho a mano (INGEST lo lee tal cual). */
  book: string;
  /** Directorio de salida del universo: content/universes/<id>/ (S1/D-804). */
  outDir: string;
}

/** Corre la cadena entera y devuelve el resultado de EMIT (rutas escritas o errores de validación). */
export const correrPipeline = ({ book, outDir }: OpcionesPipeline): SalidaEmit => {
  const intermedio = langFit(design(extract(ingest(book))));
  return emit(intermedio, outDir);
};
