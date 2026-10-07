// Piezas compartidas por los esquemas (claves en español snake_case, D-090).
import { z } from "zod";
import { LumiId, NpcId } from "../ids.ts";

/** Bandas MCER que usan escenas, misiones y fichas (01 §2.11). */
export const Banda = z.enum(["A0", "A1", "A2", "B1", "B2", "C1"]);
export type Banda = z.infer<typeof Banda>;

/** Estados de revisión humana de todo contenido redactado (D-067). Una corrida solo escribe draft. */
export const EstadoRevision = z.enum(["draft", "reviewed", "approved"]);
export type EstadoRevision = z.infer<typeof EstadoRevision>;

/** Las 6 ramas de pociones (01 §2.7.2), con la clave de color que usa 02 §6.2.2. */
export const RamaPocion = z.enum(["ambar", "verde", "azul", "violeta", "coral", "celeste"]);
export type RamaPocion = z.infer<typeof RamaPocion>;

/** Texto por variante de L1 (`es-AR`, más adelante `pt-BR`). */
export const TextoL1 = z.strictObject({ "es-AR": z.string().min(1) });

/** Bloque presente con "no aplica" y su razón (02 §4.3, excepción de misión de Lumi). */
export const NoAplica = z.strictObject({ no_aplica: z.string().min(1) });
export type NoAplica = z.infer<typeof NoAplica>;
export const oNoAplica = <T extends z.ZodType>(s: T) => z.union([s, NoAplica]);

/** Línea guionada de un NPC: inglés textual + glosa de diseño (02 §0.2 regla 2). */
export const LineaNpc = z.strictObject({
  quien: NpcId,
  en: z.string().min(1),
  es_glosa: z.string().min(1),
  acotacion: z.string().min(1).optional(),
  audio: z.enum(["cache", "al_vuelo"]).default("cache"),
});

/** Línea de Lumi dentro de una escena: siempre una plantilla con id (ADR-008, 02 §2.7). */
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
