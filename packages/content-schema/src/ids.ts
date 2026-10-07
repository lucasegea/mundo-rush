// Formatos de id del contenido (03 §6.1 validación 1; 02 §0.1, §0.4, §2.7.1, §6.2).
// Una sola tabla: los esquemas la usan para validar y el compilador para clasificar referencias.
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
} as const;

export type IdKind = keyof typeof ID_PATTERNS;

/** Esquema zod de un id con su formato; el mensaje nombra el formato esperado. */
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
