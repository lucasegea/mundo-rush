// Máquina de escena (03 §3.5.1, contrato; D-097, D-130, ADR-021): tabla de transiciones pura, compartida por cliente y
// servidor. Estados, sub-estados y eventos con los nombres de 03 sin renombrar ni fusionar. Los efectos son datos y se
// devuelven ya con el estado destino vigente (la línea de cierre del tope duro sale en `closing`, nunca en `playerTurn`).
// Los temporizadores (turnTimer, softCap, hardCap) los dispara quien corre la máquina (el servidor); acá solo llegan
// como eventos. Sin reloj ni azar: el núcleo no lee la hora (R4).

export const SCENE_STATES = [
  "idle", "pretask", "npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging",
  "closing", "posttask", "done", "aborted", "containment",
] as const;
export type SceneStateName = (typeof SCENE_STATES)[number];

export const PLAYER_SUB_STATES = ["waiting", "speaking", "endPending", "passMenu", "committed"] as const;
export type PlayerSubState = (typeof PLAYER_SUB_STATES)[number];

/** Lista cerrada de 03 §3.5.1: no se renombran ni se agregan sin decisión. */
export const SCENE_EVENTS = [
  "interact", "pretaskDone", "sceneReady", "sceneFailed", "openingDone", "speechStart", "speechPause",
  "speechResume", "turnTimer", "pressDone", "pressPass", "choose", "npcDone", "companionSignal", "companionDone",
  "criteriaMet", "nonConvergingDone", "softCap", "hardCap", "voiceLost", "budgetExhausted", "safetyRisk",
  "containmentDone", "closingDone", "posttaskDone", "abort",
] as const;
export type SceneEventType = (typeof SCENE_EVENTS)[number];

export type Modality = "voice" | "text";
/** Las 4 opciones de "Pasar el turno" (03 §5.5.3). `simpler` y `continue` cierran el turno; `hint` y `repeat` no. */
export const PASS_OPTIONS = ["hint", "repeat", "simpler", "continue"] as const;
export type PassOption = (typeof PASS_OPTIONS)[number];
export type ClosingReason = "criteria" | "partial" | "hardCap" | "containment";
export type SceneOutcome = "success" | "partial" | "hardCap" | "containment";

type Plain<T extends SceneEventType> = { readonly type: T };
export type SceneEvent =
  | { readonly type: "interact"; readonly npcId: string | null; readonly sceneId: string; readonly modality: Modality }
  | { readonly type: "sceneFailed"; readonly reason: "net" | "budget" }
  | { readonly type: "choose"; readonly option: PassOption }
  | { readonly type: "companionSignal"; readonly errorKey: string }
  | Plain<Exclude<SceneEventType, "interact" | "sceneFailed" | "choose" | "companionSignal">>;

export interface SceneContext {
  readonly npcId: string | null;
  readonly sceneId: string | null;
  readonly modality: Modality;
  /** Unión de `pretask`: hacen falta los dos para pasar a `npcOpening`. */
  readonly pretaskDone: boolean;
  readonly sceneReady: boolean;
  /** Reloj de escena: arranca al entrar a `npcOpening` (no corre en `pretask`, D-130). */
  readonly clockRunning: boolean;
  readonly softCapReached: boolean;
  /** Criterios de éxito cumplidos (los evalúa el observador; nunca vuelve a false). */
  readonly criteriaSatisfied: boolean;
  /** Sesión del modelo abierta (Live en voz). Se cierra al entrar a `closing`, `containment` o `aborted`. */
  readonly sessionOpen: boolean;
  /** Turnos del jugador confirmados. */
  readonly turnIndex: number;
  /** Error de la última señal: la siguiente sobre el mismo error se ignora (invariante b). */
  readonly lastSignalErrorKey: string | null;
  readonly closingReason: ClosingReason | null;
}

export interface SceneSnapshot {
  readonly state: SceneStateName;
  /** Sub-estado de `playerTurn`; null en los demás estados. */
  readonly sub: PlayerSubState | null;
  readonly ctx: SceneContext;
}

/** Líneas guionadas de la ficha de escena: apertura, cierre (éxito), salida (no converge / tope duro), contención. */
export type ScriptedLine = "opening" | "closing" | "exit" | "containment";

