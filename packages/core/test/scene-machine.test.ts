// F4.1 A1: la máquina de escena de 03 §3.5.1 — cada transición, los tres temporizadores (D-130) y las invariantes
// (a)-(e), con un test de propiedades sobre secuencias aleatorias de eventos con el RNG con semilla del núcleo.
import { describe, expect, test } from "vitest";
import {
  ACTIVE_STATES, CLOCK_STATES, createRng, initialSceneSnapshot, PASS_OPTIONS, PLAYER_SUB_STATES, runScene, SCENE_EVENTS,
  SCENE_STATES, sceneStepName, sceneTransition, SPEAKING_EFFECTS,
  type PlayerSubState, type Rng, type SceneEffect, type SceneEvent, type SceneSnapshot, type SceneStateName,
} from "../src/index";

const ev = (type: SceneEvent["type"], extra: Record<string, unknown> = {}): SceneEvent => ({ type, ...extra }) as SceneEvent;
const INTERACT = ev("interact", { npcId: "NPC-INES", sceneId: "M0.1-E1", modality: "voice" });

/** Un snapshot en `state` (y `sub`) con contexto coherente: sesión y reloj como quedan al llegar ahí. */
const at = (state: SceneStateName, sub: PlayerSubState | null = null, ctx: Partial<SceneSnapshot["ctx"]> = {}): SceneSnapshot => {
  const clock = CLOCK_STATES.includes(state);
  return {
    state, sub: state === "playerTurn" ? (sub ?? "waiting") : null,
    ctx: { ...initialSceneSnapshot().ctx, npcId: "NPC-INES", sceneId: "M0.1-E1", sessionOpen: clock || state === "pretask", clockRunning: clock, ...ctx },
  };
};

const types = (effects: readonly SceneEffect[]): string[] => effects.map((e) => ("line" in e ? `${e.type}:${e.line}` : e.type));

describe("forma (lista cerrada de 03 §3.5.1)", () => {
  test("12 estados, 5 sub-estados y 26 eventos con los nombres del contrato", () => {
    expect(SCENE_STATES).toEqual(["idle", "pretask", "npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging",
      "closing", "posttask", "done", "aborted", "containment"]);
    expect(PLAYER_SUB_STATES).toEqual(["waiting", "speaking", "endPending", "passMenu", "committed"]);
    expect(SCENE_EVENTS).toHaveLength(26);
    expect(new Set(SCENE_EVENTS).size).toBe(26);
    expect(CLOCK_STATES).toEqual(["npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging"]);
    expect(ACTIVE_STATES).toEqual(["pretask", ...CLOCK_STATES]);
  });
});

