// The "intermediate": the artifact the analyzer passes from stage to stage until EMIT.
//
// In book-mode slice-1 the intermediate is the hand-made INTERPRETATION of the book (the literary reading by
// the research, docs/research/book-mode/galeano-universe-interpretation.md), already organized by engine contract
// field. The upstream stages (INGEST/EXTRACT/DESIGN/LANG-FIT) are honest stubs that read it and pass it along
// as is; EMIT is the only real stage and the only one tied to @lg/content-schema (validates and writes).
//
// M3 SEAM: once the upstream stages become real, INGEST will read the raw book and EXTRACT→LANG-FIT will
// GENERATE this intermediate instead of receiving it hand-made. The shape of the intermediate (the keys below)
// is the boundary between "what is generated" and "what EMIT knows how to write", and it does not change when that happens.
import { parse } from "yaml";

/**
 * Top-level keys of the intermediate, one per contract field (slice-1 reconciliation §"Contrato único").
 * Values are `unknown`: EMIT is the one that validates them against the engine schema (T2.3), not the upstream
 * stages (which are dumb on purpose). `mundo` groups regions+places (a single canonical file, places.yaml).
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
  /** Plain server texts (name without extension → text), e.g. `npc-base`: EMIT writes them to prompts/<name>.txt. */
  prompts?: unknown;
}

export const CLAVES_INTERMEDIO = [
  "manifiesto", "mundo", "dioramas", "npcs", "red", "missions", "conversaciones", "saberes", "glossary", "prompts",
] as const;

/** Shape error of the intermediate (before validating against the engine schemas, which is EMIT's job). */
export class ErrorIntermedio extends Error {}

/**
 * Parses the text of the intermediate (YAML or JSON — the yaml lib's `parse` accepts JSON, which is valid YAML) and
 * checks only the SHAPE: an object at the root and no unknown key (a key typo would swallow a whole
 * field silently). It does not validate the values: EMIT does that against @lg/content-schema.
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