export type SceneEffect =
  | { readonly type: "openSession" }
  | { readonly type: "startPretask" }
  | { readonly type: "startClock" }
  | { readonly type: "stopClock" }
  | { readonly type: "emitLine"; readonly line: ScriptedLine }
  | { readonly type: "startTurnTimer" }
  | { readonly type: "cancelTurnTimer" }
  | { readonly type: "showPassMenu" }
  | { readonly type: "passOption"; readonly option: PassOption }
  /** El turno del jugador pasa al transcript del observador. `partial`: lo confirmó el tope duro, sin respuesta del NPC. */
  | { readonly type: "commitTurn"; readonly via: "pressDone" | "turnTimer" | "pass" | "hardCap" }
  | { readonly type: "requestNpcReply"; readonly directorNote: "simpler" | "continue" | null }
  | { readonly type: "companionSignal"; readonly errorKey: string }
  | { readonly type: "cutAudio" }
  | { readonly type: "closeSession" }
  | { readonly type: "modalityChanged"; readonly modality: Modality }
  | { readonly type: "posttask" }
  | { readonly type: "sceneEnded"; readonly outcome: SceneOutcome }
  | { readonly type: "sceneAborted" };

export interface SceneTransition {
  readonly snapshot: SceneSnapshot;
  readonly effects: readonly SceneEffect[];
  /** false si el evento no aplica en el estado actual (se ignora: mismo snapshot, sin efectos). */
  readonly changed: boolean;
}

/** Estados con reloj corriendo (03 §3.5.1): ahí aplican softCap y hardCap. */
export const CLOCK_STATES: readonly SceneStateName[] = ["npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging"];
/** Estados activos: `pretask` y los de reloj. Ahí aplican voiceLost, budgetExhausted, safetyRisk y abort. */
export const ACTIVE_STATES: readonly SceneStateName[] = ["pretask", ...CLOCK_STATES];
export const TERMINAL_STATES: readonly SceneStateName[] = ["done", "aborted"];

/** Efectos en los que el NPC (o Lumi) habla: nunca con `playerTurn` vigente (invariante a). */
export const SPEAKING_EFFECTS: readonly SceneEffect["type"][] = ["emitLine", "requestNpcReply", "companionSignal"];

export const initialSceneContext = (): SceneContext => ({
  npcId: null, sceneId: null, modality: "voice", pretaskDone: false, sceneReady: false, clockRunning: false,
  softCapReached: false, criteriaSatisfied: false, sessionOpen: false, turnIndex: 0, lastSignalErrorKey: null, closingReason: null,
});

export const initialSceneSnapshot = (): SceneSnapshot => ({ state: "idle", sub: null, ctx: initialSceneContext() });

export const isClockState = (s: SceneStateName): boolean => CLOCK_STATES.includes(s);
export const isActiveState = (s: SceneStateName): boolean => ACTIVE_STATES.includes(s);
export const isTerminalState = (s: SceneStateName): boolean => TERMINAL_STATES.includes(s);

const OUTCOME: Record<ClosingReason, SceneOutcome> = { criteria: "success", partial: "partial", hardCap: "hardCap", containment: "containment" };

type Result = { state: SceneStateName; sub: PlayerSubState | null; ctx: SceneContext; effects: SceneEffect[] };
type Handler = (snap: SceneSnapshot, ev: SceneEvent) => Result | null;

const to = (snap: SceneSnapshot, state: SceneStateName, sub: PlayerSubState | null = null,
  ctx: Partial<SceneContext> = {}, effects: SceneEffect[] = []): Result => ({ state, sub, ctx: { ...snap.ctx, ...ctx }, effects });

/** `committed` es de paso: confirma el turno y sigue a `npcTurn` en la misma transición (03: committed ──► npcTurn). */
const commit = (snap: SceneSnapshot, via: "pressDone" | "turnTimer" | "pass", note: "simpler" | "continue" | null,
  pre: SceneEffect[] = []): Result =>
  to(snap, "npcTurn", null, { turnIndex: snap.ctx.turnIndex + 1 },
    [...pre, { type: "commitTurn", via }, { type: "requestNpcReply", directorNote: note }]);

/** Entrada a `closing`: cierra la sesión y el reloj; la línea guionada que corresponde sale ya en `closing`. */
const enterClosing = (snap: SceneSnapshot, reason: ClosingReason, pre: SceneEffect[] = []): Result => {
  const line: SceneEffect[] = reason === "criteria" ? [{ type: "emitLine", line: "closing" }]
    : reason === "hardCap" ? [{ type: "emitLine", line: "exit" }] : [];
  const close: SceneEffect[] = snap.ctx.sessionOpen ? [{ type: "closeSession" }] : [];
  const clock: SceneEffect[] = snap.ctx.clockRunning ? [{ type: "stopClock" }] : [];
  return to(snap, "closing", null,
    { closingReason: reason, sessionOpen: false, clockRunning: false, ...(reason === "criteria" ? { criteriaSatisfied: true } : {}) },
    [...pre, ...close, ...clock, ...line]);
};

