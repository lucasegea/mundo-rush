// Cabeza de un universo generado desde un libro (book-mode slice-1, D-804).
// content/universes/<id>/manifiesto.yaml declara qué libro produjo el dataset y en qué par de idiomas corre.
// El compilador lo lee como cabeza del universo; `packages/core` nunca ve este tipo (C-A: un motor, N datasets).
import { z } from "zod";
import { UniversoId } from "../ids.ts";

/**
 * Par de idiomas del universo: L1 = idioma de juego, L2 = idioma que se enseña.
 * En slice-1 siempre es-AR(L1)/en(L2): conjunto.ts bakea ese par en las rutas de glosario/lumi/contención
 * (D-806 límite conocido). Un universo en otro par queda fuera de slice-1 hasta parametrizar esas rutas.
 */
export const ParIdioma = z.strictObject({
  l1: z.string().min(1),
  l2: z.string().min(1),
});
export type ParIdioma = z.infer<typeof ParIdioma>;

export const Universo = z.strictObject({
  id: UniversoId,
  titulo: z.string().min(1),
  /** El libro del que se generó este universo (cita libre: autor, título, año). */
  libro_fuente: z.string().min(1),
  par_idioma: ParIdioma,
  // M2/M3 SEAM: el analizador (EMIT) puede sumar campos de cabeza (p. ej. perfil de render por defecto
  //   de ADR-030, diferido) INSIDE este strictObject y siempre `.optional()` (D-801), nunca con `.extend()`.
});
export type Universo = z.infer<typeof Universo>;