// [desde, sub, evento, hacia, sub, efectos esperados (prefijo exacto)]
type Row = [SceneStateName, PlayerSubState | null, SceneEvent, SceneStateName, PlayerSubState | null, string[], Partial<SceneSnapshot["ctx"]>?];
const ROWS: Row[] = [
  ["idle", null, INTERACT, "pretask", null, ["openSession", "startPretask"]],
  ["pretask", null, ev("pretaskDone"), "pretask", null, []],
  ["pretask", null, ev("sceneReady"), "pretask", null, []],
  ["pretask", null, ev("sceneReady"), "npcOpening", null, ["startClock", "emitLine:opening"], { pretaskDone: true }],
  ["pretask", null, ev("pretaskDone"), "npcOpening", null, ["startClock", "emitLine:opening"], { sceneReady: true }],
  ["pretask", null, ev("sceneFailed", { reason: "net" }), "npcOpening", null, ["modalityChanged", "startClock", "emitLine:opening"], { pretaskDone: true }],
  ["npcOpening", null, ev("openingDone"), "playerTurn", "waiting", []],
  ["playerTurn", "waiting", ev("speechStart"), "playerTurn", "speaking", []],
  ["playerTurn", "speaking", ev("speechPause"), "playerTurn", "endPending", ["startTurnTimer"]],
  ["playerTurn", "endPending", ev("turnTimer"), "npcTurn", null, ["commitTurn", "requestNpcReply"]],
  ["playerTurn", "endPending", ev("pressDone"), "npcTurn", null, ["cancelTurnTimer", "commitTurn", "requestNpcReply"]],
  ["playerTurn", "endPending", ev("speechResume"), "playerTurn", "speaking", ["cancelTurnTimer"]],
  ["playerTurn", "waiting", ev("pressPass"), "playerTurn", "passMenu", ["showPassMenu"]],
  ["playerTurn", "endPending", ev("pressPass"), "playerTurn", "passMenu", ["cancelTurnTimer", "showPassMenu"]],
  ["playerTurn", "passMenu", ev("choose", { option: "simpler" }), "npcTurn", null, ["passOption", "commitTurn", "requestNpcReply"]],
  ["playerTurn", "passMenu", ev("choose", { option: "continue" }), "npcTurn", null, ["passOption", "commitTurn", "requestNpcReply"]],
  ["playerTurn", "passMenu", ev("choose", { option: "hint" }), "playerTurn", "waiting", ["passOption"]],
  ["playerTurn", "passMenu", ev("choose", { option: "repeat" }), "playerTurn", "waiting", ["passOption"]],
  ["npcTurn", null, ev("npcDone"), "playerTurn", "waiting", []],
  ["npcTurn", null, ev("npcDone"), "playerTurn", "waiting", [], { softCapReached: true, criteriaSatisfied: true }],
  ["npcTurn", null, ev("npcDone"), "nonConverging", null, ["emitLine:exit"], { softCapReached: true }],
  ["npcTurn", null, ev("companionSignal", { errorKey: "subject-verb:3sg-s" }), "signal", null, ["companionSignal"]],
  ["npcTurn", null, ev("criteriaMet"), "closing", null, ["closeSession", "stopClock", "emitLine:closing"]],
  ["signal", null, ev("companionDone"), "playerTurn", "waiting", []],
  ["signal", null, ev("companionDone"), "playerTurn", "waiting", [], { softCapReached: true, criteriaSatisfied: true }],
  ["signal", null, ev("companionDone"), "nonConverging", null, ["emitLine:exit"], { softCapReached: true }],
  ["nonConverging", null, ev("nonConvergingDone"), "closing", null, ["closeSession", "stopClock"]],
  ["containment", null, ev("containmentDone"), "closing", null, [], { sessionOpen: false, clockRunning: false }],
  ["closing", null, ev("closingDone"), "posttask", null, ["posttask"], { sessionOpen: false, clockRunning: false, closingReason: "criteria" }],
  ["posttask", null, ev("posttaskDone"), "done", null, ["sceneEnded"], { sessionOpen: false, clockRunning: false, closingReason: "criteria" }],
];

describe("A1: cada transición de 03 §3.5.1", () => {
  test.each(ROWS.map((r) => [`${sceneStepName({ state: r[0], sub: r[1] })} --${r[2].type}--> ${sceneStepName({ state: r[3], sub: r[4] })}`, r] as const))(
    "%s", (_name, [from, sub, event, toState, toSub, effects, ctx]) => {
      const t = sceneTransition(at(from, sub, ctx ?? {}), event);
      expect(t.changed).toBe(true);
      expect(sceneStepName(t.snapshot)).toBe(sceneStepName({ state: toState, sub: toSub }));
      expect(types(t.effects)).toEqual(effects);
    });

  test("committed es de paso: confirma el turno y sigue a npcTurn contando el turno", () => {
    const t = sceneTransition(at("playerTurn", "endPending", { turnIndex: 2 }), ev("pressDone"));
    expect(t.snapshot.ctx.turnIndex).toBe(3);
    expect(t.effects).toContainEqual({ type: "commitTurn", via: "pressDone" });
    expect(t.effects).toContainEqual({ type: "requestNpcReply", directorNote: null });
    expect(sceneTransition(at("playerTurn", "passMenu"), ev("choose", { option: "simpler" })).effects)
      .toContainEqual({ type: "requestNpcReply", directorNote: "simpler" });
  });

  test("interact guarda NPC, escena y modalidad; pretask abre la sesión (el servidor precalienta)", () => {
    const t = sceneTransition(initialSceneSnapshot(), INTERACT);
    expect(t.snapshot.ctx).toMatchObject({ npcId: "NPC-INES", sceneId: "M0.1-E1", modality: "voice", sessionOpen: true, clockRunning: false });
  });

  test("sceneFailed: la misma escena en modo texto; el reloj no corre en pretask", () => {
    let s = sceneTransition(initialSceneSnapshot(), INTERACT).snapshot;
    s = sceneTransition(s, ev("sceneFailed", { reason: "budget" })).snapshot;
    expect(s).toMatchObject({ state: "pretask", ctx: { modality: "text", clockRunning: false } });
    s = sceneTransition(s, ev("pretaskDone")).snapshot;
    expect(s).toMatchObject({ state: "npcOpening", ctx: { modality: "text", clockRunning: true } });
  });

  test("posttaskDone informa el resultado según cómo cerró", () => {
    const outcome = (reason: "criteria" | "partial" | "hardCap" | "containment") =>
      sceneTransition(at("posttask", null, { closingReason: reason, sessionOpen: false, clockRunning: false }), ev("posttaskDone")).effects;
    expect(outcome("criteria")).toEqual([{ type: "sceneEnded", outcome: "success" }]);
    expect(outcome("partial")).toEqual([{ type: "sceneEnded", outcome: "partial" }]);
    expect(outcome("hardCap")).toEqual([{ type: "sceneEnded", outcome: "hardCap" }]);
    expect(outcome("containment")).toEqual([{ type: "sceneEnded", outcome: "containment" }]);
  });

  test("criteriaMet fuera de npcTurn no transiciona: queda anotado para el próximo borde", () => {
    const t = sceneTransition(at("playerTurn", "speaking"), ev("criteriaMet"));
    expect(sceneStepName(t.snapshot)).toBe("playerTurn.speaking");
    expect(t.snapshot.ctx.criteriaSatisfied).toBe(true);
    expect(t.effects).toEqual([]);
    expect(sceneTransition(at("closing", null, { sessionOpen: false }), ev("criteriaMet")).changed).toBe(false);
  });

  test("un evento que no aplica no cambia nada", () => {
    const s = at("playerTurn", "waiting");
    const t = sceneTransition(s, ev("npcDone"));
    expect(t).toEqual({ snapshot: s, effects: [], changed: false });
    expect(sceneTransition(initialSceneSnapshot(), ev("abort")).changed).toBe(false);
    expect(sceneTransition(at("pretask"), INTERACT).changed).toBe(false);
  });
});