/** Borde natural tras la línea del NPC o de Lumi: con softCap y sin criterios, `nonConverging` (GDD §2.5.3). */
const afterLine = (snap: SceneSnapshot): Result =>
  snap.ctx.softCapReached && !snap.ctx.criteriaSatisfied
    ? to(snap, "nonConverging", null, {}, [{ type: "emitLine", line: "exit" }])
    : to(snap, "playerTurn", "waiting");

/** Unión de `pretask`: listos los dos, a `npcOpening` con el reloj en marcha y la apertura guionada. */
const pretaskJoin = (snap: SceneSnapshot, ctx: Partial<SceneContext>, pre: SceneEffect[] = []): Result => {
  const next = { ...snap.ctx, ...ctx };
  if (!(next.pretaskDone && next.sceneReady)) return to(snap, "pretask", null, ctx, pre);
  return to(snap, "npcOpening", null, { ...ctx, clockRunning: true }, [...pre, { type: "startClock" }, { type: "emitLine", line: "opening" }]);
};

const playerTurn: Partial<Record<PlayerSubState, Partial<Record<SceneEventType, Handler>>>> = {
  waiting: {
    speechStart: (s) => to(s, "playerTurn", "speaking"),
    pressPass: (s) => to(s, "playerTurn", "passMenu", {}, [{ type: "showPassMenu" }]),
  },
  speaking: {
    speechPause: (s) => to(s, "playerTurn", "endPending", {}, [{ type: "startTurnTimer" }]),
  },
  endPending: {
    turnTimer: (s) => commit(s, "turnTimer", null),
    pressDone: (s) => commit(s, "pressDone", null, [{ type: "cancelTurnTimer" }]),
    speechResume: (s) => to(s, "playerTurn", "speaking", {}, [{ type: "cancelTurnTimer" }]),
    pressPass: (s) => to(s, "playerTurn", "passMenu", {}, [{ type: "cancelTurnTimer" }, { type: "showPassMenu" }]),
  },
  passMenu: {
    choose: (s, ev) => {
      if (ev.type !== "choose") return null;
      const pass: SceneEffect = { type: "passOption", option: ev.option };
      return ev.option === "simpler" || ev.option === "continue"
        ? commit(s, "pass", ev.option, [pass])
        : to(s, "playerTurn", "waiting", {}, [pass]);
    },
  },
};

const TABLE: Partial<Record<SceneStateName, Partial<Record<SceneEventType, Handler>>>> = {
  idle: {
    interact: (s, ev) => ev.type !== "interact" ? null
      : to(s, "pretask", null, { npcId: ev.npcId, sceneId: ev.sceneId, modality: ev.modality, sessionOpen: true },
        [{ type: "openSession" }, { type: "startPretask" }]),
  },
  pretask: {
    pretaskDone: (s) => pretaskJoin(s, { pretaskDone: true }),
    sceneReady: (s) => pretaskJoin(s, { sceneReady: true }),
    // La misma escena en modo texto (red o presupuesto): cuenta como lista, con modality = text.
    sceneFailed: (s) => pretaskJoin(s, { sceneReady: true, modality: "text" },
      s.ctx.modality === "text" ? [] : [{ type: "modalityChanged", modality: "text" }]),
  },
  npcOpening: {
    openingDone: (s) => to(s, "playerTurn", "waiting"),
  },
  npcTurn: {
    npcDone: (s) => afterLine(s),
    companionSignal: (s, ev) => ev.type !== "companionSignal" || ev.errorKey === s.ctx.lastSignalErrorKey ? null
      : to(s, "signal", null, { lastSignalErrorKey: ev.errorKey }, [{ type: "companionSignal", errorKey: ev.errorKey }]),
    criteriaMet: (s) => enterClosing(s, "criteria"),
  },
  signal: {
    companionDone: (s) => afterLine(s),
  },
  nonConverging: {
    nonConvergingDone: (s) => enterClosing(s, "partial"),
  },
  containment: {
    containmentDone: (s) => enterClosing(s, "containment"),
  },
  closing: {
    closingDone: (s) => to(s, "posttask", null, {}, [{ type: "posttask" }]),
  },
  posttask: {
    posttaskDone: (s) => to(s, "done", null, {}, [{ type: "sceneEnded", outcome: OUTCOME[s.ctx.closingReason ?? "partial"] }]),
  },
};

