// Saber real verificable (02 §1.5, §6.2.7, §8; D-170, D-195).
import { z } from "zod";
import { HechoId, LumiId, MisionId, NpcId, SaberId } from "../ids.ts";

export const EstadoSaber = z.enum(["sin_verificar", "verificado", "revisado"]);
export type EstadoSaber = z.infer<typeof EstadoSaber>;

export const Hecho = z.strictObject({
  id: HechoId,
  texto_es: z.string().min(1),
  /** Suggested source type (02 §8): a hint for whoever verifies, not a citation. */
  fuente_sugerida: z.string().min(1),
  rama: z.boolean(),
});

export const Saber = z
  .strictObject({
    id: SaberId,
    titulo_corto: z.strictObject({ "es-AR": z.string().min(1) }),
    /** What the NPC says (inside the level card). null if Lumi says it by template. */
    linea_en: z.string().min(1).nullable(),
    /** Lumi template that points to the sheet, when dicho_por = LUMI (02 §2.7.1, saber field). */
    plantilla: LumiId.nullable(),
    /** Variant without the fact: used by the release build while the sheet is not verified (D-170). */
    linea_sin_dato: z.string().min(1),
    explicacion_es: z.string().min(1),
    hechos: z.array(Hecho).min(1),
    /** "[FUENTE-PENDIENTE: …]" until a person verifies it (02 §0.2 rule 9). */
    fuente: z.string().min(1).nullable(),
    estado: EstadoSaber,
    dicho_por: z.union([NpcId, z.literal("LUMI")]),
    mision: MisionId,
    rama: z.boolean(),
    ficcion: z.boolean(),
    usable_como_argumento: z.boolean(),
    // book-mode slice-1 (D-802): grounding label of a generated-universe knowledge item. `.optional()` INSIDE
    //   the strictObject (D-801): the farmer universe omits it and the strictObject accepts the absent key. `book_fact`
    //   is a citable fact of the world; `book_thesis` is an author's argument (e.g. Galeano), which the M4
    //   (grounding) gate requires to be marked as such and never presented as fact. The citation reuses the `fuente` above
    //   (D-802: no new citation field is added). M4 SEAM: scripts/content/grounding.ts reads this field.
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
