// Saber real verificable (02 §1.5, §6.2.7, §8; D-170, D-195).
import { z } from "zod";
import { HechoId, LumiId, MisionId, NpcId, SaberId } from "../ids.ts";

export const EstadoSaber = z.enum(["sin_verificar", "verificado", "revisado"]);
export type EstadoSaber = z.infer<typeof EstadoSaber>;

export const Hecho = z.strictObject({
  id: HechoId,
  texto_es: z.string().min(1),
  /** Tipo de fuente sugerida (02 §8): una pista para quien verifique, no una cita. */
  fuente_sugerida: z.string().min(1),
  rama: z.boolean(),
});

export const Saber = z
  .strictObject({
    id: SaberId,
    titulo_corto: z.strictObject({ "es-AR": z.string().min(1) }),
    /** Lo que dice el NPC (dentro de la tarjeta de nivel). null si lo dice Lumi por plantilla. */
    linea_en: z.string().min(1).nullable(),
    /** Plantilla de Lumi que remite a la ficha, cuando dicho_por = LUMI (02 §2.7.1, campo saber). */
    plantilla: LumiId.nullable(),
    /** Variante sin el hecho: la usa el build de release mientras la ficha no esté verificada (D-170). */
    linea_sin_dato: z.string().min(1),
    explicacion_es: z.string().min(1),
    hechos: z.array(Hecho).min(1),
    /** "[FUENTE-PENDIENTE: …]" hasta que una persona la verifique (02 §0.2 regla 9). */
    fuente: z.string().min(1).nullable(),
    estado: EstadoSaber,
    dicho_por: z.union([NpcId, z.literal("LUMI")]),
    mision: MisionId,
    rama: z.boolean(),
    ficcion: z.boolean(),
    usable_como_argumento: z.boolean(),
    // book-mode slice-1 (D-802): etiqueta de grounding de un saber de universo generado. `.optional()` INSIDE
    //   el strictObject (D-801): la campesino la omite y el strictObject acepta la clave ausente. `book_fact`
    //   es un hecho del mundo citable; `book_thesis` es un argumento del autor (p. ej. Galeano), que el gate de
    //   M4 (grounding) exige marcado como tal y nunca presentado como hecho. La cita reusa el `fuente` de arriba
    //   (D-802: no se agrega un campo de cita nuevo). M4 SEAM: scripts/content/grounding.ts lee este campo.
    clasificacion: z.enum(["book_thesis", "book_fact"]).optional(),
  })
  .refine((s) => (s.dicho_por === "LUMI") === (s.plantilla !== null) && (s.linea_en !== null || s.plantilla !== null), {
    message: "dicho_por LUMI exige plantilla; un NPC exige linea_en",
    path: ["dicho_por"],
  })
  .refine((s) => s.estado === "sin_verificar" || (s.fuente !== null && !s.fuente.includes("FUENTE-PENDIENTE")), {
    message: "una ficha verificada o revisada necesita una fuente real (no [FUENTE-PENDIENTE])",
    path: ["fuente"],
  });
export type Saber = z.infer<typeof Saber>;
