// Etapa EXTRACT (stub honesto, book-mode slice-1).
//
// Contrato real (futuro): del libro segmentado saca el backbone (árbol de tesis/trama), las figuras
// (portadores del argumento, con partial_view) y los ejes del mundo (Stages 1-2 de la interpretación).
//
// Slice-1: identidad. El intermedio ya trae esa lectura hecha a mano; EXTRACT no agrega ni quita nada.
// M3 SEAM: acá entra el analizador temático y el extractor de figuras reales.
import type { Intermedio } from "../intermediate.ts";

export const extract = (intermedio: Intermedio): Intermedio => intermedio;
