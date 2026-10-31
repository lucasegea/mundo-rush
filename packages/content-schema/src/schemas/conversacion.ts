// Conversation sheet of an NPC (ADR-027; the research report 2.5.C). The NPC's "soft cage" in free conversation:
// extra persona, facts by intimacy tier, what the player can tell about THEIR CHARACTER, secrets with a condition,
// meters in order (getting to know each other → goal) and the help ladder. It only reaches the server: the English (`*_en`) builds the
// NPC and judge prompt; the Spanish (`*_es`) is what the HUD shows (it reaches the client through the protocol).
// The goal material (errand, objections) enters the NPC prompt ONLY when the getting-to-know meter fills.
import { z } from "zod";
import { idOf, NpcId, SaberId } from "../ids.ts";
import { EstadoRevision } from "./common.ts";

/** Judge acts that a goal step can ask for (= DIALOGUE_ACTS of @lg/core, which content-schema does not import). */
export const ACTOS_PASO = ["states_errand", "polite_request", "gives_reason", "empathy_reaction", "self_disclosure"] as const;

const IdLocal = z.string().regex(/^[a-z][a-z0-9_]*$/, { message: "id local en snake_case" });
const Texto = z.string().trim().min(1);
const Frases = z.array(Texto).max(6);

export const HechoNpc = z.strictObject({
  id: IdLocal,
  nivel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** How the NPC knows it (English, goes to the prompt). */
  valor_en: Texto,
  /** What the HUD shows in "Lo que sabés de…". */
  etiqueta_es: Texto,
});

export const DatoJugador = z.strictObject({
  id: IdLocal,
  /** What the player tells about their character (English, for the judge). Never real data. */
  descripcion_en: Texto,
  etiqueta_es: Texto,
});

export const Secreto = z.strictObject({
  id: IdLocal,
  /** What the NPC does if asked ahead of time (English, always in the prompt). */
  desvio_en: Texto,
  /** null: never revealed in this sheet. Otherwise, revealed with the meter filled to at least `llenado_min`. */
  revela_si: z.strictObject({ medidor: IdLocal, llenado_min: z.number().min(0).max(1) }).nullable(),
  /** What it can say when the condition is met (only then does it enter the prompt). */
  revela_en: Texto.nullable(),
}).refine((s) => (s.revela_si === null) === (s.revela_en === null), {
  message: "revela_si y revela_en van juntos (o los dos null)", path: ["revela_en"],
});

export const ReglasRapport = z.strictObject({
  objetivo: z.number().positive(),
  puntos_hecho: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]),
  seguimiento: z.number().min(0),
  pregunta_nueva: z.number().min(0),
  revelacion: z.number().min(0),
  bono_reciprocidad: z.number().min(0),
  empatia: z.number().min(0),
  max_preguntas_sin_compartir: z.number().int().min(1),
  max_puntos_turno: z.number().positive(),
  min_hechos: z.number().int().min(0),
  min_compartidos: z.number().int().min(0),
  min_niveles: z.number().int().min(1).max(3),
  apertura: z.strictObject({
    nivel_2: z.strictObject({ hechos: z.number().int().min(0), compartidos: z.number().int().min(0) }),
    nivel_3: z.strictObject({ hechos: z.number().int().min(0), compartidos: z.number().int().min(0) }),
  }),
});

export const MedidorRapport = z.strictObject({
  tipo: z.literal("rapport"),
  id: IdLocal,
  etiqueta_es: Texto,
  reglas: ReglasRapport,
});

export const Objecion = z.strictObject({
  id: IdLocal,
  /** What worries the NPC or what it wants to know (English, NPC and judge prompt). */
  npc_en: Texto,
  /** What resolves it (English, for the judge). */
  la_resuelve_en: Texto,
});

export const PasoObjetivo = z.strictObject({
  id: IdLocal,
  etiqueta_es: Texto,
  puntos: z.number().positive(),
  obligatorio: z.boolean(),
  senal: z.union([z.strictObject({ acto: z.enum(ACTOS_PASO) }), z.strictObject({ objecion: IdLocal })]),
  pista_es: Texto.nullable(),
  frases_en: Frases,
});

