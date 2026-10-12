// Motor de medidores de conversación (ADR-027; informe de investigación 2.3-2.5). Puro y determinístico: entra la definición
// del encuentro (dato), su estado y las etiquetas de UN intercambio; sale el estado nuevo y los eventos. El juez nunca
// da un número: el código suma por reglas editables. La máquina del encuentro es la lista de medidores en orden
// (conocerse → objetivo → …); el último lleno es el ÉXITO, que el servidor convierte en una acción del juego.
// Un tipo de medidor nuevo se enchufa con un puntuador en SCORERS (ver ADR-027 "Cómo se agrega un medidor").
import type {
  DialogueAct, EncounterDef, EncounterEvent, EncounterNotice, EncounterState, ExchangeLabels, GoalMeterDef, ConversationHelpLevel,
  MeterDef, MeterKind, MeterState, ObjectionQuality, RapportMeterDef, RapportRules, Tier,
} from "./types.ts";

export class EncounterDefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncounterDefError";
  }
}

/** Lo que un intercambio aporta, calculado una vez por el motor y compartido con el puntuador del medidor activo. */
export interface ExchangeDelta {
  readonly labels: ExchangeLabels;
  /** Hechos del NPC nuevos, de niveles ya abiertos (los de niveles cerrados no cuentan). */
  readonly newFacts: readonly string[];
  readonly newShares: readonly string[];
  readonly disclosure: boolean;
  readonly question: boolean;
}

export interface ScoreResult {
  readonly meter: MeterState;
  readonly delta: number;
  readonly events: readonly EncounterEvent[];
}

/** Puntuador de un tipo de medidor: suma por código y dice cuánto se ve lleno. */
export interface Scorer<M extends MeterDef = MeterDef> {
  score(def: EncounterDef, meter: M, state: EncounterState, current: MeterState, delta: ExchangeDelta): ScoreResult;
  /** Llenado visible 0..1 (sin números en el HUD: solo el ancho de la barra). */
  fill(def: EncounterDef, meter: M, state: EncounterState, current: MeterState): number;
  isFull(def: EncounterDef, meter: M, state: EncounterState, current: MeterState): boolean;
}

const QUESTION_ACTS: readonly DialogueAct[] = ["personal_question", "follow_up_question", "repeated_question"];
const has = (labels: ExchangeLabels, act: DialogueAct): boolean => labels.acts.includes(act);
const QUALITY_RANK: Record<ObjectionQuality, number> = { no: 0, partial: 1, yes: 2 };

const factTier = (def: EncounterDef, id: string): Tier | null => def.facts.find((f) => f.id === id)?.tier ?? null;
const learnedOfTier = (def: EncounterDef, learned: readonly string[], tier: Tier): number =>
  learned.filter((id) => factTier(def, id) === tier).length;
const tiersTouched = (def: EncounterDef, learned: readonly string[]): number =>
  new Set(learned.map((id) => factTier(def, id))).size;

// ---------- rapport ----------

const rapportStructuralMet = (def: EncounterDef, rules: RapportRules, state: EncounterState): boolean =>
  state.factsLearned.length >= rules.minFacts && state.playerShared.length >= rules.minShares
  && tiersTouched(def, state.factsLearned) >= rules.minTiers;

export const rapportScorer: Scorer<RapportMeterDef> = {
  score(def, meter, state, current, d) {
    const r = meter.rules;
    const l = d.labels;
    let pts = 0;
    // Regla de reciprocidad: pasado el límite de preguntas seguidas sin contar nada, nada suma hasta que comparta.
    const stalled = state.stalled && !d.disclosure;
    if (!stalled) {
      for (const id of d.newFacts) pts += r.factPoints[(factTier(def, id) ?? 1) - 1] ?? 0;
      if (has(l, "follow_up_question")) pts += r.followUp;
      else if (has(l, "personal_question")) pts += r.newQuestion;
      if (has(l, "empathy_reaction")) pts += r.empathy;
    }
    if (d.disclosure) pts += state.npcJustRevealed ? r.disclosure + r.reciprocityBonus : r.disclosure;
    const delta = Math.min(pts, r.maxPointsPerTurn);
    return { meter: { ...current, points: current.points + delta }, delta, events: delta > 0 ? [{ type: "points", meter: meter.id, delta }] : [] };
  },
  fill(def, meter, state, current) {
    const raw = Math.min(1, current.points / meter.rules.target);
    // Sin las condiciones de estructura la barra no llega al tope: se ve "casi", nunca "llena y cerrada".
    return rapportStructuralMet(def, meter.rules, state) ? raw : Math.min(raw, 0.9);
  },
  isFull(def, meter, state, current) {
    return current.points >= meter.rules.target && rapportStructuralMet(def, meter.rules, state);
  },
};

