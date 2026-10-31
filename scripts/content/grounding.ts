// book-mode slice-1 M4 (D-807) — fact-grounding gate: the mitigation of the guiding risk (that Galeano's
// polemical thesis gets "laundered" as fact). ADDITIVE check over the ALREADY compiled set, SCOPED to generated universes:
// build.ts invokes it only on `--universe=<id>` builds, NEVER on the farmer build without a flag (its knowledge items carry no
// `clasificacion` and must not be re-classified or fail — D-807). It softens no existing guard; it is additive.
//
// It asserts, for the target universe:
//  (a) every `saber` carries `clasificacion ∈ {book_thesis, book_fact}`;
//  (b) every `book_fact` carries a real non-empty `fuente` (a citation; D-802 reuses the saber's `fuente`);
//  (c) every conversation with `deduccion_objetivo` references a `saber` by id that resolves;
//  (d) NO dialogue line presents a `book_thesis` saber with an affirmative-of-fact frame — the rendered
//      lines are scanned against the set of thesis ids (not just the node's existence). A thesis must come
//      ATTRIBUTED (said by the NPC / "the book"), never as a bare fact of the world.
import type { Hallazgo, Resultado } from "@lg/content-schema";

type Conjunto = Resultado["conjunto"];
type Saber = Conjunto["saberes"][number]["data"];

const PLACEHOLDER_FUENTE = "FUENTE-PENDIENTE";

const err = (archivo: string, clave: string, mensaje: string): Hallazgo => ({
  nivel: "error", archivo, clave, regla: "grounding", mensaje,
});

/** Normalizes for the line scan: lowercase, non-alphanumeric → space, collapsed spaces. */
const normalizar = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Attribution marks (normalized): if a line that VOICES a thesis contains any, the thesis comes as
 * something said/argued (by the NPC, by the book), not as fact. Their absence in a line voicing a thesis = laundering.
 */
const MARCAS_ATRIBUCION = [
  "i say", "you say", "we say", "they say", "i said", "you said",
  "says", "said", "the book", "book s", "the figure", "as the book",
  "when asked", "argue", "argues", "claim", "claims",
];

/** Collects ALL strings of the card (rendered lines): a deep walk misses none. */
const cadenasDe = (v: unknown, out: string[]): void => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) cadenasDe(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) cadenasDe(x, out);
};

/** Signature of a thesis for the line scan: its bare statement (`linea_sin_dato`, or `linea_en` if missing). */
const firmaTesis = (s: Saber): string => normalizar(s.linea_sin_dato || s.linea_en || "");

/** The gate. Returns the errors (empty = passes). Pure: no IO. */
export const chequearGrounding = (c: Conjunto): Hallazgo[] => {
  const h: Hallazgo[] = [];
  const saberPorId = new Map<string, { archivo: string; data: Saber }>();
  for (const { archivo, data } of c.saberes) saberPorId.set(data.id, { archivo, data });

  // (a) + (b): classification present; book_fact with a real source.
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

  // (c): deduccion_objetivo resolves to a saber.
  for (const { archivo, data } of c.conversaciones) {
    const obj = data.deduccion_objetivo;
    if (obj !== undefined && !saberPorId.has(obj)) {
      h.push(err(archivo, "deduccion_objetivo", `la conversación "${data.id}" apunta a un saber "${obj}" que no existe`));
    }
  }

  // (d): no rendered line presents a thesis as fact (without attribution).
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
