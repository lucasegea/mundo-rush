// Pieces shared by the schemas (Spanish snake_case keys, D-090).
import { z } from "zod";
import { LumiId, NpcId } from "../ids.ts";

/** CEFR bands used by scenes, missions and sheets (01 §2.11). */
export const Banda = z.enum(["A0", "A1", "A2", "B1", "B2", "C1"]);
export type Banda = z.infer<typeof Banda>;

/** Human review states of all written content (D-067). A run only writes draft. */
export const EstadoRevision = z.enum(["draft", "reviewed", "approved"]);
export type EstadoRevision = z.infer<typeof EstadoRevision>;

/** The 6 potion branches (01 §2.7.2), with the color key used by 02 §6.2.2. */
export const RamaPocion = z.enum(["ambar", "verde", "azul", "violeta", "coral", "celeste"]);
export type RamaPocion = z.infer<typeof RamaPocion>;

/** Text per L1 variant (`es-AR`, later `pt-BR`). */
export const TextoL1 = z.strictObject({ "es-AR": z.string().min(1) });

/** Block present with "no aplica" and its reason (02 §4.3, Lumi mission exception). */
export const NoAplica = z.strictObject({ no_aplica: z.string().min(1) });
export type NoAplica = z.infer<typeof NoAplica>;
export const oNoAplica = <T extends z.ZodType>(s: T) => z.union([s, NoAplica]);

/** Scripted line of an NPC: verbatim English + design gloss (02 §0.2 rule 2). */
export const LineaNpc = z.strictObject({
  quien: NpcId,
  en: z.string().min(1),
  es_glosa: z.string().min(1),
  acotacion: z.string().min(1).optional(),
  audio: z.enum(["cache", "al_vuelo"]).default("cache"),
});

/** Lumi line inside a scene: always a template with an id (ADR-008, 02 §2.7). */
export const LineaLumi = z.strictObject({
  quien: z.literal("LUMI"),
  plantilla: LumiId,
  acotacion: z.string().min(1).optional(),
});

export const LineaGuionada = z.union([LineaNpc, LineaLumi]);
export type LineaGuionada = z.infer<typeof LineaGuionada>;
export type LineaNpc = z.infer<typeof LineaNpc>;
export type LineaLumi = z.infer<typeof LineaLumi>;
export const esLineaLumi = (l: LineaGuionada): l is LineaLumi => "plantilla" in l;
