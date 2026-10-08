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
 * todo = toda línea dicha o mostrada, jugador = solo lo que escribe el jugador (moderación de entrada de F4.2; el
 * lint de contenido no la corre). `excepto` = hablantes autorizados (salud: NPC-GRACE, D-176).
 * Moderación en runtime (F4.2, 03 §7.7): `riesgo` → contención (D-112); `inapropiado` → corte + línea segura. La
 * entrada del jugador pasa por esas dos reglas; la salida del NPC, por toda lista `npc` o `todo`.
 */
export const REGLAS_MODERACION_ENTRADA = ["riesgo", "inapropiado"] as const;
export const ListaBloqueo = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  regla: z.enum(["apelativos", "correccion_explicita", "dinero", "salud", "nombres_reales", "lumi", ...REGLAS_MODERACION_ENTRADA]),
  fuente: z.string().min(1),
  aplica_a: z.enum(["npc", "lumi", "todo", "jugador"]),
  sin_mayusculas: z.boolean(),
  excepto: z.array(NpcId).default([]),
  /** Nunca vacía: una lista vacía es un lint que pasa sin medir nada. */
  terminos: z.array(z.string().min(1)).min(1),
});
export type ListaBloqueo = z.infer<typeof ListaBloqueo>;

const Texto = z.string().min(1);

/**
 * Contención y línea segura (03 §7.7 puntos 3-5, D-112; ruta canónica content/safety/containment.es-AR.yaml).
 * Los textos son PROVISORIOS hasta la revisión de especialistas (F13): `estado` lo dice y la UI lo marca.
 * `linea_segura_en`: lo que dice el NPC cuando se corta una línea (en la ficción, sin regañar).
 * `contencion_en`: la línea S3 del prompt base. `contencion_es`: la línea fuera de la ficción que ve el jugador.
 * `recursos`: un recurso de ayuda por país (código ISO de 2 letras); `pais_por_defecto` elige cuál se muestra.
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
