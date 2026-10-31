// A2 (ADR-027): conversation meters engine. Rules from the the research 2.4-2.5 report: follow-up questions
// are worth more than a new question, reciprocity rule (consecutive questions without sharing anything slow the meter),
// repeating adds nothing, facts open by tier, L1 and safety add nothing, the goal opens when rapport fills
// and the code marks success. Pure: no clock or randomness.
import { describe, expect, test } from "vitest";
import {
  applyExchange, createEncounter, EncounterDefError, encounterComplete, encounterHelp, encounterView, initialEncounterState,
  reviveEncounterState, SCORERS,
  type EncounterDef, type EncounterState, type ExchangeLabels,
} from "../src/index";

const DEF: EncounterDef = createEncounter({
  id: "CONV-TEST",
  npcId: "NPC-TEST",
  facts: [
    { id: "name", tier: 1, label: "Se llama Tom" },
    { id: "corn", tier: 1, label: "Cultiva maíz" },
    { id: "barn", tier: 1, label: "El granero era de su padre" },
    { id: "grandson", tier: 2, label: "Tiene un nieto de tu edad" },
    { id: "dog", tier: 2, label: "Vive con su perro" },
    { id: "quiet", tier: 3, label: "Extraña las fiestas del Cruce" },
  ],
  playerSlots: [
    { id: "name", label: "tu nombre" }, { id: "origin", label: "de dónde venís" }, { id: "crew", label: "tu trabajo" },
    { id: "likes", label: "algo que te gusta" },
  ],
  meters: [
    {
      kind: "rapport", id: "know", label: "Conocer a Tom",
      rules: {
        target: 12, factPoints: [2, 3, 4], followUp: 2, newQuestion: 1, disclosure: 1, reciprocityBonus: 1, empathy: 1,
        maxQuestionsWithoutSharing: 2, maxPointsPerTurn: 6, minFacts: 3, minShares: 2, minTiers: 2,
        unlock: { tier2: { facts: 2, shares: 1 }, tier3: { facts: 1, shares: 2 } },
      },
    },
    {
      kind: "request", id: "posts", label: "Conseguir lo que viniste a buscar", hint: "Pedile los postes.",
      steps: [
        { id: "ask", label: "pedirlo", points: 2, required: true, signal: { act: "polite_request" }, hint: "Pedilo con amabilidad.", phrases: ["Could I borrow some posts?"] },
        { id: "why", label: "para qué", points: 2, required: true, signal: { objection: "what_for" }, hint: "Contale para qué.", phrases: ["They're for the garden fence."] },
        { id: "care", label: "cuidarlos", points: 1, required: false, signal: { objection: "care" }, hint: null, phrases: [] },
      ],
    },
  ],
  help: {
    rapport: { hint: "Preguntale por su vida.", phrasesByTier: { 1: ["How long have you lived here?"], 2: ["Do you have family here?"], 3: ["Was it different before?"] } },
    reciprocity: { hint: "Contale algo de tu personaje.", phrases: ["I'm from Argentina."] },
    earlyErrand: { hint: "Primero conocelo." },
    l1: { hint: "Probá en inglés." },
    realData: { hint: "Contá cosas de tu personaje, no datos reales." },
  },
  helpAfterTurns: [2, 3],
});

const L = (over: Partial<ExchangeLabels> = {}): ExchangeLabels => ({
  language: "L2", comprehensible: 2, acts: [], npcFacts: [], playerFacts: [], objections: [], safety: "none", ...over,
});

const run = (labels: readonly ExchangeLabels[], from: EncounterState = initialEncounterState(DEF)) =>
  labels.reduce<{ state: EncounterState; events: string[] }>((acc, l) => {
    const r = applyExchange(DEF, acc.state, l);
    return { state: r.state, events: [...acc.events, ...r.events.map((e) => e.type)] };
  }, { state: from, events: [] });

const points = (s: EncounterState, i = 0): number => s.meters[i]?.points ?? -1;

