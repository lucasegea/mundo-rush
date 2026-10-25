// Ficha de conversación de un NPC (ADR-027; informe de investigación 2.5.C). La "cárcel blanda" del NPC en conversación libre:
// persona extra, hechos por nivel de intimidad, lo que el jugador puede contar de SU PERSONAJE, secretos con condición,
// medidores en orden (conocerse → objetivo) y la escalera de ayuda. Solo llega al servidor: el inglés (`*_en`) arma el
// prompt del NPC y del juez; el español (`*_es`) es lo que el HUD muestra (llega al cliente por el protocolo).
// Lo del objetivo (recado, objeciones) entra al prompt del NPC RECIÉN cuando el medidor de conocerse se llena.
import { z } from "zod";
import { idOf, NpcId, SaberId } from "../ids.ts";
import { EstadoRevision } from "./common.ts";

/** Actos del juez que un paso del objetivo puede pedir (= DIALOGUE_ACTS de @lg/core, que content-schema no importa). */
export const ACTOS_PASO = ["states_errand", "polite_request", "gives_reason", "empathy_reaction", "self_disclosure"] as const;

const IdLocal = z.string().regex(/^[a-z][a-z0-9_]*$/, { message: "id local en snake_case" });
const Texto = z.string().trim().min(1);
const Frases = z.array(Texto).max(6);

export const HechoNpc = z.strictObject({
  id: IdLocal,
  nivel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Cómo lo sabe el NPC (inglés, va al prompt). */
  valor_en: Texto,
  /** Lo que el HUD muestra en "Lo que sabés de…". */
  etiqueta_es: Texto,
});

export const DatoJugador = z.strictObject({
  id: IdLocal,
  /** Qué cuenta el jugador de su personaje (inglés, para el juez). Nunca datos reales. */
  descripcion_en: Texto,
  etiqueta_es: Texto,
});

export const Secreto = z.strictObject({
  id: IdLocal,
  /** Qué hace el NPC si le preguntan antes de tiempo (inglés, siempre en el prompt). */
  desvio_en: Texto,
  /** null: nunca se revela en esta ficha. Si no, se revela con el medidor llenado al menos `llenado_min`. */
  revela_si: z.strictObject({ medidor: IdLocal, llenado_min: z.number().min(0).max(1) }).nullable(),
  /** Lo que puede decir cuando la condición se cumple (solo entonces entra al prompt). */
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
  /** Lo que al NPC le preocupa o quiere saber (inglés, prompt del NPC y del juez). */
  npc_en: Texto,
  /** Qué la resuelve (inglés, para el juez). */
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

/** pedir y convencer tienen puntuador; negociar queda reservado (el servidor lo rechaza claro hasta tenerlo). */
export const MedidorObjetivo = z.strictObject({
  tipo: z.enum(["pedir", "convencer", "negociar"]),
  id: IdLocal,
  etiqueta_es: Texto,
  pista_es: Texto.nullable(),
  /** Lo que el jugador vino a buscar, contado al NPC (inglés). NO entra al prompt antes de esta fase. */
  tema_en: Texto,
  /** Lo que el NPC quiere en esta parte (inglés). */
  lo_que_el_npc_quiere_en: Texto,
  /** Cómo abre el NPC el tema al empezar esta fase (el PUENTE, en sus palabras; inglés). */
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
  /** Cómo se comporta en conversación libre, además de su persona (inglés, solo servidor). */
  persona_extra_en: Texto,
  /** Estado del mundo que el NPC conoce (inglés): evita que invente (informe 2.4). */
  mundo_en: Texto,
  hechos: z.array(HechoNpc).min(1),
  jugador: z.array(DatoJugador).min(1),
  secretos: z.array(Secreto),
  /** En orden: el primero arranca activo; al llenarse se abre el siguiente. Primero, el de conocerse. */
  medidores: z.tuple([MedidorRapport, MedidorObjetivo]),
  ayuda: z.strictObject({
    conocer: z.strictObject({ pista_es: Texto, frases_por_nivel: z.strictObject({ "1": Frases, "2": Frases, "3": Frases }) }),
    reciprocidad: z.strictObject({ pista_es: Texto, frases_en: Frases }),
    recado_temprano: z.strictObject({ pista_es: Texto }),
    l1: z.strictObject({ pista_es: Texto }),
    dato_real: z.strictObject({ pista_es: Texto }),
  }),
  /** Turnos sin progreso para la pista (escalón 1) y para las frases sugeridas (escalón 2). */
  ayuda_tras_turnos: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  /** Ejemplos calibrados para el juez (turnos de aprendices con su etiqueta correcta, informe 2.3). */
  ejemplos_juez: z.array(z.strictObject({ jugador: Texto, npc: Texto, etiquetas: Texto })).max(15),
  // book-mode slice-1 (D-803): nombra el `saber` que el medidor de objetivo (pedir/convencer) representa, para que
  //   un fixture pueda afirmar qué deducción cierra esta conversación (AC11). `.optional()` INSIDE el strictObject
  //   (D-801): la campesino la omite. NO es un tipo de conversación nuevo (ADR-027 sigue); el estado terminal es el
  //   medidor de objetivo llenándose, y este campo solo lo *nombra*. M4 SEAM: el gate exige que resuelva a un saber.
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
