// Ficha de NPC (02 §6.2.1, 01 §2.5.4). Red: requiere_presentacion + presentado_por (D-168).
import { z } from "zod";
import { LugarId, NpcId, PistaId, SaberId } from "../ids.ts";
import { Banda, EstadoRevision } from "./common.ts";

export const Npc = z
  .strictObject({
    id: NpcId,
    nombre: z.string().min(1),
    rol: z.string().min(1),
    lugar: LugarId,
    edad_aparente: z.string().min(1),
    es_menor: z.boolean(),
    personalidad: z.array(z.string().min(1)).min(1),
    registro: z.string().min(1),
    bandas_mcer: z.strictObject({ region_1: z.string().min(1), max: Banda }),
    frases_firma: z.array(z.string().min(1)),
    voz: z.strictObject({ descripcion: z.string().min(1), voice_id: z.string().min(1) }),
    representacion: z.string().min(1).nullable(),
    sabe: z.array(z.string().min(1)),
    no_sabe: z.array(z.string().min(1)),
    relaciones: z.record(NpcId, z.string().min(1)),
    necesidad_arco: z.string().min(1),
    funciones_lengua: z.array(z.string().min(1)).min(1),
    postura: z.enum(["rapido", "datos_y_relacion", "quizas_nunca", "ya_cambio", "piloto"]).nullable(),
    /** true: su escena no abre sin una presentación (02 §1.7). */
    requiere_presentacion: z.boolean(),
    /** Caminos de presentación posibles (02 §3.1); vacío si no requiere. */
    presentado_por: z.array(NpcId),
    presenta_a: z.array(NpcId),
    /** Regla K1: los únicos saberes que puede decir (02 §3.2). */
    hechos_que_puede_decir: z.array(SaberId),
    quien_sabe_mas: z.record(z.string().min(1), NpcId),
    pistas_misterio: z.array(PistaId),
    timido_hasta: z.string().min(1).nullable(),
    /** Bloque PERSONA en inglés (D-025); solo llega al servidor. */
    persona_prompt: z.string().min(1),
    estado: EstadoRevision,
  })
  .refine((n) => n.requiere_presentacion === n.presentado_por.length > 0, {
    message: "requiere_presentacion y presentado_por no coinciden (con presentación hace falta al menos un camino)",
    path: ["presentado_por"],
  });
export type Npc = z.infer<typeof Npc>;