describe("rapport: cómo se llena", () => {
  test("un hecho nuevo del nivel 1 suma 2; una pregunta de seguimiento vale más que una pregunta nueva", () => {
    const followUp = run([L({ acts: ["follow_up_question"] })]).state;
    const fresh = run([L({ acts: ["personal_question"] })]).state;
    expect(points(followUp)).toBe(2);
    expect(points(fresh)).toBe(1);
    expect(points(run([L({ acts: ["personal_question"], npcFacts: ["name"] })]).state)).toBe(3);
  });

  test("contar algo propio justo después de que el NPC reveló algo suma el bono de reciprocidad", () => {
    const { state } = run([L({ acts: ["personal_question"], npcFacts: ["corn"] }), L({ acts: ["self_disclosure"], playerFacts: ["origin"] })]);
    expect(points(state)).toBe(3 + 2);
    const cold = run([L({ acts: ["self_disclosure"], playerFacts: ["origin"] })]).state;
    expect(points(cold)).toBe(1);
  });

  test("repetir algo ya preguntado no suma, y un hecho ya aprendido tampoco", () => {
    const { state } = run([L({ acts: ["personal_question"], npcFacts: ["name"] }), L({ acts: ["repeated_question"], npcFacts: ["name"] })]);
    expect(points(state)).toBe(3);
    expect(state.factsLearned).toEqual(["name"]);
  });

  test("una pregunta repetida (o una lista) anula los puntos de pregunta del mismo intercambio", () => {
    expect(points(run([L({ acts: ["personal_question", "repeated_question"] })]).state)).toBe(0);
    expect(points(run([L({ acts: ["follow_up_question", "repeated_question"] })]).state)).toBe(0);
    // The rest of the exchange still counts: a new fact adds its own share.
    expect(points(run([L({ acts: ["personal_question", "repeated_question"], npcFacts: ["name"] })]).state)).toBe(2);
  });

  test("regla de reciprocidad: tras 2 preguntas seguidas sin contar nada el medidor se frena hasta que comparta", () => {
    const qs = run([
      L({ acts: ["personal_question"], npcFacts: ["name"] }),
      L({ acts: ["personal_question"], npcFacts: ["corn"] }),
    ]);
    expect(qs.state.stalled).toBe(true);
    expect(qs.events).toContain("stalled");
    const before = points(qs.state);
    const third = applyExchange(DEF, qs.state, L({ acts: ["follow_up_question"], npcFacts: ["barn"] }));
    expect(points(third.state)).toBe(before); // slowed: adds nothing (even though the fact is learned)
    expect(third.state.factsLearned).toContain("barn");
    const share = applyExchange(DEF, third.state, L({ acts: ["self_disclosure"], playerFacts: ["crew"] }));
    expect(share.state.stalled).toBe(false);
    expect(share.events.map((e) => e.type)).toContain("unstalled");
    expect(points(share.state)).toBeGreaterThan(before);
  });

  test("tope de puntos por turno (una frase mágica no llena el medidor)", () => {
    const { state } = run([L({ acts: ["follow_up_question", "empathy_reaction", "self_disclosure"], npcFacts: ["name", "corn", "barn"], playerFacts: ["name", "origin"] })]);
    expect(points(state)).toBe(6);
  });

  test("L1 o incomprensible: no suma ni resta, y la ayuda salta a las frases sugeridas", () => {
    const { state } = run([L({ language: "L1", acts: ["personal_question"], npcFacts: ["name"] })]);
    expect(points(state)).toBe(0);
    expect(state.factsLearned).toEqual([]);
    expect(state.help).toBe(2);
    expect(state.notice).toBe("l1");
    expect(state.stats.l1Turns).toBe(1);
    expect(run([L({ comprehensible: 0, acts: ["personal_question"] })]).state.help).toBe(2);
  });

  test("seguridad: un dato personal real no suma y avisa que se cuente lo del personaje", () => {
    const r = applyExchange(DEF, initialEncounterState(DEF), L({ safety: "real_personal_data", playerFacts: ["name"], acts: ["self_disclosure"] }));
    expect(points(r.state)).toBe(0);
    expect(r.state.playerShared).toEqual([]);
    expect(r.state.notice).toBe("real_data");
    expect(r.events).toEqual([{ type: "safety", flag: "real_personal_data" }]);
    expect(encounterHelp(DEF, r.state).hint).toBe("Contá cosas de tu personaje, no datos reales.");
    const other = applyExchange(DEF, initialEncounterState(DEF), L({ safety: "inappropriate" }));
    expect(other.state.notice).toBeNull();
  });

  test("ids que no están en la ficha se descartan (el juez nunca inventa hechos)", () => {
    const { state } = run([L({ npcFacts: ["invented"], playerFacts: ["school"] })]);
    expect(state.factsLearned).toEqual([]);
    expect(state.playerShared).toEqual([]);
  });
});

