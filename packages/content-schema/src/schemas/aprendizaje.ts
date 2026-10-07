// Glosario curado, árbol de habilidades, ramas de pociones y tarjetas de nivel
// (02 §3.3, §6.4; 01 §2.7.2, §2.8.2; 03 §6.2; D-067, D-128, D-179).
import { z } from "zod";
import { GlosarioId, HabilidadId, MisionId } from "../ids.ts";
import { Banda, EstadoRevision, RamaPocion } from "./common.ts";

export const EntradaGlosario = z.strictObject({
  id: GlosarioId,
  en: z.string().min(1),
  pos: z.enum(["n", "v", "adj", "adv", "phr", "det", "v/n"]),
  traducciones: z.strictObject({
    "es-AR": z.strictObject({ texto: z.string().min(1), notas: z.string().min(1).nullable() }),
  }),
  /** null cuando la tabla de 02 no da banda (p. ej. *mate*, "—"). */
  cefr: Banda.nullable(),
  usado_en: z.array(MisionId),
  /** draft → reviewed → approved: los dos últimos son pasos humanos (D-067). */
  estado: EstadoRevision,
  revision: z.strictObject({ rol: z.string().min(1), fecha: z.string().min(1).nullable() }),
});
export type EntradaGlosario = z.infer<typeof EntradaGlosario>;

export const ArchivoGlosario = z.strictObject({
  l2: z.literal("en"),
  l1: z.literal("es-AR"),
  entradas: z.array(EntradaGlosario).min(1),
});

export const Habilidad = z.strictObject({
  id: HabilidadId,
  nombre: z.string().min(1),
  /** Pociones a verter; vacío para HAB-BASE-NOMBRAR. */
  pociones: z.array(z.strictObject({ rama: RamaPocion, cantidad: z.number().int().positive() })),
  requiere: z.string().min(1).nullable(),
  habilita: z.string().min(1),
});
export type Habilidad = z.infer<typeof Habilidad>;

export const RamaInfo = z.strictObject({
  id: RamaPocion,
  nombre: z.string().min(1),
  color: z.string().min(1),
  demuestra: z.string().min(1),
});
export type RamaInfo = z.infer<typeof RamaInfo>;

export const ArbolHabilidades = z.strictObject({
  ramas: z.array(RamaInfo).length(6),
  habilidades: z.array(Habilidad).min(1),
});

/** Tarjeta de nivel por banda (02 §3.3). Los topes de palabras alimentan el lint de longitud. */
export const TarjetaNivel = z.strictObject({
  banda: z.enum(["A0", "A1", "A1-A2", "A2", "B1"]),
  palabras_por_oracion: z.strictObject({ min: z.number().int().positive(), max: z.number().int().positive() }),
  oraciones_por_turno: z.strictObject({ min: z.number().int().positive(), max: z.number().int().positive(), nota: z.string().min(1).nullable() }),
  estructuras: z.string().min(1),
  preguntas: z.string().min(1),
  palabras_nuevas_por_turno: z.string().min(1),
  velocidad_default: z.string().min(1),
  /** Texto de ejemplo de `{{level_card}}` (02 §3.3); solo servidor. */
  ejemplo_tarjeta: z.strictObject({ andamiaje: z.number().int(), texto: z.string().min(1) }).nullable(),
}).refine((t) => t.palabras_por_oracion.min <= t.palabras_por_oracion.max, {
  message: "min > max", path: ["palabras_por_oracion"],
});
export type TarjetaNivel = z.infer<typeof TarjetaNivel>;