describe("A1: estados activos (voiceLost, budgetExhausted, safetyRisk, abort)", () => {
  const actives: [SceneStateName, PlayerSubState | null][] = [
    ["pretask", null], ["npcOpening", null], ...PLAYER_SUB_STATES.filter((s) => s !== "committed").map((s) => ["playerTurn", s] as [SceneStateName, PlayerSubState]),
    ["npcTurn", null], ["signal", null], ["nonConverging", null],
  ];

  test.each(actives)("voiceLost y budgetExhausted en %s.%s: mismo sub-estado con modality = text", (state, sub) => {
    for (const type of ["voiceLost", "budgetExhausted"] as const) {
      const s = at(state, sub);
      const t = sceneTransition(s, ev(type));
      expect(sceneStepName(t.snapshot)).toBe(sceneStepName(s));
      expect(t.snapshot.ctx.modality).toBe("text");
      expect(t.effects).toEqual([{ type: "modalityChanged", modality: "text" }]);
      expect(sceneTransition(t.snapshot, ev(type)).changed).toBe(false); // ya en texto
    }
  });

  test.each(actives)("safetyRisk en %s.%s → containment con la línea de contención, sesión y reloj cerrados", (state, sub) => {
    const t = sceneTransition(at(state, sub), ev("safetyRisk"));
    expect(t.snapshot.state).toBe("containment");
    expect(t.snapshot.ctx.sessionOpen).toBe(false);
    expect(types(t.effects).at(-1)).toBe("emitLine:containment");
    expect(types(t.effects)).toContain("closeSession");
  });

  test.each(actives)("abort en %s.%s → aborted (se reanuda desde el inicio)", (state, sub) => {
    const t = sceneTransition(at(state, sub), ev("abort"));
    expect(t.snapshot.state).toBe("aborted");
    expect(types(t.effects).at(-1)).toBe("sceneAborted");
    expect(t.snapshot.ctx.sessionOpen).toBe(false);
  });

  test.each(["idle", "closing", "posttask", "containment", "done", "aborted"] as const)("en %s no aplican (no son estados activos)", (state) => {
    for (const type of ["voiceLost", "budgetExhausted", "safetyRisk", "abort"] as const) {
      expect(sceneTransition(at(state, null, { sessionOpen: false, clockRunning: false }), ev(type)).changed).toBe(false);
    }
  });
});

