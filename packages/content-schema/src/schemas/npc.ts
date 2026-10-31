// NPC sheet (02 §6.2.1, 01 §2.5.4). Network: requiere_presentacion + presentado_por (D-168).
import { z } from "zod";
import { BODY_IDS, HAIR_STYLES, HATS, LOOK_SCALE_MAX, LOOK_SCALE_MIN, SCARVES, SHIRT_TOKENS } from "@lg/art";
import { LugarId, NpcId, PistaId, SaberId } from "../ids.ts";
import { Banda, EstadoRevision } from "./common.ts";
import { TokenPaleta } from "./mundo.ts";

/**
 * Character appearance (plan estetica-c M5, proposal C §3): base body, T-shirt (`casa-1..6`), trousers, skin and
 * hair by palette token, hairstyle, hat and what is worn around the neck. Replaces the in-code table of M1 and M3
 * (world/actors/looks.ts). The vocabulary comes from @lg/art (the same one world/ draws). An NPC placed in a diorama without
 * appearance makes validate:content fail.
 */
export const Apariencia = z.strictObject({
  cuerpo: z.enum(BODY_IDS),
  remera: z.enum(SHIRT_TOKENS),
  pantalon: TokenPaleta,
  piel: TokenPaleta,
  pelo: TokenPaleta,
  peinado: z.enum(HAIR_STYLES),
  sombrero: z.enum(HATS).nullable(),
  cuello: z.enum(SCARVES).nullable(),
  escala: z.number().min(LOOK_SCALE_MIN).max(LOOK_SCALE_MAX),
});
export type Apariencia = z.infer<typeof Apariencia>;

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
    /** true: its scene does not open without an introduction (02 §1.7). */
    requiere_presentacion: z.boolean(),
    /** Possible introduction paths (02 §3.1); empty if not required. */
    presentado_por: z.array(NpcId),
    presenta_a: z.array(NpcId),
    /** Rule K1: the only knowledge items it can say (02 §3.2). */
    hechos_que_puede_decir: z.array(SaberId),
    quien_sabe_mas: z.record(z.string().min(1), NpcId),
    pistas_misterio: z.array(PistaId),
    timido_hasta: z.string().min(1).nullable(),
    /** PERSONA block in English (D-025); reaches the server only. */
    persona_prompt: z.string().min(1),
    apariencia: Apariencia.optional(),
    estado: EstadoRevision,
  })
  .refine((n) => n.requiere_presentacion === n.presentado_por.length > 0, {
    message: "requiere_presentacion y presentado_por no coinciden (con presentación hace falta al menos un camino)",
    path: ["presentado_por"],
  });
export type Npc = z.infer<typeof Npc>;