// ---------- objetivo por pasos (pedir, convencer) ----------

const stepQualityFrom = (step: GoalMeterDef["steps"][number], l: ExchangeLabels): ObjectionQuality => {
  if ("act" in step.signal) return has(l, step.signal.act) ? "yes" : "no";
  const id = step.signal.objection;
  return l.objections.filter((o) => o.id === id).reduce<ObjectionQuality>((best, o) => (QUALITY_RANK[o.quality] > QUALITY_RANK[best] ? o.quality : best), "no");
};

const stepPoints = (meter: GoalMeterDef, steps: Readonly<Record<string, ObjectionQuality>>): number =>
  meter.steps.reduce((n, s) => n + s.points * (steps[s.id] === "yes" ? 1 : steps[s.id] === "partial" ? 0.5 : 0), 0);

export const stepsScorer: Scorer<GoalMeterDef> = {
  score(_def, meter, _state, current, d) {
    const steps: Record<string, ObjectionQuality> = { ...current.steps };
    const events: EncounterEvent[] = [];
    for (const s of meter.steps) {
      const q = stepQualityFrom(s, d.labels);
      if (QUALITY_RANK[q] > QUALITY_RANK[steps[s.id] ?? "no"]) {
        steps[s.id] = q;
        events.push({ type: "stepDone", meter: meter.id, step: s.id, quality: q });
      }
    }
    const points = stepPoints(meter, steps);
    const delta = points - current.points;
    if (delta > 0) events.push({ type: "points", meter: meter.id, delta });
    return { meter: { ...current, points, steps }, delta, events };
  },
  fill(_def, meter, _state, current) {
    const total = meter.steps.reduce((n, s) => n + s.points, 0);
    return total > 0 ? Math.min(1, current.points / total) : 0;
  },
  isFull(_def, meter, _state, current) {
    return meter.steps.filter((s) => s.required).every((s) => current.steps[s.id] === "yes");
  },
};

/** Tipo de medidor → puntuador. `negotiation` todavía no tiene: el esquema lo acepta, createEncounter lo rechaza. */
export const SCORERS: Partial<Record<MeterKind, Scorer>> = {
  rapport: rapportScorer as Scorer,
  request: stepsScorer as Scorer,
  persuasion: stepsScorer as Scorer,
};

const scorerFor = (m: MeterDef): Scorer => {
  const s = SCORERS[m.kind];
  if (!s) throw new EncounterDefError(`el medidor "${m.id}" es de tipo ${m.kind}, que todavía no tiene puntuador`);
  return s;
};

// ---------- definición y estado ----------

const uniq = (ids: readonly string[], what: string): void => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new EncounterDefError(`${what} "${id}" repetido`);
    seen.add(id);
  }
};

/** Valida la definición (ids únicos, puntuadores, objeciones y reglas coherentes). Devuelve la misma definición. */
export function createEncounter(def: EncounterDef): EncounterDef {
  if (def.meters.length === 0) throw new EncounterDefError("un encuentro necesita al menos un medidor");
  uniq(def.facts.map((f) => f.id), "hecho");
  uniq(def.playerSlots.map((p) => p.id), "dato del jugador");
  uniq(def.meters.map((m) => m.id), "medidor");
  for (const m of def.meters) {
    scorerFor(m);
    if (m.kind === "rapport") {
      if (m.rules.target <= 0) throw new EncounterDefError(`el medidor "${m.id}" necesita target > 0`);
      if (m.rules.minFacts > def.facts.length) throw new EncounterDefError(`el medidor "${m.id}" pide más hechos de los que hay`);
      if (m.rules.minShares > def.playerSlots.length) throw new EncounterDefError(`el medidor "${m.id}" pide más datos del jugador de los que hay`);
    } else {
      if (!m.steps.some((s) => s.required)) throw new EncounterDefError(`el medidor "${m.id}" necesita al menos un paso obligatorio`);
      uniq(m.steps.map((s) => s.id), `paso de ${m.id}`);
    }
  }
  return def;
}

