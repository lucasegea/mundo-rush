// Conversation sheet (content, @lg/content-schema) → encounter definition for the pure engine (@lg/core/conversation).
// The schema already validated the shape; createEncounter re-checks what the engine needs (and clearly rejects a meter type
// with no scorer, e.g. `negociar` until it exists).
import { createEncounter, type EncounterDef, type GoalMeterDef, type MeterDef, type RapportMeterDef } from "@lg/core/conversation";
import type { FichaConversacion } from "@lg/content-schema";

const GOAL_KIND = { pedir: "request", convencer: "persuasion", negociar: "negotiation" } as const satisfies Record<string, GoalMeterDef["kind"]>;

export function encounterFromSheet(f: FichaConversacion): EncounterDef {
  const [rapport, goal] = f.medidores;
  const r = rapport.reglas;
  const rapportDef: RapportMeterDef = {
    kind: "rapport", id: rapport.id, label: rapport.etiqueta_es,
    rules: {
      target: r.objetivo, factPoints: r.puntos_hecho, followUp: r.seguimiento, newQuestion: r.pregunta_nueva,
      disclosure: r.revelacion, reciprocityBonus: r.bono_reciprocidad, empathy: r.empatia,
      maxQuestionsWithoutSharing: r.max_preguntas_sin_compartir, maxPointsPerTurn: r.max_puntos_turno,
      minFacts: r.min_hechos, minShares: r.min_compartidos, minTiers: r.min_niveles,
      unlock: {
        tier2: { facts: r.apertura.nivel_2.hechos, shares: r.apertura.nivel_2.compartidos },
        tier3: { facts: r.apertura.nivel_3.hechos, shares: r.apertura.nivel_3.compartidos },
      },
    },
  };
  const goalDef: GoalMeterDef = {
    kind: GOAL_KIND[goal.tipo], id: goal.id, label: goal.etiqueta_es, hint: goal.pista_es,
    steps: goal.pasos.map((p) => ({
      id: p.id, label: p.etiqueta_es, points: p.puntos, required: p.obligatorio, hint: p.pista_es, phrases: p.frases_en,
      signal: "acto" in p.senal ? { act: p.senal.acto } : { objection: p.senal.objecion },
    })),
  };
  const meters: MeterDef[] = [rapportDef, goalDef];
  return createEncounter({
    id: f.id,
    npcId: f.npc,
    facts: f.hechos.map((h) => ({ id: h.id, tier: h.nivel, label: h.etiqueta_es })),
    playerSlots: f.jugador.map((d) => ({ id: d.id, label: d.etiqueta_es })),
    meters,
    help: {
      rapport: { hint: f.ayuda.conocer.pista_es, phrasesByTier: { 1: f.ayuda.conocer.frases_por_nivel["1"], 2: f.ayuda.conocer.frases_por_nivel["2"], 3: f.ayuda.conocer.frases_por_nivel["3"] } },
      reciprocity: { hint: f.ayuda.reciprocidad.pista_es, phrases: f.ayuda.reciprocidad.frases_en },
      earlyErrand: { hint: f.ayuda.recado_temprano.pista_es },
      l1: { hint: f.ayuda.l1.pista_es },
      realData: { hint: f.ayuda.dato_real.pista_es },
    },
    helpAfterTurns: f.ayuda_tras_turnos,
  });
}