/** Transiciones de "cualquier estado activo" y "con reloj corriendo" (03 §3.5.1), después de la tabla propia. */
function shared(s: SceneSnapshot, ev: SceneEvent): Result | null {
  const clock = isClockState(s.state);
  switch (ev.type) {
    case "softCap":
      // Nunca transiciona: solo marca el contexto. El paso a nonConverging lo hace el próximo borde natural.
      return clock && !s.ctx.softCapReached ? to(s, s.state, s.sub, { softCapReached: true }) : null;
    case "hardCap": {
      if (!clock) return null; // en containment, closing, posttask, done y aborted se ignora
      const pre: SceneEffect[] = [];
      if (s.state === "playerTurn" && (s.sub === "speaking" || s.sub === "endPending")) pre.push({ type: "commitTurn", via: "hardCap" });
      if (s.state === "playerTurn" && s.sub === "endPending") pre.push({ type: "cancelTurnTimer" });
      if (s.state === "npcTurn" || s.state === "signal" || s.state === "nonConverging") pre.push({ type: "cutAudio" });
      return enterClosing(s, "hardCap", pre);
    }
    case "voiceLost":
    case "budgetExhausted":
      if (!isActiveState(s.state) || s.ctx.modality === "text") return null;
      return to(s, s.state, s.sub, { modality: "text" }, [{ type: "modalityChanged", modality: "text" }]);
    case "safetyRisk": {
      if (!isActiveState(s.state)) return null;
      const effects: SceneEffect[] = [];
      if (s.state === "npcTurn" || s.state === "signal" || s.state === "nonConverging") effects.push({ type: "cutAudio" });
      if (s.state === "playerTurn" && s.sub === "endPending") effects.push({ type: "cancelTurnTimer" });
      if (s.ctx.sessionOpen) effects.push({ type: "closeSession" });
      if (s.ctx.clockRunning) effects.push({ type: "stopClock" });
      effects.push({ type: "emitLine", line: "containment" });
      return to(s, "containment", null, { sessionOpen: false, clockRunning: false }, effects);
    }
    case "abort": {
      if (!isActiveState(s.state)) return null;
      const effects: SceneEffect[] = [];
      if (s.state === "playerTurn" && s.sub === "endPending") effects.push({ type: "cancelTurnTimer" });
      if (s.ctx.sessionOpen) effects.push({ type: "closeSession" });
      if (s.ctx.clockRunning) effects.push({ type: "stopClock" });
      effects.push({ type: "sceneAborted" });
      return to(s, "aborted", null, { sessionOpen: false, clockRunning: false }, effects);
    }
    case "criteriaMet":
      // Fuera de npcTurn no transiciona: queda anotado para el guardia del próximo borde (03 §3.5.1).
      return isActiveState(s.state) && !s.ctx.criteriaSatisfied ? to(s, s.state, s.sub, { criteriaSatisfied: true }) : null;
    default:
      return null;
  }
}

/** Aplica un evento. Un evento que no aplica devuelve el mismo snapshot, sin efectos y `changed: false`. */
export function sceneTransition(snap: SceneSnapshot, ev: SceneEvent): SceneTransition {
  const own = snap.state === "playerTurn" && snap.sub ? playerTurn[snap.sub]?.[ev.type] : TABLE[snap.state]?.[ev.type];
  const result = own?.(snap, ev) ?? shared(snap, ev);
  if (!result) return { snapshot: snap, effects: [], changed: false };
  return { snapshot: { state: result.state, sub: result.sub, ctx: result.ctx }, effects: result.effects, changed: true };
}

/** Pliega una secuencia de eventos y junta los efectos (tests, replays). */
export function runScene(events: readonly SceneEvent[], from: SceneSnapshot = initialSceneSnapshot()):
  { snapshot: SceneSnapshot; steps: SceneTransition[] } {
  let snapshot = from;
  const steps: SceneTransition[] = [];
  for (const ev of events) {
    const t = sceneTransition(snapshot, ev);
    steps.push(t);
    snapshot = t.snapshot;
  }
  return { snapshot, steps };
}

/** Nombre legible del estado ("playerTurn.waiting"). */
export const sceneStepName = (s: Pick<SceneSnapshot, "state" | "sub">): string => (s.sub ? `${s.state}.${s.sub}` : s.state);