const emptyMeter = (): MeterState => ({ points: 0, full: false, steps: {} });

export const initialEncounterState = (def: EncounterDef): EncounterState => ({
  active: 0, meters: def.meters.map(emptyMeter), factsLearned: [], playerShared: [], unlockedTier: 1,
  questionStreak: 0, stalled: false, npcJustRevealed: false, quietTurns: 0, help: 0, notice: null,
  stats: { exchanges: 0, l2Turns: 0, l1Turns: 0, questions: 0, followUps: 0, disclosures: 0, stalls: 0, helpShown: 0 },
});

/**
 * Un estado guardado sirve si calza con la definición actual (mismos medidores; los ids que ya no existen se descartan).
 * Si la ficha cambió de forma (otros medidores), null: el encuentro arranca de cero.
 */
export function reviveEncounterState(def: EncounterDef, raw: unknown): EncounterState | null {
  if (raw === null || typeof raw !== "object") return null;
  const s = raw as Partial<EncounterState>;
  if (!Array.isArray(s.meters) || s.meters.length !== def.meters.length || typeof s.active !== "number") return null;
  const base = initialEncounterState(def);
  const facts = new Set(def.facts.map((f) => f.id));
  const slots = new Set(def.playerSlots.map((p) => p.id));
  return {
    ...base,
    active: Math.max(0, Math.min(def.meters.length, Math.trunc(s.active))),
    meters: s.meters.map((m) => ({ points: Number(m?.points) || 0, full: m?.full === true, steps: { ...(m?.steps ?? {}) } })),
    factsLearned: (s.factsLearned ?? []).filter((id) => facts.has(id)),
    playerShared: (s.playerShared ?? []).filter((id) => slots.has(id)),
    unlockedTier: s.unlockedTier === 2 || s.unlockedTier === 3 ? s.unlockedTier : 1,
    stats: { ...base.stats, ...(s.stats ?? {}) },
  };
}

const rapportOf = (def: EncounterDef): RapportMeterDef | undefined => def.meters.find((m): m is RapportMeterDef => m.kind === "rapport");

/** Niveles de hechos abiertos según lo aprendido y compartido (reciprocidad escalonada, informe 2.5.B). */
function unlockedTierFor(def: EncounterDef, learned: readonly string[], shares: number, current: Tier): Tier {
  const r = rapportOf(def)?.rules;
  if (!r) return 3;
  let tier = current;
  if (tier === 1 && learnedOfTier(def, learned, 1) >= r.unlock.tier2.facts && shares >= r.unlock.tier2.shares) tier = 2;
  if (tier === 2 && learnedOfTier(def, learned, 2) >= r.unlock.tier3.facts && shares >= r.unlock.tier3.shares) tier = 3;
  return tier;
}

const helpLevelFor = (def: EncounterDef, quiet: number): ConversationHelpLevel =>
  quiet >= def.helpAfterTurns[1] ? 2 : quiet >= def.helpAfterTurns[0] ? 1 : 0;

export interface ExchangeResult {
  readonly state: EncounterState;
  readonly events: readonly EncounterEvent[];
}

