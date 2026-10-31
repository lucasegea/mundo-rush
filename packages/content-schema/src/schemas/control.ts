// Content control files: safety, retired ids and lint allowlist
// (02 §0.5.1, §2.2, §3.2, §6.6; 03 §4.2.1; P0 T5).
import { z } from "zod";
import { MisionId, NpcId } from "../ids.ts";

export const TemasGlobales = z.strictObject({
  fuente: z.string().min(1),
  vedados: z.array(z.string().min(1)).min(1),
});

/**
 * Blocklist. `aplica_a` decides which lines it runs on:
 * npc = NPC L2 lines (and world texts in English), lumi = Lumi templates (L1),
 * todo = every spoken or shown line, jugador = only what the player types (F4.2 input moderation; the
 * content lint does not run it). `excepto` = authorized speakers (health: NPC-GRACE, D-176).
 * Runtime moderation (F4.2, 03 §7.7): `riesgo` → containment (D-112); `inapropiado` → cut + safe line. The
 * player's input goes through those two rules; the NPC's output, through every `npc` or `todo` list.
 */
export const REGLAS_MODERACION_ENTRADA = ["riesgo", "inapropiado"] as const;
export const ListaBloqueo = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  regla: z.enum(["apelativos", "correccion_explicita", "dinero", "salud", "nombres_reales", "lumi", ...REGLAS_MODERACION_ENTRADA]),
  fuente: z.string().min(1),
  aplica_a: z.enum(["npc", "lumi", "todo", "jugador"]),
  sin_mayusculas: z.boolean(),
  excepto: z.array(NpcId).default([]),
  /** Never empty: an empty list is a lint that passes without measuring anything. */
  terminos: z.array(z.string().min(1)).min(1),
});
export type ListaBloqueo = z.infer<typeof ListaBloqueo>;

const Texto = z.string().min(1);

/**
 * Containment and safe line (03 §7.7 points 3-5, D-112; canonical path content/safety/containment.es-AR.yaml).
 * The texts are PROVISIONAL until specialist review (F13): `estado` says so and the UI marks it.
 * `linea_segura_en`: what the NPC says when a line is cut (in the fiction, without scolding).
 * `contencion_en`: the S3 line of the base prompt. `contencion_es`: the out-of-fiction line the player sees.
 * `recursos`: one help resource per country (2-letter ISO code); `pais_por_defecto` chooses which one is shown.
 */
export const ArchivoContencion = z.strictObject({
  fuente: Texto,
  estado: z.enum(["provisorio", "revisado"]),
  linea_segura_en: Texto,
  contencion_en: Texto,
  contencion_es: Texto,
  pais_por_defecto: z.string().regex(/^[A-Z]{2}$/),
  recursos: z.record(z.string().regex(/^[A-Z]{2}$/), z.strictObject({ etiqueta: Texto, detalle: Texto })),
}).refine((c) => c.pais_por_defecto in c.recursos, { message: "pais_por_defecto sin recurso", path: ["pais_por_defecto"] });
export type ArchivoContencion = z.infer<typeof ArchivoContencion>;

/** A row of 02 §0.5.1, as is: group, what was retired and whether it enters the automatic test. */
export const FilaRetirada = z.strictObject({
  grupo: z.string().min(1),
  /** id: ids and names (word boundary, case-sensitive); termino: case-insensitive. */
  tipo: z.enum(["id", "nombre", "termino"]),
  retirado: z.array(z.string().min(1)).min(1),
  testea: z.enum(["si", "no"]),
  nota: z.string().min(1).nullable(),
});
export const ArchivoRetirados = z.strictObject({
  fuente: z.string().min(1),
  filas: z.array(FilaRetirada).min(1),
});
export type FilaRetirada = z.infer<typeof FilaRetirada>;

/** Lint exceptions: a [GUIONADA] line from 02 that breaks a cap is not rewritten, it is listed here. */
export const ArchivoAllowlist = z.strictObject({
  longitud: z.array(z.strictObject({
    linea: z.string().min(1),
    mision: MisionId,
    motivo: z.string().min(1),
  })),
});
