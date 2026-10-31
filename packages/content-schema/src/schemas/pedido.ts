// Board order (02 §6.2.4; 01 §3.7). The content of P-R1.x enters in F8; F1.2 fixes the shape.
import { z } from "zod";
import { HabilidadId, idOf, NpcId, SaberId, SitioId } from "../ids.ts";
import { EstadoRevision } from "./common.ts";
import { Escena, EstadoFundacion } from "./mision.ts";

export const PedidoTablero = z.strictObject({
  id: idOf("pedido"),
  /** The 7 templates of 01 §3.7, in snake_case. */
  plantilla: z.enum(["objeto_perdido", "recado", "charla_de_vereda", "como_se_dice", "lista", "cartel", "mensaje_por_radio"]),
  npcs: z.array(NpcId).min(1),
  requiere: z.array(HabilidadId),
  papelito_tablero: z.strictObject({ en: z.string().min(1), es_glosa: z.string().min(1) }),
  objetivo: z.string().min(1),
  criterio: z.string().min(1),
  slots_repaso: z.number().int().min(0),
  red: z.strictObject({ altas: z.array(z.strictObject({ npc: NpcId, por: NpcId.nullable() })) }).nullable(),
  fundacion: z.strictObject({ sitio: SitioId, a: EstadoFundacion }).nullable(),
  saberes: z.array(SaberId),
  escenas: z.array(Escena),
  estado: EstadoRevision,
});
export type PedidoTablero = z.infer<typeof PedidoTablero>;
