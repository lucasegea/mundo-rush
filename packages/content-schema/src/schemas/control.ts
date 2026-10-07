// Archivos de control del contenido: seguridad, ids retirados y allowlist de lint
// (02 §0.5.1, §2.2, §3.2, §6.6; 03 §4.2.1; P0 T5).
import { z } from "zod";
import { MisionId, NpcId } from "../ids.ts";

export const TemasGlobales = z.strictObject({
  fuente: z.string().min(1),
  vedados: z.array(z.string().min(1)).min(1),
});

/**
 * Lista de bloqueo. `aplica_a` decide sobre qué líneas corre:
 * npc = líneas en L2 de NPCs (y textos del mundo en inglés), lumi = plantillas de Lumi (L1),
 * todo = toda línea dicha o mostrada. `excepto` = hablantes autorizados (salud: NPC-GRACE, D-176).
 */
export const ListaBloqueo = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  regla: z.enum(["apelativos", "correccion_explicita", "dinero", "salud", "nombres_reales", "lumi"]),
  fuente: z.string().min(1),
  aplica_a: z.enum(["npc", "lumi", "todo"]),
  sin_mayusculas: z.boolean(),
  excepto: z.array(NpcId).default([]),
  /** Nunca vacía: una lista vacía es un lint que pasa sin medir nada. */
  terminos: z.array(z.string().min(1)).min(1),
});
export type ListaBloqueo = z.infer<typeof ListaBloqueo>;

/** Una fila de 02 §0.5.1, tal cual: grupo, lo retirado y si entra al test automático. */
export const FilaRetirada = z.strictObject({
  grupo: z.string().min(1),
  /** id: ids y nombres (límite de palabra, respeta mayúsculas); termino: sin mayúsculas. */
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

/** Excepciones de lint: una línea [GUIONADA] de 02 que rompe un tope no se reescribe, se lista acá. */
export const ArchivoAllowlist = z.strictObject({
  longitud: z.array(z.strictObject({
    linea: z.string().min(1),
    mision: MisionId,
    motivo: z.string().min(1),
  })),
});