/** Aplica las etiquetas de un intercambio. El encuentro terminado no cambia. */
export function applyExchange(def: EncounterDef, state: EncounterState, labels: ExchangeLabels): ExchangeResult {
  if (state.active >= def.meters.length) return { state, events: [] };
  const stats = { ...state.stats, exchanges: state.stats.exchanges + 1 };
  const meterDef = def.meters[state.active] as MeterDef;

  // Seguridad: nunca suma ni resta; el aviso pide contar cosas del PERSONAJE (nunca datos reales).
  if (labels.safety !== "none") {
    const notice: EncounterNotice = labels.safety === "real_personal_data" ? "real_data" : state.notice;
    return quiet(def, { ...state, stats, notice }, [{ type: "safety", flag: labels.safety }]);
  }
  // L1 o turno no comprendido: no suma ni resta; la ayuda salta al escalón de frases sugeridas.
  if (labels.language === "L1" || labels.comprehensible === 0) {
    const next: EncounterState = { ...state, stats: { ...stats, l1Turns: stats.l1Turns + (labels.language === "L1" ? 1 : 0) }, notice: labels.language === "L1" ? "l1" : state.notice, quietTurns: state.quietTurns + 1, help: 2 };
    return { state: countHelp(state, next), events: [] };
  }

  const facts = new Set(def.facts.map((f) => f.id));
  const slots = new Set(def.playerSlots.map((p) => p.id));
  const newFacts = [...new Set(labels.npcFacts)].filter((id) => facts.has(id) && !state.factsLearned.includes(id) && (factTier(def, id) ?? 9) <= state.unlockedTier);
  const newShares = [...new Set(labels.playerFacts)].filter((id) => slots.has(id) && !state.playerShared.includes(id));
  const disclosure = has(labels, "self_disclosure") || newShares.length > 0;
  const question = QUESTION_ACTS.some((a) => has(labels, a));
  const delta: ExchangeDelta = { labels, newFacts, newShares, disclosure, question };

  const scorer = scorerFor(meterDef);
  const scored = scorer.score(def, meterDef, state, state.meters[state.active] as MeterState, delta);
  const events: EncounterEvent[] = [...newFacts.map((id) => ({ type: "factLearned" as const, id })), ...newShares.map((id) => ({ type: "playerShared" as const, id })), ...scored.events];

  const factsLearned = [...state.factsLearned, ...newFacts];
  const playerShared = [...state.playerShared, ...newShares];
  const unlockedTier = unlockedTierFor(def, factsLearned, playerShared.length, state.unlockedTier);
  if (unlockedTier !== state.unlockedTier) events.push({ type: "tierUnlocked", tier: unlockedTier });

  // Reciprocidad: contar algo propio corta la racha; una pregunta sin contar nada la alarga.
  const questionStreak = disclosure ? 0 : question ? state.questionStreak + 1 : state.questionStreak;
  const limit = meterDef.kind === "rapport" ? meterDef.rules.maxQuestionsWithoutSharing : Infinity;
  const stalled = questionStreak >= limit;
  if (stalled && !state.stalled) events.push({ type: "stalled" });
  if (!stalled && state.stalled) events.push({ type: "unstalled" });

  const earlyErrand = meterDef.kind === "rapport" && has(labels, "states_errand");
  const progressed = scored.delta > 0 || newFacts.length > 0 || newShares.length > 0;
  const quietTurns = progressed ? 0 : state.quietTurns + 1;
  let next: EncounterState = {
    ...state,
    meters: state.meters.map((m, i) => (i === state.active ? scored.meter : m)),
    factsLearned, playerShared, unlockedTier, questionStreak, stalled,
    npcJustRevealed: newFacts.length > 0, quietTurns,
    help: progressed ? 0 : helpLevelFor(def, quietTurns),
    notice: earlyErrand ? "early_errand" : null,
    stats: {
      ...stats, l2Turns: stats.l2Turns + 1, questions: stats.questions + (question ? 1 : 0),
      followUps: stats.followUps + (has(labels, "follow_up_question") ? 1 : 0),
      disclosures: stats.disclosures + (disclosure ? 1 : 0), stalls: stats.stalls + (stalled && !state.stalled ? 1 : 0),
    },
  };
  next = countHelp(state, next);

  // ¿Se llenó el medidor activo? Pasa al siguiente (o termina el encuentro).
  const current = next.meters[next.active] as MeterState;
  if (scorer.isFull(def, meterDef, next, current)) {
    const meters = next.meters.map((m, i) => (i === next.active ? { ...m, full: true } : m));
    const active = next.active + 1;
    const to = def.meters[active]?.id ?? null;
    events.push({ type: "phaseChanged", from: meterDef.id, to });
    // La racha de preguntas es de la fase de conocerse: no frena el objetivo.
    next = { ...next, meters, active, questionStreak: 0, stalled: false, quietTurns: 0, help: 0 };
    if (to === null) events.push({ type: "complete" });
  }
  return { state: next, events };
}

