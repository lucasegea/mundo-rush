// Plantilla de Lumi (02 §2.7.1). Lumi solo dice plantillas con id (ADR-008).
import { z } from "zod";
import { LumiId, MisionId, SaberId } from "../ids.ts";
import { Banda, EstadoRevision } from "./common.ts";

export const FuncionLumi = z.enum([
  "senal", "autocorreccion", "idioma_l1", "frustracion", "pre_tarea", "como_se_dice", "como_se_dice_fuera",
  "pista_1", "pista_2", "pista_3", "marcar", "ayuda_pedida", "destilar", "evocacion", "evocacion_ok",
  "evocacion_no", "anotado_cierre", "onboarding", "sobre_semillas", "cierre_mision", "no_converge",
  "fin_sesion", "regreso", "reglas_valle", "honestidad_ia", "red", "red_sin_presentacion", "fundacion",
  "saber", "saber_fuera", "pronunciacion_invitacion",
]);

/** Slots permitidos (02 §2.6, §2.7.1): ningún hueco sale de texto libre de un modelo. */
export const SLOTS_LUMI = [
  "forma_jugador", "forma_correcta", "foco_l2", "forma_abierta", "glosa_l1", "palabra_l2", "palabra_l1",
  "npc", "npc_presentador", "orientacion", "opcion_a", "opcion_b", "frase_modelo", "nombre_jugador",
  "cantidad_texto", "fundacion", "titulo_saber",
] as const;
export const SlotLumi = z.enum(SLOTS_LUMI);

export const ModoFeedback = z.enum(["accompanied", "flagOnly", "moreHelp"]);

/** Los huecos `{slot}` que aparecen en un texto, en orden y sin repetir. */
export const slotsDelTexto = (texto: string): string[] =>
  [...new Set([...texto.matchAll(/\{([a-z_0-9]+)\}/g)].map((m) => m[1] ?? ""))];

export const PlantillaLumi = z
  .strictObject({
    id: LumiId,
    funcion: FuncionLumi,
    escalon: z.number().int().min(2).max(5).nullable(),
    modos: z.array(ModoFeedback).min(1),
    bandas: z.array(Banda).min(1),
    tipo_error: z.array(z.string().min(1)).nullable(),
    texto: z.string().min(1),
    slots: z.array(SlotLumi),
    audio: z.enum(["fijo", "al_vuelo"]),
    mision: MisionId.nullable(),
    saber: SaberId.nullable(),
    nota: z.string().min(1).nullable(),
    estado: EstadoRevision,
  })
  .superRefine((p, ctx) => {
    const delTexto = slotsDelTexto(p.texto);
    const declarados = [...p.slots];
    if (delTexto.length !== declarados.length || delTexto.some((s) => !declarados.includes(s as never))) {
      ctx.addIssue({ code: "custom", path: ["slots"], message: `slots declarados [${declarados.join(", ")}] ≠ slots del texto [${delTexto.join(", ")}]` });
    }
    if (p.audio === "fijo" && delTexto.length > 0) {
      ctx.addIssue({ code: "custom", path: ["audio"], message: "audio fijo exige un texto sin slots" });
    }
    if (p.funcion === "senal") {
      if (p.escalon === null) ctx.addIssue({ code: "custom", path: ["escalon"], message: "una señal necesita escalón 2-5" });
      if (p.modos.includes("flagOnly")) ctx.addIssue({ code: "custom", path: ["modos"], message: "una señal nunca lista flagOnly" });
      if (p.tipo_error === null) ctx.addIssue({ code: "custom", path: ["tipo_error"], message: "una señal declara tipo_error" });
    } else if (p.escalon !== null) {
      ctx.addIssue({ code: "custom", path: ["escalon"], message: "escalón solo en señales" });
    }
  });
export type PlantillaLumi = z.infer<typeof PlantillaLumi>;

export const ArchivoLumi = z.strictObject({
  idioma_l1: z.literal("es-AR"),
  plantillas: z.array(PlantillaLumi).min(1),
});