/** pedir and convencer have a scorer; negociar stays reserved (the server rejects it clearly until it has one). */
export const MedidorObjetivo = z.strictObject({
  tipo: z.enum(["pedir", "convencer", "negociar"]),
  id: IdLocal,
  etiqueta_es: Texto,
  pista_es: Texto.nullable(),
  /** What the player came looking for, told to the NPC (English). Does NOT enter the prompt before this phase. */
  tema_en: Texto,
  /** What the NPC wants in this part (English). */
  lo_que_el_npc_quiere_en: Texto,
  /** How the NPC opens the topic at the start of this phase (the BRIDGE, in its own words; English). */
  puente_en: Texto,
  objeciones: z.array(Objecion),
  pasos: z.array(PasoObjetivo).min(1),
}).superRefine((m, ctx) => {
  const ids = new Set(m.objeciones.map((o) => o.id));
  m.pasos.forEach((p, i) => {
    if ("objecion" in p.senal && !ids.has(p.senal.objecion)) ctx.addIssue({ code: "custom", path: ["pasos", i, "senal", "objecion"], message: `objeción "${p.senal.objecion}" no está en objeciones` });
  });
  if (!m.pasos.some((p) => p.obligatorio)) ctx.addIssue({ code: "custom", path: ["pasos"], message: "hace falta al menos un paso obligatorio" });
});

export const FichaConversacion = z.strictObject({
  id: idOf("conversacion"),
  npc: NpcId,
  /** How it behaves in free conversation, besides its persona (English, server only). */
  persona_extra_en: Texto,
  /** World state the NPC knows (English): keeps it from making things up (report 2.4). */
  mundo_en: Texto,
  hechos: z.array(HechoNpc).min(1),
  jugador: z.array(DatoJugador).min(1),
  secretos: z.array(Secreto),
  /** In order: the first starts active; when it fills, the next opens. First, the getting-to-know one. */
  medidores: z.tuple([MedidorRapport, MedidorObjetivo]),
  ayuda: z.strictObject({
    conocer: z.strictObject({ pista_es: Texto, frases_por_nivel: z.strictObject({ "1": Frases, "2": Frases, "3": Frases }) }),
    reciprocidad: z.strictObject({ pista_es: Texto, frases_en: Frases }),
    recado_temprano: z.strictObject({ pista_es: Texto }),
    l1: z.strictObject({ pista_es: Texto }),
    dato_real: z.strictObject({ pista_es: Texto }),
  }),
  /** Turns without progress for the hint (step 1) and for the suggested phrases (step 2). */
  ayuda_tras_turnos: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  /** Calibrated examples for the judge (learner turns with their correct label, report 2.3). */
  ejemplos_juez: z.array(z.strictObject({ jugador: Texto, npc: Texto, etiquetas: Texto })).max(15),
  // book-mode slice-1 (D-803): names the `saber` that the goal meter (pedir/convencer) represents, so that
  //   a fixture can assert which deduction closes this conversation (AC11). `.optional()` INSIDE the strictObject
  //   (D-801): the farmer universe omits it. It is NOT a new conversation type (ADR-027 still holds); the terminal state is
  //   the goal meter filling, and this field only *names* it. M4 SEAM: the gate requires that it resolve to a saber.
  deduccion_objetivo: SaberId.optional(),
  estado: EstadoRevision,
}).superRefine((f, ctx) => {
  const hechos = new Set<string>();
  f.hechos.forEach((h, i) => {
    if (hechos.has(h.id)) ctx.addIssue({ code: "custom", path: ["hechos", i, "id"], message: `hecho "${h.id}" repetido` });
    hechos.add(h.id);
  });
  const datos = new Set<string>();
  f.jugador.forEach((d, i) => {
    if (datos.has(d.id)) ctx.addIssue({ code: "custom", path: ["jugador", i, "id"], message: `dato "${d.id}" repetido` });
    datos.add(d.id);
  });
  const [rapport, objetivo] = f.medidores;
  if (rapport.id === objetivo.id) ctx.addIssue({ code: "custom", path: ["medidores", 1, "id"], message: "los medidores necesitan ids distintos" });
  if (rapport.reglas.min_hechos > f.hechos.length) ctx.addIssue({ code: "custom", path: ["medidores", 0, "reglas", "min_hechos"], message: "pide más hechos de los que tiene la ficha" });
  if (rapport.reglas.min_compartidos > f.jugador.length) ctx.addIssue({ code: "custom", path: ["medidores", 0, "reglas", "min_compartidos"], message: "pide más datos del jugador de los que tiene la ficha" });
  const medidores = new Set([rapport.id, objetivo.id]);
  f.secretos.forEach((s, i) => {
    if (s.revela_si && !medidores.has(s.revela_si.medidor)) ctx.addIssue({ code: "custom", path: ["secretos", i, "revela_si", "medidor"], message: `medidor "${s.revela_si.medidor}" no existe` });
  });
  if (f.ayuda_tras_turnos[1] < f.ayuda_tras_turnos[0]) ctx.addIssue({ code: "custom", path: ["ayuda_tras_turnos"], message: "el escalón 2 no puede llegar antes que el 1" });
});
export type FichaConversacion = z.infer<typeof FichaConversacion>;
