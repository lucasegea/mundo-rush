// El "intermedio": el artefacto que el analizador pasa de etapa en etapa hasta EMIT.
//
// En book-mode slice-1 el intermedio es la INTERPRETACIÓN del libro hecha a mano (la lectura literaria de
// la investigación, docs/research/book-mode/galeano-universe-interpretation.md), ya organizada por campo del contrato
// del engine. Las etapas de arriba (INGEST/EXTRACT/DESIGN/LANG-FIT) son stubs honestos que lo leen y lo pasan
// tal cual; EMIT es la única etapa real y la única atada a @lg/content-schema (valida y escribe).
//
// M3 SEAM: cuando las etapas de arriba se vuelvan reales, INGEST leerá el libro crudo y EXTRACT→LANG-FIT
// GENERARÁN este intermedio en vez de recibirlo hecho a mano. La forma del intermedio (las claves de abajo)
// es el límite entre "lo generado" y "lo que EMIT sabe escribir", y no cambia cuando eso pase.
import { parse } from "yaml";

/**
 * Claves de alto nivel del intermedio, una por campo del contrato (reconciliación slice-1 §"Contrato único").
 * Los valores van como `unknown`: EMIT es quien los valida contra el esquema del engine (T2.3), no las etapas
 * de arriba (que son tontas a propósito). `mundo` agrupa regiones+lugares (un solo archivo canónico places.yaml).
 */
export interface Intermedio {
  manifiesto?: unknown;
  mundo?: unknown;
  dioramas?: unknown[];
  npcs?: unknown[];
  red?: unknown;
  missions?: unknown[];
  conversaciones?: unknown[];
  saberes?: unknown[];
  glossary?: unknown;
  /** Textos planos del servidor (nombre sin extensión → texto), p. ej. `npc-base`: EMIT los escribe a prompts/<nombre>.txt. */
  prompts?: unknown;
}

export const CLAVES_INTERMEDIO = [
  "manifiesto", "mundo", "dioramas", "npcs", "red", "missions", "conversaciones", "saberes", "glossary", "prompts",
] as const;

/** Error de forma del intermedio (antes de validar contra los esquemas del engine, que es trabajo de EMIT). */
export class ErrorIntermedio extends Error {}

/**
 * Parsea el texto del intermedio (YAML o JSON — `parse` de la lib yaml acepta JSON, que es YAML válido) y
 * chequea solo la FORMA: un objeto en la raíz y ninguna clave desconocida (un typo de clave se tragaría un
 * campo entero sin avisar). No valida los valores: eso lo hace EMIT contra @lg/content-schema.
 */
export const parsearIntermedio = (texto: string): Intermedio => {
  let raw: unknown;
  try {
    raw = parse(texto);
  } catch (e) {
    throw new ErrorIntermedio(`el intermedio no es YAML/JSON válido: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ErrorIntermedio("el intermedio tiene que ser un objeto con campos por contrato (manifiesto, npcs, …)");
  }
  const conocidas = new Set<string>(CLAVES_INTERMEDIO);
  const desconocidas = Object.keys(raw).filter((k) => !conocidas.has(k));
  if (desconocidas.length > 0) {
    throw new ErrorIntermedio(`claves desconocidas en el intermedio: ${desconocidas.join(", ")} (¿typo?). Válidas: ${CLAVES_INTERMEDIO.join(", ")}`);
  }
  return raw as Intermedio;
};