describe("A1: los tres temporizadores (D-130)", () => {
  test("turnTimer solo confirma en endPending", () => {
    expect(sceneTransition(at("playerTurn", "endPending"), ev("turnTimer")).snapshot.state).toBe("npcTurn");
    for (const sub of ["waiting", "speaking", "passMenu"] as const) expect(sceneTransition(at("playerTurn", sub), ev("turnTimer")).changed).toBe(false);
  });

  test.each(CLOCK_STATES)("softCap en %s solo marca el contexto (nunca corta a nadie)", (state) => {
    const s = at(state, state === "playerTurn" ? "speaking" : null);
    const t = sceneTransition(s, ev("softCap"));
    expect(sceneStepName(t.snapshot)).toBe(sceneStepName(s));
    expect(t.snapshot.ctx.softCapReached).toBe(true);
    expect(t.effects).toEqual([]);
  });

  test("softCap fuera del reloj (pretask, closing…) se ignora", () => {
    for (const state of ["idle", "pretask", "closing", "posttask", "containment", "done", "aborted"] as const) {
      expect(sceneTransition(at(state), ev("softCap")).changed).toBe(false);
    }
  });

  test("softCap durante playerTurn → nonConverging recién en el próximo npcDone", () => {
    const { snapshot, steps } = runScene([
      ev("softCap"), ev("speechStart"), ev("speechPause"), ev("pressDone"), ev("npcDone"),
    ], at("playerTurn", "waiting"));
    expect(steps.map((s) => sceneStepName(s.snapshot))).toEqual([
      "playerTurn.waiting", "playerTurn.speaking", "playerTurn.endPending", "npcTurn", "nonConverging",
    ]);
    expect(snapshot.state).toBe("nonConverging");
  });

  test("softCap durante playerTurn → nonConverging recién en el próximo companionDone", () => {
    const { snapshot } = runScene([
      ev("softCap"), ev("pressPass"), ev("choose", { option: "continue" }), ev("companionSignal", { errorKey: "article:a" }), ev("companionDone"),
    ], at("playerTurn", "waiting"));
    expect(snapshot.state).toBe("nonConverging");
  });

  test("hardCap (5:00) durante playerTurn.waiting → closing, línea de cierre emitida ya en closing", () => {
    const t = sceneTransition(at("playerTurn", "waiting"), ev("hardCap"));
    expect(t.snapshot.state).toBe("closing");
    expect(t.snapshot.ctx).toMatchObject({ closingReason: "hardCap", sessionOpen: false, clockRunning: false });
    expect(types(t.effects)).toEqual(["closeSession", "stopClock", "emitLine:exit"]);
  });

  test.each([
    ["speaking", ["commitTurn", "closeSession", "stopClock", "emitLine:exit"]],
    ["endPending", ["commitTurn", "cancelTurnTimer", "closeSession", "stopClock", "emitLine:exit"]],
    ["passMenu", ["closeSession", "stopClock", "emitLine:exit"]],
  ] as const)("hardCap en playerTurn.%s: el habla parcial se confirma sin respuesta del NPC", (sub, effects) => {
    const t = sceneTransition(at("playerTurn", sub), ev("hardCap"));
    expect(types(t.effects)).toEqual(effects);
    expect(types(t.effects)).not.toContain("requestNpcReply");
    if (sub !== "passMenu") expect(t.effects[0]).toEqual({ type: "commitTurn", via: "hardCap" });
  });

  test.each(["npcTurn", "signal", "nonConverging"] as const)("hardCap en %s corta el audio en curso y cierra", (state) => {
    expect(types(sceneTransition(at(state), ev("hardCap")).effects)).toEqual(["cutAudio", "closeSession", "stopClock", "emitLine:exit"]);
  });

  test("hardCap en npcOpening → closing", () => {
    expect(sceneTransition(at("npcOpening"), ev("hardCap")).snapshot.state).toBe("closing");
  });

  test("hardCap en containment, closing, posttask, done y aborted se ignora (y en pretask: el reloj no corre)", () => {
    for (const state of ["pretask", "containment", "closing", "posttask", "done", "aborted"] as const) {
      expect(sceneTransition(at(state, null, { sessionOpen: false, clockRunning: false }), ev("hardCap")).changed).toBe(false);
    }
  });
});

// ---------- invariantes ----------

const ERRORS = ["subject-verb:3sg-s", "article:a", "tense:past"];

/** Un evento al azar de la lista cerrada (con su carga). */
function randomEvent(rng: Rng): SceneEvent {
  const type = rng.pick(SCENE_EVENTS);
  switch (type) {
    case "interact": return INTERACT;
    case "sceneFailed": return ev(type, { reason: rng.pick(["net", "budget"]) });
    case "choose": return ev(type, { option: rng.pick(PASS_OPTIONS) });
    case "companionSignal": return ev(type, { errorKey: rng.pick(ERRORS) });
    default: return ev(type);
  }
}

