// book-mode slice-1 M4 (D-807) — fact-grounding gate: la mitigación del riesgo rector (que la tesis-polémica de
// Galeano se "lave" como hecho). Chequeo ADITIVO sobre el conjunto YA compilado, SCOPEADO a universos generados:
// build.ts solo lo invoca en builds `--universe=<id>`, NUNCA en el build campesino sin flag (sus saberes no llevan
// `clasificacion` y no deben re-clasificarse ni fallar — D-807). No ablanda ningún guard existente; es additive.
//
// Afirma, para el universo objetivo:
//  (a) todo `saber` lleva `clasificacion ∈ {book_thesis, book_fact}`;
//  (b) todo `book_fact` lleva `fuente` real no vacía (una cita; D-802 reusa el `fuente` del saber);
//  (c) toda conversación con `deduccion_objetivo` referencia un `saber` por id que resuelve;
//  (d) NINGUNA línea de diálogo presenta un saber `book_thesis` con marco afirmativo-de-hecho — se escanean las
//      líneas renderizadas contra el conjunto de ids-tesis (no solo la existencia del nodo). Una tesis debe venir
//      ATRIBUIDA (la dice el NPC / "the book"), nunca como hecho pelado del mundo.
import type { Hallazgo, Resultado } from "@lg/content-schema";

type Conjunto = Resultado["conjunto"];
type Saber = Conjunto["saberes"][number]["data"];

const PLACEHOLDER_FUENTE = "FUENTE-PENDIENTE";

const err = (archivo: string, clave: string, mensaje: string): Hallazgo => ({
  nivel: "error", archivo, clave, regla: "grounding", mensaje,
});

/** Normaliza para el escaneo de líneas: minúsculas, no-alfanumérico → espacio, espacios colapsados. */
const normalizar = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Marcas de atribución (normalizadas): si una línea que VOCEA una tesis contiene alguna, la tesis viene como
 * dicho/argumento (del NPC, del libro), no como hecho. Su ausencia en una línea que vocea una tesis = laundering.
 */
const MARCAS_ATRIBUCION = [
  "i say", "you say", "we say", "they say", "i said", "you said",
  "says", "said", "the book", "book s", "the figure", "as the book",
  "when asked", "argue", "argues", "claim", "claims",
];

/** Recolecta TODAS las cadenas de la ficha (líneas renderizadas): un recorrido profundo no se pierde ninguna. */
const cadenasDe = (v: unknown, out: string[]): void => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) cadenasDe(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) cadenasDe(x, out);
};

/** Firma de una tesis para el escaneo de líneas: su enunciado pelado (`linea_sin_dato`, o `linea_en` si faltara). */
const firmaTesis = (s: Saber): string => normalizar(s.linea_sin_dato || s.linea_en || "");

/** El gate. Devuelve los errores (vacío = pasa). Puro: sin IO. */
export const chequearGrounding = (c: Conjunto): Hallazgo[] => {
  const h: Hallazgo[] = [];
  const saberPorId = new Map<string, { archivo: string; data: Saber }>();
  for (const { archivo, data } of c.saberes) saberPorId.set(data.id, { archivo, data });

  // (a) + (b): clasificación presente; book_fact con fuente real.
  for (const { archivo, data } of c.saberes) {
    if (data.clasificacion !== "book_thesis" && data.clasificacion !== "book_fact") {
      h.push(err(archivo, "clasificacion", `el saber "${data.id}" no lleva clasificacion (book_thesis|book_fact): un universo generado debe etiquetar cada saber`));
      continue;
    }
    if (data.clasificacion === "book_fact") {
      const f = data.fuente;
      if (f === null || f.trim() === "" || f.includes(PLACEHOLDER_FUENTE)) {
        h.push(err(archivo, "fuente", `el saber "${data.id}" es book_fact pero no tiene una fuente real (una cita): un hecho citable exige fuente`));
      }
    }
  }

  // (c): deduccion_objetivo resuelve a un saber.
  for (const { archivo, data } of c.conversaciones) {
    const obj = data.deduccion_objetivo;
    if (obj !== undefined && !saberPorId.has(obj)) {
      h.push(err(archivo, "deduccion_objetivo", `la conversación "${data.id}" apunta a un saber "${obj}" que no existe`));
    }
  }

  // (d): ninguna línea renderizada presenta una tesis como hecho (sin atribución).
  const tesis = c.saberes
    .map((e) => e.data)
    .filter((s) => s.clasificacion === "book_thesis")
    .map((s) => ({ id: s.id, firma: firmaTesis(s) }))
    .filter((t) => t.firma !== "");
  for (const { archivo, data } of c.conversaciones) {
    const lineas: string[] = [];
    cadenasDe(data, lineas);
    for (const linea of lineas) {
      const norm = normalizar(linea);
      for (const t of tesis) {
        if (!norm.includes(t.firma)) continue;
        const atribuida = MARCAS_ATRIBUCION.some((m) => norm.includes(m));
        if (!atribuida) {
          h.push(err(archivo, "linea", `la conversación "${data.id}" presenta la tesis "${t.id}" como hecho (sin atribución): "${linea.trim()}"`));
        }
      }
    }
  }

  return h;
};
