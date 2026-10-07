// Red de presentaciones y misterio de los sobres (02 §1.6, §1.7, §6.2.5, §6.2.8; D-168, D-172).
import { z } from "zod";
import { HabilidadId, LugarId, MisionId, NpcId, PistaId, PresentacionId, SobreId } from "../ids.ts";
import { Banda, EstadoRevision } from "./common.ts";

/** Arista de la red: `presentado_por` presenta a `npc` (02 §6.2.8). */
export const Presentacion = z.strictObject({
  id: PresentacionId,
  npc: NpcId,
  presentado_por: NpcId,
  mision: MisionId,
  linea_presentador_en: z.string().min(1),
  /** Primera línea del presentado que reconoce al presentador (G9); null si su escena es de una fase posterior. */
  linea_reconocimiento_en: z.string().min(1).nullable(),
  caminos_alternativos: z.array(PresentacionId),
  bicho_de_luz: z.boolean(),
});
export type Presentacion = z.infer<typeof Presentacion>;

export const ArchivoPresentaciones = z.strictObject({
  presentaciones: z.array(Presentacion).min(1),
});

/** Sobre de semillas (02 §1.6.3, §6.2.5). Texto [GUIONADA]. */
export const Sobre = z.strictObject({
  id: SobreId,
  aparece: z.strictObject({
    lugar: LugarId,
    momento: z.string().min(1),
    tras: MisionId.nullable(),
  }),
  texto_en: z.string().min(1),
  glosa_es: z.string().min(1),
  lectura_en_voz_alta: z.boolean(),
  banda_lectura: Banda,
  contiene: z.string().min(1),
  apunta_a: z.string().min(1),
  estado: EstadoRevision,
});
export type Sobre = z.infer<typeof Sobre>;

/** Pista fija por NPC (02 §1.6.3): la IA usa solo esto. npc null = "Otros". */
export const Pista = z.strictObject({
  id: PistaId,
  npc: NpcId.nullable(),
  disparador: z.string().min(1),
  linea_en: z.string().min(1),
  glosa_es: z.string().min(1),
  banda: Banda,
  acotacion: z.string().min(1).nullable(),
  requiere: HabilidadId.nullable(),
  abre: z.string().min(1),
  /** Nunca se inyecta al NPC antes del capítulo 4 ni llega al cliente. */
  verdad_oculta: z.string().min(1).nullable(),
  estado: EstadoRevision,
});
export type Pista = z.infer<typeof Pista>;

export const ArchivoSobres = z.strictObject({ sobres: z.array(Sobre).min(1) });
export const ArchivoPistas = z.strictObject({ pistas: z.array(Pista).min(1) });
