// Etapa LANG-FIT (stub honesto, book-mode slice-1).
//
// Contrato real (futuro): ajusta el contenido al par de idiomas y al nivel MCER (glosario, andamiaje, bandas),
// manteniendo el registro del libro (la ironía de Galeano). Es la capa_idioma del contrato.
//
// Slice-1: identidad. El intermedio ya viene en el par es-AR/en con su glosario draft (D-806: ese par está
// baked en las rutas del compilador; un universo en otro par queda fuera de slice-1).
// M3 SEAM: acá entra el ajuste de nivel y la generación de glosario/andamiaje.
import type { Intermedio } from "../intermediate.ts";

export const langFit = (intermedio: Intermedio): Intermedio => intermedio;
