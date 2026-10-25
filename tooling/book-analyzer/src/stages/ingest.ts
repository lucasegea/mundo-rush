// Etapa INGEST (stub honesto, book-mode slice-1).
//
// Contrato real (futuro): lee el libro crudo (texto extraído + metadatos de estructura: TOC, páginas) y lo
// segmenta en un grid citable (Stage 0 "Segmenter" de la interpretación del libro).
//
// Slice-1: NO lee un libro. Lee el INTERMEDIO hecho a mano (la interpretación literaria ya existe en
// docs/research/book-mode/) y lo entrega a la cadena. Es un stub honesto: no inventa ni transforma nada.
// M3 SEAM: acá entra el lector del libro real y el segmentador; la salida (el intermedio) no cambia de forma.
import { readFileSync } from "node:fs";
import type { Intermedio } from "../intermediate.ts";
import { parsearIntermedio } from "../intermediate.ts";

/** Lee el intermedio hecho a mano desde `rutaLibro` (en slice-1, `--book` apunta al intermedio, no al libro). */
export const ingest = (rutaLibro: string): Intermedio => parsearIntermedio(readFileSync(rutaLibro, "utf8"));
