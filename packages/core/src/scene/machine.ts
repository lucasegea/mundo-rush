// Scene machine (03 §3.5.1, contract; D-097, D-130, ADR-021): pure transition table, shared by client and
// server. States, sub-states and events with the names of 03, without renaming or merging. Effects are data and are
// returned already with the current target state (the hard-cap closing line comes out in `closing`, never in `playerTurn`).
// The timers (turnTimer, softCap, hardCap) are fired by whoever runs the machine (the server); here they only arrive
// as events. No clock or randomness: the core does not read the time (R4).

export const SCENE_STATES = [
  "idle", "pretask", "npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging",
  "closing", "posttask", "done", "aborted", "containment",
] as const;
export type SceneStateName = (typeof SCENE_STATES)[number];

export const PLAYER_SUB_STATES = ["waiting", "speaking", "endPending", "passMenu", "committed"] as const;
export type PlayerSubState = (typeof PLAYER_SUB_STATES)[number];

/** Closed list from 03 §3.5.1: not renamed or extended without a decision. */
export const SCENE_EVENTS = [
  "interact", "pretaskDone", "sceneReady", "sceneFailed", "openingDone", "speechStart", "speechPause",
  "speechResume", "turnTimer", "pressDone", "pressPass", "choose", "npcDone", "companionSignal", "companionDone",
  "criteriaMet", "nonConvergingDone", "softCap", "hardCap", "voiceLost", "budgetExhausted", "safetyRisk",
  "containmentDone", "closingDone", "posttaskDone", "abort",
] as const;
export type SceneEventType = (typeof SCENE_EVENTS)[number];

export type Modality = "voice" | "text";
/** The 4 options of "Pasar el turno" (03 §5.5.3). `simpler` and `continue` close the turn; `hint` and `repeat` do not. */
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
  /** Join of `pretask`: both are needed to move to `npcOpening`. */
  readonly pretaskDone: boolean;
  readonly sceneReady: boolean;
  /** Scene clock: starts on entering `npcOpening` (does not run in `pretask`, D-130). */
  readonly clockRunning: boolean;
  readonly softCapReached: boolean;
  /** Success criteria met (evaluated by the observer; never goes back to false). */
  readonly criteriaSatisfied: boolean;
  /** Model session open (Live in voice). Closed on entering `closing`, `containment` or `aborted`. */
  readonly sessionOpen: boolean;
  /** Confirmed player turns. */
  readonly turnIndex: number;
  /** Error of the last signal: the next one on the same error is ignored (invariant b). */
  readonly lastSignalErrorKey: string | null;
  readonly closingReason: ClosingReason | null;
}

export interface SceneSnapshot {
  readonly state: SceneStateName;
  /** Sub-state of `playerTurn`; null in the other states. */
  readonly sub: PlayerSubState | null;
  readonly ctx: SceneContext;
}

/** Scripted lines of the scene sheet: opening, closing (success), exit (does not converge / hard cap), containment. */
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
  /** The player's turn goes to the observer's transcript. `partial`: confirmed by the hard cap, without an NPC reply. */
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
  /** false if the event does not apply in the current state (ignored: same snapshot, no effects). */
  readonly changed: boolean;
}

/** States with the clock running (03 §3.5.1): softCap and hardCap apply there. */
export const CLOCK_STATES: readonly SceneStateName[] = ["npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging"];
/** Active states: `pretask` and the clock ones. voiceLost, budgetExhausted, safetyRisk and abort apply there. */
export const ACTIVE_STATES: readonly SceneStateName[] = ["pretask", ...CLOCK_STATES];
export const TERMINAL_STATES: readonly SceneStateName[] = ["done", "aborted"];

/** Effects in which the NPC (or Lumi) speaks: never with `playerTurn` in force (invariant a). */
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

/** `committed` is transient: it confirms the turn and continues to `npcTurn` in the same transition (03: committed ──► npcTurn). */
const commit = (snap: SceneSnapshot, via: "pressDone" | "turnTimer" | "pass", note: "simpler" | "continue" | null,
  pre: SceneEffect[] = []): Result =>
  to(snap, "npcTurn", null, { turnIndex: snap.ctx.turnIndex + 1 },
    [...pre, { type: "commitTurn", via }, { type: "requestNpcReply", directorNote: note }]);

/** Entry to `closing`: closes the session and the clock; the matching scripted line comes out already in `closing`. */
const enterClosing = (snap: SceneSnapshot, reason: ClosingReason, pre: SceneEffect[] = []): Result => {
  const line: SceneEffect[] = reason === "criteria" ? [{ type: "emitLine", line: "closing" }]
    : reason === "hardCap" ? [{ type: "emitLine", line: "exit" }] : [];
  const close: SceneEffect[] = snap.ctx.sessionOpen ? [{ type: "closeSession" }] : [];
  const clock: SceneEffect[] = snap.ctx.clockRunning ? [{ type: "stopClock" }] : [];
  return to(snap, "closing", null,
    { closingReason: reason, sessionOpen: false, clockRunning: false, ...(reason === "criteria" ? { criteriaSatisfied: true } : {}) },
    [...pre, ...close, ...clock, ...line]);
};

/** Natural edge after the NPC's or Lumi's line: with softCap and no criteria, `nonConverging` (GDD §2.5.3). */
const afterLine = (snap: SceneSnapshot): Result =>
  snap.ctx.softCapReached && !snap.ctx.criteriaSatisfied
    ? to(snap, "nonConverging", null, {}, [{ type: "emitLine", line: "exit" }])
    : to(snap, "playerTurn", "waiting");

/** Join of `pretask`: with both ready, to `npcOpening` with the clock running and the scripted opening. */
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
    // The same scene in text mode (network or budget): counts as ready, with modality = text.
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

/** Transitions from "any active state" and "with the clock running" (03 §3.5.1), after the state's own table. */
function shared(s: SceneSnapshot, ev: SceneEvent): Result | null {
  const clock = isClockState(s.state);
  switch (ev.type) {
    case "softCap":
      // Never transitions: it only marks the context. The move to nonConverging is made by the next natural edge.
      return clock && !s.ctx.softCapReached ? to(s, s.state, s.sub, { softCapReached: true }) : null;
    case "hardCap": {
      if (!clock) return null; // in containment, closing, posttask, done and aborted it is ignored
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
      // Outside npcTurn it does not transition: it is noted for the guard of the next natural edge (03 §3.5.1).
      return isActiveState(s.state) && !s.ctx.criteriaSatisfied ? to(s, s.state, s.sub, { criteriaSatisfied: true }) : null;
    default:
      return null;
  }
}

/** Applies an event. An event that does not apply returns the same snapshot, with no effects and `changed: false`. */
export function sceneTransition(snap: SceneSnapshot, ev: SceneEvent): SceneTransition {
  const own = snap.state === "playerTurn" && snap.sub ? playerTurn[snap.sub]?.[ev.type] : TABLE[snap.state]?.[ev.type];
  const result = own?.(snap, ev) ?? shared(snap, ev);
  if (!result) return { snapshot: snap, effects: [], changed: false };
  return { snapshot: { state: result.state, sub: result.sub, ctx: result.ctx }, effects: result.effects, changed: true };
}

/** Folds a sequence of events and collects the effects (tests, replays). */
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

/** Readable state name ("playerTurn.waiting"). */
export const sceneStepName = (s: Pick<SceneSnapshot, "state" | "sub">): string => (s.sub ? `${s.state}.${s.sub}` : s.state);