/**
 * Eventos que el sistema siempre termina disparando (03 §3.5.1): el fin de cada línea guionada, la unión de pretask
 * y el tope duro del servidor. Con ellos, desde cualquier estado alcanzable se llega a done o aborted.
 */
const GUARANTEED: SceneEvent[] = [
  ev("sceneFailed", { reason: "net" }), ev("pretaskDone"), ev("openingDone"), ev("hardCap"),
  ev("containmentDone"), ev("nonConvergingDone"), ev("closingDone"), ev("posttaskDone"),
];

function randomRun(seed: number, length: number): { steps: ReturnType<typeof runScene>["steps"]; final: SceneSnapshot } {
  const rng = createRng(seed);
  const events: SceneEvent[] = [INTERACT, ...Array.from({ length }, () => randomEvent(rng))];
  const first = runScene(events);
  const rest = runScene(GUARANTEED, first.snapshot);
  return { steps: [...first.steps, ...rest.steps], final: rest.snapshot };
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe("A1: invariantes (property test, RNG con semilla)", () => {
  test("(c) toda escena termina en done o aborted (sin estados colgados)", () => {
    for (const seed of SEEDS) {
      const { final } = randomRun(seed, 5 + (seed % 60));
      expect(["done", "aborted"], `semilla ${seed}`).toContain(final.state);
      expect(final.ctx.sessionOpen, `semilla ${seed}`).toBe(false);
    }
  });

  test("(a) el NPC nunca habla con playerTurn vigente", () => {
    for (const seed of SEEDS) {
      for (const step of randomRun(seed, 80).steps) {
        if (step.snapshot.state !== "playerTurn") continue;
        expect(step.effects.filter((e) => SPEAKING_EFFECTS.includes(e.type)), `semilla ${seed}`).toEqual([]);
      }
    }
  });

  test("(b) signal nunca dos veces seguidas sobre el mismo error", () => {
    for (const seed of SEEDS) {
      let last: string | null = null;
      for (const step of randomRun(seed, 80).steps) {
        for (const e of step.effects) {
          if (e.type !== "companionSignal") continue;
          expect(e.errorKey, `semilla ${seed}`).not.toBe(last);
          last = e.errorKey;
        }
      }
    }
    // Directo: la misma clave otra vez se ignora; otra clave sí entra.
    const s = at("npcTurn", null, { lastSignalErrorKey: "article:a" });
    expect(sceneTransition(s, ev("companionSignal", { errorKey: "article:a" })).changed).toBe(false);
    expect(sceneTransition(s, ev("companionSignal", { errorKey: "tense:past" })).snapshot.state).toBe("signal");
  });

  test("(d) nonConverging nunca produce pérdida de progreso: criterios y turnos se conservan y cierra en parcial", () => {
    for (const seed of SEEDS) {
      let maxTurn = 0;
      let satisfied = false;
      for (const step of randomRun(seed, 80).steps) {
        const { turnIndex, criteriaSatisfied } = step.snapshot.ctx;
        expect(turnIndex, `semilla ${seed}`).toBeGreaterThanOrEqual(maxTurn);
        if (satisfied) expect(criteriaSatisfied, `semilla ${seed}`).toBe(true);
        maxTurn = turnIndex;
        satisfied = criteriaSatisfied;
      }
    }
    const { snapshot, steps } = runScene([ev("nonConvergingDone"), ev("closingDone"), ev("posttaskDone")],
      at("nonConverging", null, { turnIndex: 4, softCapReached: true }));
    expect(snapshot.ctx.turnIndex).toBe(4);
    expect(steps.at(-1)?.effects).toEqual([{ type: "sceneEnded", outcome: "partial" }]);
  });

  test("(e) después de hardCap no queda sesión abierta ni se pide respuesta del NPC", () => {
    for (const seed of SEEDS) {
      let capped = false;
      for (const step of randomRun(seed, 80).steps) {
        if (capped) {
          expect(step.snapshot.ctx.sessionOpen, `semilla ${seed}`).toBe(false);
          expect(types(step.effects), `semilla ${seed}`).not.toContain("requestNpcReply");
          expect(types(step.effects), `semilla ${seed}`).not.toContain("emitLine:opening");
        }
        if (step.snapshot.ctx.closingReason === "hardCap") capped = true;
      }
    }
  });

  test("los estados terminales no aceptan ningún evento", () => {
    for (const state of ["done", "aborted"] as const) {
      for (const type of SCENE_EVENTS) {
        expect(sceneTransition(at(state, null, { sessionOpen: false, clockRunning: false }), randomEvent(createRng(type))).changed).toBe(false);
      }
    }
  });
});