describe("niveles de hechos", () => {
  test("un hecho de nivel 2 no cuenta hasta que se abre (2 hechos de nivel 1 + 1 dato compartido)", () => {
    const early = run([L({ acts: ["personal_question"], npcFacts: ["grandson"] })]).state;
    expect(early.factsLearned).toEqual([]);
    const opened = run([
      L({ acts: ["personal_question"], npcFacts: ["name"] }),
      L({ acts: ["self_disclosure"], playerFacts: ["origin"], npcFacts: ["corn"] }),
    ]);
    expect(opened.state.unlockedTier).toBe(2);
    expect(opened.events).toContain("tierUnlocked");
    const t2 = applyExchange(DEF, opened.state, L({ acts: ["follow_up_question"], npcFacts: ["grandson"] }));
    expect(t2.state.factsLearned).toContain("grandson");
    expect(points(t2.state) - points(opened.state)).toBe(3 + 2);
  });

  test("el nivel 3 pide un hecho de nivel 2 y dos datos compartidos", () => {
    const s = run([
      L({ acts: ["personal_question"], npcFacts: ["name", "corn"], playerFacts: ["origin"] }),
      L({ acts: ["follow_up_question"], npcFacts: ["grandson"] }),
    ]).state;
    expect(s.unlockedTier).toBe(2);
    const t3 = applyExchange(DEF, s, L({ acts: ["self_disclosure"], playerFacts: ["crew"] }));
    expect(t3.state.unlockedTier).toBe(3);
  });
});

/** A path that fills rapport: 3+ facts in 2 tiers, 2 shared details, 12+ points. */
const FILL_RAPPORT: readonly ExchangeLabels[] = [
  L({ acts: ["greeting", "personal_question"], npcFacts: ["name"] }),
  L({ acts: ["self_disclosure"], playerFacts: ["name"], npcFacts: ["corn"] }),
  L({ acts: ["follow_up_question"], npcFacts: ["grandson"] }),
  L({ acts: ["self_disclosure", "empathy_reaction"], playerFacts: ["origin"] }),
];

describe("fases", () => {
  test("el rapport lleno abre el medidor de objetivo; antes, la barra no pasa de 0.9", () => {
    const partial = run(FILL_RAPPORT.slice(0, 1)).state;
    expect(encounterView(DEF, partial).meters.map((m) => m.status)).toEqual(["active", "locked"]);
    const { state, events } = run(FILL_RAPPORT);
    expect(events).toContain("phaseChanged");
    expect(state.active).toBe(1);
    const view = encounterView(DEF, state);
    expect(view.meters.map((m) => [m.status, m.fill])).toEqual([["full", 1], ["active", 0]]);
    expect(view.activeMeter).toBe("posts");
  });

  test("con puntos de sobra pero sin la estructura (pocos datos propios), el rapport no se llena", () => {
    const { state } = run([
      L({ acts: ["follow_up_question", "empathy_reaction"], npcFacts: ["name", "corn"] }),
      L({ acts: ["self_disclosure"], playerFacts: ["origin"], npcFacts: ["barn"] }),
      L({ acts: ["follow_up_question", "empathy_reaction"], npcFacts: ["grandson"] }),
    ]);
    expect(points(state)).toBeGreaterThanOrEqual(12);
    expect(state.active).toBe(0);
    expect(encounterView(DEF, state).meters[0]?.fill).toBe(0.9);
  });

  test("mencionar el recado durante el rapport no suma y avisa (el NPC no habla de trabajo con desconocidos)", () => {
    const r = run([L({ acts: ["states_errand", "polite_request"] })]).state;
    expect(r.notice).toBe("early_errand");
    expect(points(r)).toBe(0);
    expect(encounterHelp(DEF, r).hint).toBe("Primero conocelo.");
  });

  test("objetivo: los pasos obligatorios en 'yes' completan el encuentro; 'partial' suma la mitad sin completar", () => {
    const rapport = run(FILL_RAPPORT).state;
    const half = applyExchange(DEF, rapport, L({ acts: ["polite_request"], objections: [{ id: "what_for", quality: "partial" }] }));
    expect(points(half.state, 1)).toBe(3);
    expect(encounterComplete(DEF, half.state)).toBe(false);
    expect(encounterHelp(DEF, half.state).hint).toBe("Contale para qué.");
    const done = applyExchange(DEF, half.state, L({ acts: ["gives_reason"], objections: [{ id: "what_for", quality: "yes" }, { id: "what_for", quality: "no" }] }));
    expect(done.events.map((e) => e.type)).toEqual(["stepDone", "points", "phaseChanged", "complete"]);
    expect(encounterComplete(DEF, done.state)).toBe(true);
    expect(encounterView(DEF, done.state).activeMeter).toBeNull();
    // Once finished, nothing changes.
    expect(applyExchange(DEF, done.state, L({ acts: ["polite_request"] })).state).toBe(done.state);
    expect(encounterHelp(DEF, done.state)).toEqual({ level: 0, hint: null, phrases: [] });
  });

  test("en el objetivo la racha de preguntas no frena (la reciprocidad es de conocerse)", () => {
    const rapport = run(FILL_RAPPORT).state;
    const s = run([L({ acts: ["personal_question"] }), L({ acts: ["personal_question"] }), L({ acts: ["personal_question"] })], rapport).state;
    expect(s.stalled).toBe(false);
  });
});

