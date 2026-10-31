// LANG-FIT stage (honest stub, book-mode slice-1).
//
// Real contract (future): adjusts the content to the language pair and the CEFR level (glossary, scaffolding, bands),
// keeping the book's register (Galeano's irony). It is the contract's capa_idioma.
//
// Slice-1: identity. The intermediate already comes in the es-AR/en pair with its draft glossary (D-806: that pair is
// baked into the compiler's routes; a universe in another pair is outside slice-1).
// M3 SEAM: level adjustment and glossary/scaffolding generation go here.
import type { Intermedio } from "../intermediate.ts";

export const langFit = (intermedio: Intermedio): Intermedio => intermedio;
