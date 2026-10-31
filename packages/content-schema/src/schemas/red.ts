// Introduction network and envelope mystery (02 §1.6, §1.7, §6.2.5, §6.2.8; D-168, D-172).
import { z } from "zod";
import { HabilidadId, LugarId, MisionId, NpcId, PistaId, PresentacionId, SobreId } from "../ids.ts";
import { Banda, EstadoRevision } from "./common.ts";

/** Network edge: `presentado_por` introduces `npc` (02 §6.2.8). */
export const Presentacion = z.strictObject({
  id: PresentacionId,
  npc: NpcId,
  presentado_por: NpcId,
  mision: MisionId,
  linea_presentador_en: z.string().min(1),
  /** First line of the introduced one that recognizes the introducer (G9); null if their scene is from a later phase. */
  linea_reconocimiento_en: z.string().min(1).nullable(),
  caminos_alternativos: z.array(PresentacionId),
  bicho_de_luz: z.boolean(),
});
export type Presentacion = z.infer<typeof Presentacion>;

export const ArchivoPresentaciones = z.strictObject({
  presentaciones: z.array(Presentacion).min(1),
});

/** Seed envelope (02 §1.6.3, §6.2.5). [GUIONADA] text. */
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

/** Fixed hint per NPC (02 §1.6.3): the AI uses only this. npc null = "Otros". */
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
  /** Never injected into the NPC before chapter 4 nor does it reach the client. */
  verdad_oculta: z.string().min(1).nullable(),
  estado: EstadoRevision,
});
export type Pista = z.infer<typeof Pista>;

export const ArchivoSobres = z.strictObject({ sobres: z.array(Sobre).min(1) });
export const ArchivoPistas = z.strictObject({ pistas: z.array(Pista).min(1) });