describe("escalera de ayuda", () => {
  test("2 turnos sin progreso: pista; 3: frases sugeridas; progresar la baja a 0", () => {
    const s1 = run([L({ acts: ["off_topic"] }), L({ acts: ["off_topic"] })]).state;
    expect(s1.help).toBe(1);
    expect(encounterHelp(DEF, s1)).toEqual({ level: 1, hint: "Preguntale por su vida.", phrases: ["How long have you lived here?"] });
    const s2 = applyExchange(DEF, s1, L({ acts: ["off_topic"] })).state;
    expect(s2.help).toBe(2);
    expect(s2.stats.helpShown).toBe(2);
    expect(applyExchange(DEF, s2, L({ acts: ["personal_question"], npcFacts: ["name"] })).state.help).toBe(0);
  });

  test("frenado por reciprocidad: la ayuda propone contar algo del personaje", () => {
    const s = run([L({ acts: ["personal_question"] }), L({ acts: ["personal_question"] })]).state;
    expect(encounterHelp(DEF, s)).toMatchObject({ hint: "Contale algo de tu personaje.", phrases: ["I'm from Argentina."] });
    expect(s.stats.stalls).toBe(1);
  });

  test("L1 en la fase de objetivo: pista de L1 con las frases del paso que falta", () => {
    const rapport = run(FILL_RAPPORT).state;
    const s = applyExchange(DEF, rapport, L({ language: "L1" })).state;
    expect(encounterHelp(DEF, s)).toEqual({ level: 2, hint: "Probá en inglés.", phrases: ["Could I borrow some posts?"] });
  });
});

describe("definición y estado guardado", () => {
  test("rechaza ids repetidos, medidores sin puntuador y reglas imposibles", () => {
    expect(() => createEncounter({ ...DEF, meters: [] })).toThrow(EncounterDefError);
    expect(() => createEncounter({ ...DEF, facts: [...DEF.facts, { id: "name", tier: 1, label: "x" }] })).toThrow(/repetido/);
    const neg = { kind: "negotiation" as const, id: "deal", label: "Negociar", hint: null, steps: [{ id: "a", label: "a", points: 1, required: true, signal: { act: "polite_request" as const }, hint: null, phrases: [] }] };
    expect(() => createEncounter({ ...DEF, meters: [neg] })).toThrow(/negotiation/);
    const rapport = DEF.meters[0];
    if (rapport?.kind !== "rapport") throw new Error("fixture");
    expect(() => createEncounter({ ...DEF, meters: [{ ...rapport, rules: { ...rapport.rules, target: 0 } }] })).toThrow(/target/);
    expect(() => createEncounter({ ...DEF, meters: [{ ...rapport, rules: { ...rapport.rules, minFacts: 99 } }] })).toThrow(/hechos/);
    expect(() => createEncounter({ ...DEF, meters: [{ ...rapport, rules: { ...rapport.rules, minShares: 99 } }] })).toThrow(/datos/);
    const goal = DEF.meters[1];
    if (goal?.kind !== "request") throw new Error("fixture");
    expect(() => createEncounter({ ...DEF, meters: [{ ...goal, steps: goal.steps.map((s) => ({ ...s, required: false })) }] })).toThrow(/obligatorio/);
    expect(Object.keys(SCORERS).sort()).toEqual(["persuasion", "rapport", "request"]);
  });

  test("el estado guardado revive si calza con la ficha; si los medidores cambiaron, arranca de cero", () => {
    const s = run(FILL_RAPPORT).state;
    const revived = reviveEncounterState(DEF, JSON.parse(JSON.stringify({ ...s, factsLearned: [...s.factsLearned, "gone"] })));
    expect(revived?.active).toBe(1);
    expect(revived?.factsLearned).toEqual(s.factsLearned);
    expect(revived?.stalled).toBe(false);
    expect(reviveEncounterState(DEF, { ...s, meters: [s.meters[0]] })).toBeNull();
    expect(reviveEncounterState(DEF, null)).toBeNull();
    expect(reviveEncounterState(DEF, { meters: [{}, {}], active: 7, unlockedTier: 9 })).toMatchObject({ active: 2, unlockedTier: 1 });
  });

  test("la vista lista lo aprendido con sus etiquetas, en el orden en que se supo", () => {
    const { state } = run(FILL_RAPPORT.slice(0, 3));
    expect(encounterView(DEF, state).facts).toEqual([
      { id: "name", label: "Se llama Tom" }, { id: "corn", label: "Cultiva maíz" }, { id: "grandson", label: "Tiene un nieto de tu edad" },
    ]);
  });
});