/** Un turno sin progreso (seguridad): cuenta para la escalera de ayuda. */
function quiet(def: EncounterDef, state: EncounterState, events: EncounterEvent[]): ExchangeResult {
  const quietTurns = state.quietTurns + 1;
  return { state: countHelp(state, { ...state, quietTurns, help: helpLevelFor(def, quietTurns) }), events };
}

/** Cuenta cada vez que la ayuda sube de escalón (estadística "andamiajes usados"). */
const countHelp = (prev: EncounterState, next: EncounterState): EncounterState =>
  next.help > prev.help ? { ...next, stats: { ...next.stats, helpShown: next.stats.helpShown + 1 } } : next;

// ---------- vista para el HUD ----------

export interface EncounterHelp {
  readonly level: ConversationHelpLevel;
  readonly hint: string | null;
  readonly phrases: readonly string[];
}

export interface EncounterView {
  readonly activeMeter: string | null;
  readonly meters: readonly { readonly id: string; readonly kind: MeterKind; readonly label: string; readonly fill: number; readonly status: "active" | "locked" | "full" }[];
  readonly facts: readonly { readonly id: string; readonly label: string }[];
  readonly stalled: boolean;
  readonly notice: EncounterNotice;
  readonly help: EncounterHelp;
}

const MAX_PHRASES = 3;

/** Contenido de la ayuda para el contexto actual (el escalón lo decide `state.help` o el reloj del cliente). */
export function encounterHelp(def: EncounterDef, state: EncounterState): EncounterHelp {
  const meter = def.meters[state.active];
  const level = state.help;
  if (!meter) return { level: 0, hint: null, phrases: [] };
  const rapportPhrases = def.help.rapport.phrasesByTier[state.unlockedTier].slice(0, MAX_PHRASES);
  if (state.notice === "real_data") return { level: Math.max(level, 1) as ConversationHelpLevel, hint: def.help.realData.hint, phrases: [] };
  if (state.stalled) return { level: Math.max(level, 1) as ConversationHelpLevel, hint: def.help.reciprocity.hint, phrases: def.help.reciprocity.phrases.slice(0, MAX_PHRASES) };
  if (state.notice === "early_errand") return { level: Math.max(level, 1) as ConversationHelpLevel, hint: def.help.earlyErrand.hint, phrases: rapportPhrases };
  if (meter.kind === "rapport") {
    return { level, hint: state.notice === "l1" ? def.help.l1.hint : def.help.rapport.hint, phrases: rapportPhrases };
  }
  const ms = state.meters[state.active] as MeterState;
  const next = meter.steps.find((s) => s.required && ms.steps[s.id] !== "yes") ?? meter.steps.find((s) => ms.steps[s.id] !== "yes");
  return {
    level,
    hint: state.notice === "l1" ? def.help.l1.hint : next?.hint ?? meter.hint,
    phrases: (next?.phrases ?? []).slice(0, MAX_PHRASES),
  };
}

export function encounterView(def: EncounterDef, state: EncounterState): EncounterView {
  return {
    activeMeter: def.meters[state.active]?.id ?? null,
    meters: def.meters.map((m, i) => {
      const ms = state.meters[i] as MeterState;
      const status = i < state.active || ms.full ? "full" : i === state.active ? "active" : "locked";
      const fill = status === "full" ? 1 : status === "locked" ? 0 : scorerFor(m).fill(def, m, state, ms);
      return { id: m.id, kind: m.kind, label: m.label, fill: Math.round(fill * 100) / 100, status };
    }),
    facts: state.factsLearned.map((id) => ({ id, label: def.facts.find((f) => f.id === id)?.label ?? id })),
    stalled: state.stalled,
    notice: state.notice,
    help: encounterHelp(def, state),
  };
}

/** ¿El encuentro terminó (todos los medidores llenos)? */
export const encounterComplete = (def: EncounterDef, state: EncounterState): boolean => state.active >= def.meters.length;
