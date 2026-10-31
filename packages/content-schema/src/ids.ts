// Content id formats (03 §6.1 validation 1; 02 §0.1, §0.4, §2.7.1, §6.2).
// A single table: the schemas use it to validate and the compiler to classify references.
import { z } from "zod";

export const ID_PATTERNS = {
  mision: /^M\d+\.\d+$/,
  escena: /^M\d+\.\d+-E\d+$/,
  npc: /^NPC-[A-Z]+$/,
  habilidad: /^HAB-[A-Z]+-(?:\d+|[A-Z]+)$/,
  sitio: /^SITIO-[A-Z]+$/,
  saber: /^SAB-[A-Z]+(?:-[A-Z]+)*$/,
  hecho: /^HV-(?:PRO|M\d+\.\d+|PR\d+\.\d+)-\d{2}$/,
  sobre: /^SOBRE-\d+$/,
  pista: /^CLUE-[A-Z]+-\d+$/,
  lumi: /^LUMI-[A-Z0-9.]+(?:-[A-Z0-9]+)*$/,
  presentacion: /^INTRO-[A-Z]+-[A-Z]+$/,
  glosario: /^gl\.[a-z0-9_]+\.[a-z]+(?:\.[a-z]+)?$/,
  pedido: /^P-R\d+\.\d+$/,
  region: /^R\d+$/,
  lugar: /^(?:campos|cruce)\.[a-z0-9_]+$/,
  pronunciacion: /^M\d+\.\d+-E\d+-PRON-\d+$/,
  /** Meter-based conversation sheet (ADR-027). */
  conversacion: /^CONV-[A-Z]+$/,
  /** Universe (dataset of a book; book-mode slice-1, D-804). `U-CAMPESINO` is the curated fallback. */
  universo: /^U-[A-Z]+$/,
} as const;

export type IdKind = keyof typeof ID_PATTERNS;

/** Zod schema of an id with its format; the message names the expected format. */
export const idOf = (kind: IdKind) =>
  z.string().regex(ID_PATTERNS[kind], { message: `id de ${kind} con formato inválido` });

export const MisionId = idOf("mision");
export const EscenaId = idOf("escena");
export const NpcId = idOf("npc");
export const HabilidadId = idOf("habilidad");
export const SitioId = idOf("sitio");
export const SaberId = idOf("saber");
export const HechoId = idOf("hecho");
export const SobreId = idOf("sobre");
export const PistaId = idOf("pista");
export const LumiId = idOf("lumi");
export const PresentacionId = idOf("presentacion");
export const GlosarioId = idOf("glosario");
export const RegionId = idOf("region");
export const LugarId = idOf("lugar");
export const ConversacionId = idOf("conversacion");
export const UniversoId = idOf("universo");
