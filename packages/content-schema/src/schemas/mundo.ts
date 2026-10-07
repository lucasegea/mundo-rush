// Región, lugares, fundaciones y dioramas (02 §0.3, §4.1, §6.2.6; 03 §6.4.3; D-169, D-180).
import { z } from "zod";
import { idOf, LugarId, MisionId, NpcId, SaberId, SitioId } from "../ids.ts";
import { EstadoRevision, TextoL1 } from "./common.ts";
import { EstadoFundacion } from "./mision.ts";

/** Ids de diorama vigentes: no se renombran (D-180). muelle = Los Campos, plaza = El Cruce. */
export const DioramaId = z.enum(["muelle", "plaza", "test"]);

export const Region = z.strictObject({
  id: idOf("region"),
  nombre: TextoL1,
  dioramas: z.array(DioramaId).min(1),
  capitulos: z.array(z.number().int().min(0)).min(1),
  /** Elenco declarado de la región (02 §3.1): ids que el contenido puede nombrar antes de tener ficha. */
  elenco: z.array(NpcId).min(1),
  /** Saberes declarados de la región (02 §1.5): ids que una ficha de NPC puede listar antes de existir. */
  saberes: z.array(SaberId).min(1),
});
export type Region = z.infer<typeof Region>;

export const Lugar = z.strictObject({
  id: LugarId,
  nombre: TextoL1,
  en: z.string().min(1).nullable(),
  region: idOf("region"),
  diorama: DioramaId,
  /** Lugar público a la vista: la regla de menores en escena lo exige (01 §2.17.1, 03 §6.1 #6). */
  publico: z.boolean(),
  descripcion: z.string().min(1),
});
export type Lugar = z.infer<typeof Lugar>;

export const ArchivoLugares = z.strictObject({
  regiones: z.array(Region).min(1),
  lugares: z.array(Lugar).min(1),
});

/** Ficha de fundación (02 §6.2.6). Nada se compra: costo siempre null (D-169). */
export const Fundacion = z.strictObject({
  id: SitioId,
  nombre: z.strictObject({ "es-AR": z.string().min(1), en: z.string().min(1) }),
  nombre_corto: z.string().min(1),
  lugar: LugarId,
  diorama: DioramaId,
  estados: z.partialRecord(EstadoFundacion, z.strictObject({
    visual: z.string().min(1),
    desde: MisionId.nullable(),
  })).refine((e) => Object.keys(e).length > 0, { message: "al menos un estado visible" }),
  propuesta_por: NpcId,
  se_consigue_hablando: z.array(z.string().min(1)).min(1),
  /** Quién puso las manos; el jugador nunca aparece solo (02 §6.3 regla 29). */
  creditos: z.array(z.union([NpcId, z.literal("jugador")])).min(2),
  uso_en_mundo: z.array(z.string().min(1)),
  costo: z.null(),
  estado: EstadoRevision,
});
export type Fundacion = z.infer<typeof Fundacion>;

/** Ancla de un SITIO-* en el layout del diorama (03 §6.4.3; F3.3 la dibuja). */
export const AnclaSitio = z.strictObject({
  id: SitioId,
  pos: z.tuple([z.number(), z.number(), z.number()]),
  ocupa: z.array(z.tuple([z.number(), z.number()])).optional(),
  caminable_en: z.array(EstadoFundacion).optional(),
});

/**
 * Layout de diorama: F1.2 valida solo la forma general y las anclas `sitios:`.
 * Tiles, props y caminabilidad los cierra F2/F3 (03 §6.4.5).
 */
export const Diorama = z.looseObject({
  id: DioramaId,
  bounds: z.strictObject({ minX: z.number(), maxX: z.number(), minZ: z.number(), maxZ: z.number() }),
  sitios: z.array(AnclaSitio).default([]),
});
export type Diorama = z.infer<typeof Diorama>;
