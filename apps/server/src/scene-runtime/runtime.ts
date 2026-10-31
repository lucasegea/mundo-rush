// scene-runtime (03 §4.2): orchestrates ONE scene per connection with the @lg/core/scene machine. Executes the effects that
// the machine returns (always with the target state already in force), fires the timers (softCap, hardCap,
// turnTimer: the server is in charge, D-130), calls the NPC (text model) and the observer, evaluates criteria and, on closing,
// emits the mission effects and the evidence (EvidenceStore). F4.1 is text only: the "I finished saying the line" signals that
// in voice the client sends here are given by the runtime itself as soon as it sends the text.
// It never sends the client a prompt, a model name or a key (A4): everything goes out as protocol messages, which
// are strict objects, and `send` validates each one before sending it.
// F5.1a (voice, 03 §5.4-§5.6, §5.11): with `modality: "voice"` it opens ONE session of the configured `RealtimeVoiceProvider`
// during the pretask, with the setup built here; it is the sole owner of each turn's TurnClip (builds it from the player's
// audio, passes it read-only to the observer and releases it on finish or after 10 s); moderates the output (not the
// adapter); closes the session on entering `closing` (hardCap included: the closing line is the scripted one) and records the
// cost of each `usage` in the CostLedger. If voice doesn't open or is lost, the same scene carries on by text.
// A2 (ADR-027): a scene with `conversacion` is measured by a meters system plugged in through the hooks (hooks.ts). That
// system changes the NPC note (in voice, reopens the session with the new instruction and the history at a safe point),
// sends its state to the HUD and asks for closing; the observer's criteria don't close those scenes (safety and evidence do).
import { randomUUID } from "node:crypto";
import {
  applyCriteriaReports, criteriaSatisfied, emptyCriteria, initialSceneSnapshot, metCriteriaIds, resolveScene,
  sceneCloseEffects, sceneTransition,
  type CriteriaState, type CriterionDef, type SceneEffect, type SceneEvent, type SceneSnapshot, type SceneStateName,
} from "@lg/core/scene";
import type { Clock } from "@lg/core";
import {
  ClientMessageSchema, ServerMessageSchema,
  type ClientMessage, type EvidenceEvent, type NoticeCause, type ServerMessage,
} from "@lg/protocol";
import type { Escena, FichaConversacion, LineaGuionada, Mision, Npc } from "@lg/content-schema";
import type { ServerContent } from "../content/loader.ts";
import type { ModelsConfig } from "../config/models.ts";
import { runObserver } from "../observer/observer.ts";
import { noticeCause, type TextModelProvider, type TextTurn } from "../providers/text.ts";
import type { EvidenceStore } from "../store/evidence.ts";
import { createModerator, type ModerationResult, type Moderator } from "../moderation/moderation.ts";
import type { ModerationProvider } from "../providers/moderation.ts";
import { createMemorySafetyStore, type SafetyEventStore } from "../store/safety.ts";
import { costPolicyFromConfig, createMemoryCostLedger, type CostAlert, type CostLedger } from "../cost/ledger.ts";
import type { CloseReason, RealtimeVoiceProvider, SceneVoiceSetup, VoiceEvent, VoiceProviderFactory } from "../providers/types.ts";
import { applies, exitLines, isNpcLine, openingLines, readCatalog, renderScriptedText, type Catalog } from "./catalog.ts";
import { foldProgress, withoutResets, type MissionReset, type OperatorProgress } from "./progress.ts";
import { buildNpcPrompt } from "./prompt.ts";
import { createTurnClip, readOnly, type TurnClip, type TurnClipView } from "./turn-clip.ts";
import { callHook, type ConversationHooks, type ConversationSceneControl } from "./hooks.ts";

/** Scripted line of an NPC that asks for an introduction when nobody introduced them (02 §1.7). */
export const NOT_INTRODUCED_LINE = "Hi! Do I know you?";

/** [DIRECTOR] notes of "Pass the turn" (03 §5.5.3): the model never says them out loud. */
const DIRECTOR_NOTES = {
  simpler: "[DIRECTOR] The player asked for something simpler: rephrase your last line with fewer words and offer two options.",
  continue: "[DIRECTOR] Continue the conversation without waiting for an answer; give the player an easy yes/no question.",
} as const;
const SCENE_START_NOTE = "[DIRECTOR] The scene starts now.";
/** A2: if the new voice session doesn't open, the updated NPC note enters the current session as context. */
const BRIEF_UPDATE_NOTE = "[DIRECTOR] Updated scene notes. Follow them from now on and never say them aloud:";
/** Model turn that closes the injected history: with the model at the end, the session generates nothing. */
const QUIET_MODEL_TURN = "Hm.";

export interface Scheduler {
  /** Schedules `fn` in `ms`; returns the cancellation. */
  schedule(ms: number, fn: () => void): () => void;
}

export const realScheduler: Scheduler = {
  schedule(ms, fn) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export interface SceneDeps {
  /** Content for the scene that starts (loader.forNextScene: director mode rereads between scenes). */
  content: () => ServerContent;
  npcModel: TextModelProvider;
  observerModel: TextModelProvider;
  models: ModelsConfig;
  evidence: EvidenceStore;
  accountId: string;
  clock: Clock;
  scheduler?: Scheduler;
  newId?: () => string;
  /** Moderation classifier (F4.2, 03 §7.7). null or absent: the layer doesn't run; the lists and rules do. */
  moderation?: ModerationProvider | null;
  /** safety_events (D-112). Without it, in memory. */
  safety?: SafetyEventStore;
  /** Voice adapter chosen by configuration (providers/voice.ts). null or absent: no voice (the scene goes by text). */
  voice?: VoiceProviderFactory | null;
  /** Voice cost ledger. Without it, in memory with the models.yaml rates. */
  ledger?: CostLedger;
  /** Cost alert (D-027): cuts nothing, only warns the operator. */
  onCostAlert?: (alert: CostAlert) => void;
  /** The cost ledger couldn't record a usage (e.g. no rate for the adapter): it warns and the scene carries on. */
  onCostError?: (message: string) => void;
  /** Diagnostics (tests): read-only view of each TurnClip when created, to see that it is released. */
  onTurnClip?: (clip: TurnClipView) => void;
  /** F5.2: conversation hooks (hooks.ts): start, each player and NPC turn, and the end of the scene. */
  conversation?: ConversationHooks;
  /** A2: development resets of the account's missions (store/encounters.ts); their earlier evidence doesn't count. */
  resets?: () => readonly MissionReset[];
}

export interface SceneSession {
  /** A raw message from the client (already parsed as JSON). Resolves when the scene is quiet. */
  receive(raw: unknown): Promise<void>;
  /**
   * A player audio frame (PCM16 16 kHz, ADR-017). false: the scene isn't in voice (the gateway warns); in voice,
   * a frame outside the spoken turn (e.g. one that arrives late) is silently dropped.
   */
  receiveAudio(pcm16: Int16Array): boolean;
  /** The connection closed: an active scene is aborted (resumes from its start, 03 §3.5.1). */
  close(): void;
  readonly snapshot: SceneSnapshot;
  /** Waits for the calls in progress to finish (NPC and observer). */
  settled(): Promise<void>;
}

interface TranscriptEntry {
  speaker: "player" | "npc";
  text: string;
}

interface Run {
  catalog: Catalog;
  mission: Mision;
  scene: Escena;
  npc: Npc | null;
  sceneRunId: string;
  progress: OperatorProgress;
  system: string | null;
  openingTurn: string | null;
  criteriaDefs: CriterionDef[];
  criteria: CriteriaState;
  transcript: TranscriptEntry[];
  evidence: EvidenceEvent[];
  lastNpcLine: string | null;
  pendingText: string | null;
  /** Bumped when the session closes: an in-flight reply from an old generation is discarded. */
  generation: number;
  cancelCaps: (() => void)[];
  cancelTurnTimer: (() => void) | null;
  moderator: Moderator;
  /** The scene's voice session (null in text, or after it is closed or lost). */
  voice: VoiceRun | null;
  /** A2: the scene's meters conversation sheet (or null). */
  conversation: FichaConversacion | null;
  /** NPC prompt without the conversation system's note; `system` = base + note. */
  baseSystem: string | null;
  brief: string | null;
  /** The conversation system asked for closing: the next `npcTurn` decides criteriaMet (03 §3.5.1). */
  completePending: boolean;
  /** New voice session opening with the updated instruction (swapped in at the next safe point). */
  voiceSwap: VoiceSwap | null;
}

interface VoiceSwap {
  run: VoiceRun;
  state: "opening" | "ready" | "failed";
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(v: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** A voice turn: the player's (with clip) or a reply requested by a [DIRECTOR] note (no clip). */
interface VoiceTurn {
  turnId: string;
  /** The scene's turnIndex this turn belongs to (the player's counts once confirmed). */
  index: number;
  /** What is being heard from the player (accumulated partial transcript). */
  heard: string;
  clip: TurnClip | null;
  cancelClipTimer: (() => void) | null;
  /** The player's final transcript; "" if nothing was heard or the voice was lost. */
  transcript: Deferred<string>;
  npcText: string[];
  npcFinal: string | null;
  /** true: the NPC finished; false: the voice was lost before. */
  npcDone: Deferred<boolean>;
  /** Moderation or cap: the audio that keeps arriving for this turn is not sent out. */
  cut: boolean;
}

interface VoiceRun {
  provider: RealtimeVoiceProvider;
  opened: boolean;
  openedAt: number;
  /** System instruction it was opened with (or that was injected into it as a note). */
  system: string;
  /** Player turn open (between voice.turnStart and the commit). */
  speaking: VoiceTurn | null;
  turns: Map<string, VoiceTurn>;
}

/**
 * The runtime considers each state's line finished as soon as it sends it. In voice too, while the scripted lines don't
 * have cached audio (03 §6.3, F8) nor does the client confirm their playback (F5.2): the client says them as text.
 * `npcTurn` is not here: in voice the adapter's `npcTurnDone` closes it.
 */
const AUTO_DONE: Partial<Record<SceneStateName, SceneEvent>> = {
  npcOpening: { type: "openingDone" },
  signal: { type: "companionDone" },
  nonConverging: { type: "nonConvergingDone" },
  containment: { type: "containmentDone" },
  closing: { type: "closingDone" },
  posttask: { type: "posttaskDone" },
};

/** Cap of `turn.transcript` in @lg/protocol. */
const MAX_TRANSCRIPT_CHARS = 2000;

/** Joins pieces of the input transcript with a space between words (like the Live adapter). */
const joinHeard = (acc: string, piece: string): string =>
  acc && !acc.endsWith(" ") && !piece.startsWith(" ") ? `${acc} ${piece}` : `${acc}${piece}`;

const ACTIVE_RUN: readonly SceneStateName[] = ["pretask", "npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging", "closing", "posttask", "containment"];

export function createSceneSession(
  deps: SceneDeps,
  sendRaw: (msg: ServerMessage) => void,
  /** NPC audio towards the client (binary frames, NPC_AUDIO_SAMPLE_RATE). */
  sendAudioOut: (pcm16: Int16Array) => void = () => {},
): SceneSession {
  const scheduler = deps.scheduler ?? realScheduler;
  const ledger = deps.ledger ?? createMemoryCostLedger(costPolicyFromConfig(deps.models));
  const newId = deps.newId ?? (() => randomUUID());
  const iso = (): string => new Date(deps.clock.now()).toISOString();
  let snap: SceneSnapshot = initialSceneSnapshot();
  let run: Run | null = null;
  const queue: SceneEvent[] = [];
  let draining = false;
  const pending = new Set<Promise<void>>();
  const safetyStore = deps.safety ?? createMemorySafetyStore();

  /** Every message goes through the strict schema: what is not in the protocol does not go out (A4). */
  const send = (msg: ServerMessage): void => sendRaw(ServerMessageSchema.parse(msg));
  const fail = (code: Extract<ServerMessage, { type: "error" }>["code"], message: string): void => send({ type: "error", code, message });

  const sendState = (): void => send({
    type: "scene.state", state: snap.state, sub: snap.sub, modality: snap.ctx.modality,
    turnIndex: snap.ctx.turnIndex, softCapReached: snap.ctx.softCapReached,
  });

  const sendLines = (r: Run, lines: readonly LineaGuionada[], kind: "pretask" | "opening" | "closing" | "exit"): void => {
    for (const l of lines) {
      if (isNpcLine(l)) {
        // The server doesn't know the game name yet (it arrives with the onboarding): the gaps are said without it.
        const text = renderScriptedText(l.en, null);
        send({ type: "npc.line", line: { lineId: newId(), speaker: l.quien, kind, text, template: null } });
        if (r.npc && l.quien === r.npc.id) r.lastNpcLine = text;
      } else {
        send({ type: "npc.line", line: { lineId: newId(), speaker: "LUMI", kind, text: null, template: l.plantilla } });
      }
    }
  };

  const appendEvidence = (r: Run, event: Omit<EvidenceEvent, "id" | "accountId" | "at" | "missionId" | "sceneId">): EvidenceEvent => {
    const full: EvidenceEvent = { id: newId(), accountId: deps.accountId, at: iso(), missionId: r.mission.id, sceneId: r.scene.escena_id, ...event };
    deps.evidence.append(full);
    r.evidence.push(full);
    return full;
  };

  const track = (p: Promise<void>): void => {
    const done = p.finally(() => pending.delete(done));
    pending.add(done);
  };

  // ---------- conversation hooks (F5.2) ----------

  const emitTurn = (r: Run, speaker: "player" | "npc", text: string, final: boolean, kind: "turn" | "safe" = "turn",
    turnIndex: number = snap.ctx.turnIndex): void => callHook(deps.conversation, deps.conversation?.onTurn, {
    sceneRunId: r.sceneRunId, missionId: r.mission.id, sceneId: r.scene.escena_id, npcId: r.npc?.id ?? null,
    turnId: `${r.sceneRunId}:${turnIndex}`, turnIndex, speaker, text, final, modality: snap.ctx.modality, kind,
  });

  /** A turn enters the scene transcript (already moderated) and the hooks find out. */
  const addTranscript = (r: Run, speaker: "player" | "npc", text: string, kind: "turn" | "safe" = "turn"): void => {
    r.transcript.push({ speaker, text });
    emitTurn(r, speaker, text, true, kind);
  };

  // ---------- NPC turn (text) ----------

  const modelTurns = (r: Run, note: string | null): TextTurn[] => {
    const raw: TextTurn[] = [{ role: "user", text: SCENE_START_NOTE }];
    if (r.openingTurn) raw.push({ role: "model", text: r.openingTurn });
    for (const t of r.transcript) raw.push({ role: t.speaker === "player" ? "user" : "model", text: t.text });
    if (note) raw.push({ role: "user", text: note });
    // Consecutive turns of the same role are merged (the provider alternates user/model).
    return raw.reduce<TextTurn[]>((acc, t) => {
      const last = acc[acc.length - 1];
      if (last && last.role === t.role) acc[acc.length - 1] = { role: t.role, text: `${last.text}\n${t.text}` };
      else acc.push(t);
      return acc;
    }, []);
  };

  const stillOn = (r: Run, gen: number, turn: number): boolean =>
    run === r && r.generation === gen && snap.state === "npcTurn" && snap.ctx.turnIndex === turn;

  /**
   * Cut or containment by moderation (03 §7.7): the safety_event is left (without the text) and the client learns of it via
   * `scene.safety`. On a cut the NPC says the scripted safe line (in a scene with no NPC nothing is said: Lumi only
   * speaks through templates) and the turn continues; on containment the machine goes to `containment`.
   */
  function safetyStop(r: Run, verdict: Exclude<ModerationResult, { action: "allow" }>): void {
    safetyStore.append({
      id: newId(), accountId: deps.accountId, at: iso(), sceneRunId: r.sceneRunId, missionId: r.mission.id,
      sceneId: r.scene.escena_id, layer: verdict.layer, action: verdict.action, category: verdict.category, visibility: "operator",
    });
    send({ type: "scene.safety", layer: verdict.layer, action: verdict.action });
    if (verdict.action === "containment") return dispatch({ type: "safetyRisk" });
    if (r.npc) {
      const text = r.catalog.safety.containment.linea_segura_en;
      send({ type: "npc.line", line: { lineId: newId(), speaker: r.npc.id, kind: "safe", text, template: null } });
      addTranscript(r, "npc", text, "safe");
      r.lastNpcLine = text;
    }
    dispatch({ type: "npcDone" });
  }

  async function processTurn(r: Run, playerText: string | null, note: "simpler" | "continue" | null): Promise<void> {
    const gen = r.generation;
    const turn = snap.ctx.turnIndex;
    const role = deps.models.roles;
    const structures = [...r.mission.lenguaje_objetivo.estructuras, ...r.mission.lenguaje_objetivo.chunks];
    // Text mode: the input is moderated BEFORE reaching the model or the observer (03 §7.7 point 2).
    if (playerText !== null) {
      // Without a classifier the decision is synchronous: the model is called in the same tick (as in F4.1).
      const pendingInput = r.moderator.checkInput(playerText);
      const input = pendingInput instanceof Promise ? await pendingInput : pendingInput;
      if (!stillOn(r, gen, turn)) return;
      if (input.action !== "allow") return safetyStop(r, input);
      addTranscript(r, "player", playerText);
    }
    // A2: the goal was already met: this player turn (the farewell) closes the scene with the scripted line.
    if (r.completePending) return dispatch({ type: "criteriaMet" });
    // The observer runs while the NPC responds (03 §5.6); the decision is made with both results.
    const observing = playerText === null ? Promise.resolve(null) : runObserver(deps.observerModel, {
      turnId: `${r.sceneRunId}:${turn}`, playerText, lastNpcLine: r.lastNpcLine,
      criteria: r.scene.criterios_exito, structures, cefrBand: r.scene.banda,
    }, role.observer);
    const replying: Promise<{ text: string } | { error: string; cause: NoticeCause } | null> = r.npc && r.system
      ? deps.npcModel.generate({
        system: r.system, turns: modelTurns(r, note ? DIRECTOR_NOTES[note] : null),
        json: false, maxOutputTokens: role.textNpc.maxOutputTokens, timeoutMs: role.textNpc.timeoutMs,
      }).then((res) => ({ text: res.text }), (err: unknown) => ({ error: err instanceof Error ? err.message : "error", cause: noticeCause(err) }))
      : Promise.resolve(null);

    const obs = await observing;
    if (!stillOn(r, gen, turn)) return;
    const verdict = judge(r, obs, structures);
    if (verdict === "risk") return safetyStop(r, { action: "containment", layer: "observer", category: "observador" });
    if (verdict === "inappropriate") {
      await replying;
      if (!stillOn(r, gen, turn)) return;
      return safetyStop(r, { action: "cut", layer: "observer", category: "observador" });
    }
    if (verdict === "criteria") return dispatch({ type: "criteriaMet" });
    const reply = await replying;
    if (!stillOn(r, gen, turn)) return;
    if (reply && "text" in reply) {
      // Text output: synchronous and complete moderation before display (03 §7.7 point 4).
      if (!(await speakModerated(r, reply.text, () => stillOn(r, gen, turn)))) return;
    } else if (reply) {
      send({ type: "scene.notice", code: "model_unavailable", message: "El NPC no pudo responder (modelo no disponible).", cause: reply.cause });
    }
    dispatch(r.completePending ? { type: "criteriaMet" } : { type: "npcDone" });
  }

  /**
   * Applies the observer's result. The observer is also a safety layer, and its verdict always wins
   * over the criteria: a flagged turn does not fulfil the scene, leaves no evidence (or quote) and gets no reply.
   */
  function judge(r: Run, obs: Awaited<ReturnType<typeof runObserver>> | null, structures: readonly string[]):
    "risk" | "inappropriate" | "criteria" | "continue" {
    if (obs?.ok) {
      if (obs.result.safety === "risk") return "risk";
      if (obs.result.safety === "inappropriate") return "inappropriate";
      const update = applyCriteriaReports(r.criteriaDefs, r.criteria, obs.result.criteria);
      r.criteria = update.state;
      for (const ev of obs.result.evidence) {
        if (structures.includes(ev.structureId)) appendEvidence(r, { kind: ev.kind, structureId: ev.structureId, branch: ev.branch, quote: ev.quote });
      }
      // A2: a meters conversation scene is closed by the meters system, not by the observer's criteria.
      if (!r.conversation && criteriaSatisfied(r.criteriaDefs, r.criteria)) return "criteria";
    } else if (obs) {
      send({ type: "scene.notice", code: "observer_invalid", message: "El observador no devolvió un resultado válido; el turno sigue sin evaluar." });
    }
    return "continue";
  }

  /** Moderates the NPC's line and, if it passes, sends it and records it. false: it was cut (or the scene already moved on). */
  async function speakModerated(r: Run, text: string, still: () => boolean): Promise<boolean> {
    const output = await r.moderator.checkOutput(text, r.npc?.id ?? "LUMI");
    if (!still()) return false;
    if (output.action !== "allow") {
      safetyStop(r, { ...output, action: "cut" });
      return false;
    }
    send({ type: "npc.line", line: { lineId: newId(), speaker: r.npc?.id ?? "LUMI", kind: "reply", text, template: null } });
    addTranscript(r, "npc", text);
    r.lastNpcLine = text;
    return true;
  }

  // ---------- voice (F5.1a) ----------

  const voiceSetup = (r: Run): SceneVoiceSetup => ({
    systemInstruction: r.system ?? "",
    voiceName: (r.npc && deps.models.voice.voices.byNpc[r.npc.id]) ?? deps.models.voice.voices.default,
    languageCode: deps.models.voice.languageCode,
  });

  const newVoiceTurn = (r: Run, index: number, withClip: boolean): VoiceTurn => {
    const turnId = `${r.sceneRunId}:${index}`;
    return {
      turnId, index, heard: "", clip: withClip ? createTurnClip(turnId) : null, cancelClipTimer: null,
      transcript: deferred<string>(), npcText: [], npcFinal: null, npcDone: deferred<boolean>(), cut: false,
    };
  };

  /** What the server heard from the player travels to the client as text (the schema cap is never exceeded). */
  const sendHeard = (t: VoiceTurn, text: string, final: boolean): void =>
    send({ type: "turn.transcript", turnId: t.turnId, speaker: "player", text: text.slice(0, MAX_TRANSCRIPT_CHARS), final });

  const releaseClip = (t: VoiceTurn): void => {
    t.cancelClipTimer?.();
    t.cancelClipTimer = null;
    t.clip?.release();
  };

  /** Opens the voice session during the pretask; if it doesn't open, the scene carries on by text (sceneFailed). */
  function openVoice(r: Run, v: VoiceRun): void {
    const gen = r.generation;
    const setup = voiceSetup(r);
    v.system = setup.systemInstruction;
    track(v.provider.open(setup).then(() => {
      if (run !== r || r.generation !== gen || r.voice !== v) return void v.provider.close("abort");
      v.opened = true;
      v.openedAt = deps.clock.now();
      // The already-spoken scripted opening enters as a previous model turn: it doesn't trigger a reply (P0 §4.2).
      if (r.openingTurn) v.provider.injectContext([{ role: "user", text: SCENE_START_NOTE }, { role: "model", text: r.openingTurn }]);
      if (v.system !== (r.system ?? "")) refreshVoice(r); // the note changed while it was opening
      dispatch({ type: "sceneReady" });
    }, () => {
      if (run !== r || r.voice !== v) return;
      r.voice = null;
      send({ type: "scene.notice", code: "model_unavailable", message: "La voz no está disponible ahora; la escena sigue por texto." });
      dispatch({ type: "sceneFailed", reason: "net" });
    }));
  }

  /** Closes the voice session: releases the clips, closes the adapter and writes the scene's cost row. */
  function closeVoice(r: Run, reason: CloseReason): void {
    dropVoiceSwap(r);
    const v = r.voice;
    if (!v) return;
    r.voice = null;
    for (const t of v.turns.values()) {
      releaseClip(t);
      t.transcript.resolve("");
      t.npcDone.resolve(false);
    }
    track(v.provider.close(reason).catch(() => {}));
    if (!v.opened) return;
    // Also runs inside the Live socket handler (unrecoverable error): a ledger failure (disk full,
    // locked file) must not bring the process down, same as in recordTurn.
    try {
      const { alert } = ledger.closeScene({
        at: iso(), sceneRunId: r.sceneRunId, accountId: deps.accountId, adapter: v.provider.adapter,
        wallSeconds: Math.max(0, (deps.clock.now() - v.openedAt) / 1000),
      });
      if (alert) deps.onCostAlert?.(alert);
    } catch (err) {
      deps.onCostError?.(err instanceof Error ? err.message : "error del libro de costos");
    }
  }

  // ---------- A2: updated NPC note in voice (ADR-027 "Phase change in Live") ----------
  // Live doesn't allow changing the system instruction of an open session. A NEW session is opened with the updated
  // instruction while the scene carries on in the old one; at the next safe point (player turn waiting, nobody
  // speaking) the scene history, ending in a model turn (generates nothing), is injected into it and it is swapped in.
  // The cost clock follows the first session's: the scene has ONE cost row. If the new one doesn't open, the note
  // enters the current session as [DIRECTOR] context (also ending in a model turn).

  function dropVoiceSwap(r: Run): void {
    const swap = r.voiceSwap;
    r.voiceSwap = null;
    if (swap) track(swap.run.provider.close("abort").catch(() => {}));
  }

  function refreshVoice(r: Run): void {
    const v = r.voice;
    const factory = deps.voice;
    if (!v?.opened || !factory || snap.ctx.modality !== "voice") return;
    const system = r.system ?? "";
    if (r.voiceSwap) {
      if (r.voiceSwap.run.system === system) return;
      dropVoiceSwap(r); // a newer note: the session that was opening is already stale
    }
    if (v.system === system) return;
    const provider = factory();
    const next: VoiceRun = { provider, opened: false, openedAt: v.openedAt, system, speaking: null, turns: new Map() };
    provider.on((ev) => onVoiceEvent(r, next, ev));
    const swap: VoiceSwap = { run: next, state: "opening" };
    r.voiceSwap = swap;
    const gen = r.generation;
    track(provider.open(voiceSetup(r)).then(() => {
      if (run !== r || r.generation !== gen || r.voiceSwap !== swap) return void provider.close("abort").catch(() => {});
      swap.state = "ready";
      trySwapVoice(r);
    }, () => {
      if (r.voiceSwap !== swap) return;
      swap.state = "failed";
      trySwapVoice(r);
    }));
  }

  /** Scene history for the new session, ending in a model turn (so it doesn't generate a reply). */
  const historyForSwap = (r: Run): TextTurn[] => {
    const turns = modelTurns(r, null);
    if (turns[turns.length - 1]?.role !== "model") turns.push({ role: "model", text: QUIET_MODEL_TURN });
    return turns;
  };

  function trySwapVoice(r: Run): void {
    const swap = r.voiceSwap;
    const old = r.voice;
    if (!swap || swap.state === "opening" || !old) return;
    if (snap.state !== "playerTurn" || snap.sub !== "waiting" || old.speaking) return; // safe point
    r.voiceSwap = null;
    if (swap.state === "failed") {
      old.provider.injectContext([{ role: "user", text: `${BRIEF_UPDATE_NOTE}\n${r.brief ?? ""}` }, { role: "model", text: QUIET_MODEL_TURN }]);
      old.system = r.system ?? "";
      return;
    }
    if (swap.run.system !== (r.system ?? "")) {
      track(swap.run.provider.close("abort").catch(() => {}));
      return refreshVoice(r);
    }
    swap.run.provider.injectContext(historyForSwap(r));
    swap.run.opened = true;
    r.voice = swap.run;
    for (const t of old.turns.values()) {
      releaseClip(t);
      t.transcript.resolve("");
      t.npcDone.resolve(false);
    }
    // No ledger.closeScene: the scene's cost row is written by closeVoice at the end, with the first session's clock.
    track(old.provider.close("done").catch(() => {}));
  }

  function onVoiceEvent(r: Run, v: VoiceRun, ev: VoiceEvent): void {
    if (run !== r || r.voice !== v) return;
    const t = "turnId" in ev && ev.turnId ? v.turns.get(ev.turnId) : undefined;
    switch (ev.type) {
      case "playerTranscriptPartial":
        // F5.2: the client sees what is being heard; the hooks, as a non-final turn (not yet moderated).
        if (!t?.clip || ev.text === "") return;
        t.heard = joinHeard(t.heard, ev.text);
        sendHeard(t, t.heard, false);
        return emitTurn(r, "player", t.heard, false, "turn", t.index);
      case "playerTranscriptFinal":
        return t?.transcript.resolve(ev.text);
      case "npcTextFinal":
        if (t) t.npcFinal = ev.text;
        return;
      case "npcTranscript":
        t?.npcText.push(ev.text);
        return;
      case "npcAudioChunk":
        // Invariant (a): NPC audio only in npcTurn, of the current turn and not cut.
        if (t && !t.cut && snap.state === "npcTurn" && t.turnId === `${r.sceneRunId}:${snap.ctx.turnIndex}`) sendAudioOut(ev.pcm16);
        return;
      case "interrupted":
        if (t) t.cut = true;
        return;
      case "npcTurnDone":
        t?.transcript.resolve("");
        t?.npcDone.resolve(true);
        return;
      case "usage":
        // Runs inside the provider's socket handler: a missing rate must not bring the process down.
        try {
          ledger.recordTurn({
            at: iso(), sceneRunId: r.sceneRunId, turnId: ev.turnId, accountId: deps.accountId,
            adapter: v.provider.adapter, provider: v.provider.provider, model: v.provider.model, usage: ev.usage,
          });
        } catch (err) {
          deps.onCostError?.(err instanceof Error ? err.message : "error del libro de costos");
        }
        return;
      case "sessionEnding":
        return; // the adapter reconnects on its own with the resumption handle
      case "error":
        if (ev.recoverable) return;
        // The voice was lost: the same scene carries on by text from the last turn (03 §5.4 point 5, §5.8).
        closeVoice(r, "error");
        send({ type: "scene.notice", code: "model_unavailable", message: "Se perdió la voz; la escena sigue por texto." });
        return dispatch({ type: "voiceLost" });
    }
  }

  /** Closed voice turn: transcript → input moderation → observer (with the clip) → moderated NPC line. */
  async function processVoiceTurn(r: Run, t: VoiceTurn): Promise<void> {
    const gen = r.generation;
    const turn = snap.ctx.turnIndex;
    const still = (): boolean => stillOn(r, gen, turn);
    const structures = [...r.mission.lenguaje_objetivo.estructuras, ...r.mission.lenguaje_objetivo.chunks];
    let verdict: ReturnType<typeof judge> = "continue";
    try {
      if (t.clip) {
        const playerText = await t.transcript.promise;
        if (!still()) return;
        if (playerText !== "") {
          const input = await r.moderator.checkInput(playerText);
          if (!still()) return;
          if (input.action !== "allow") {
            t.cut = true;
            return safetyStop(r, input);
          }
          addTranscript(r, "player", playerText);
        }
        sendHeard(t, playerText, true); // "" = nothing was heard (the client says so)
        // A2: the goal was already met: the player's farewell closes the scene (the NPC audio is already cut).
        if (r.completePending) {
          t.cut = true;
          return dispatch({ type: "criteriaMet" });
        }
        const obs = await runObserver(deps.observerModel, {
          turnId: t.turnId, playerText, lastNpcLine: r.lastNpcLine, criteria: r.scene.criterios_exito, structures,
          cefrBand: r.scene.banda, audio: readOnly(t.clip),
        }, deps.models.roles.observer);
        releaseClip(t); // the observer already read the clip: it is released (it doesn't wait for the 10 s)
        if (!still()) return;
        verdict = judge(r, obs, structures);
        if (verdict === "risk") {
          t.cut = true;
          return safetyStop(r, { action: "containment", layer: "observer", category: "observador" });
        }
      }
      const spoke = await t.npcDone.promise;
      if (!still()) return;
      if (verdict === "inappropriate") return safetyStop(r, { action: "cut", layer: "observer", category: "observador" });
      const text = (t.npcFinal ?? t.npcText.join("")).trim();
      if (spoke && text !== "" && !t.cut && !(await speakModerated(r, text, still))) return;
      dispatch(verdict === "criteria" || r.completePending ? { type: "criteriaMet" } : { type: "npcDone" });
    } finally {
      releaseClip(t);
    }
  }

  /** The player starts speaking (voice.turnStart): new turn with its clip, or resumes the one that was paused. */
  function voiceTurnStart(r: Run, v: VoiceRun): void {
    if (snap.sub === "endPending" && v.speaking) return dispatch({ type: "speechResume" });
    const t = newVoiceTurn(r, snap.ctx.turnIndex + 1, true);
    if (t.clip) deps.onTurnClip?.(readOnly(t.clip));
    v.turns.set(t.turnId, t);
    v.speaking = t;
    v.provider.startTurn(t.turnId);
    dispatch({ type: "speechStart" });
  }

  /** Commit of the spoken turn: activityEnd to the provider and the clip starts counting its 10 s. */
  function commitVoiceTurn(r: Run, v: VoiceRun, via: "pressDone" | "turnTimer" | "pass" | "hardCap"): void {
    const t = v.speaking;
    v.speaking = null;
    if (!t) return;
    // hardCap: the session closes now, there is no reply or transcript to wait for. pass: the spoken turn is discarded.
    if (via === "hardCap" || via === "pass") {
      v.turns.delete(t.turnId);
      return releaseClip(t);
    }
    t.cancelClipTimer = scheduler.schedule(deps.models.voice.clipTtlMs, () => releaseClip(t));
    if (r.completePending) t.cut = true; // A2: the model's reply is not heard; the scripted closing follows
    v.provider.endTurn(t.turnId);
    track(processVoiceTurn(r, t));
  }

  /** Pass with a [DIRECTOR] note in voice: the model responds to the note, with no spoken turn. */
  function directorReply(r: Run, v: VoiceRun, note: "simpler" | "continue"): void {
    const t = newVoiceTurn(r, snap.ctx.turnIndex, false);
    if (r.completePending) t.cut = true;
    v.turns.set(t.turnId, t);
    v.provider.injectContext([{ role: "user", text: DIRECTOR_NOTES[note] }], t.turnId);
    track(processVoiceTurn(r, t));
  }

  // ---------- effects ----------

  const finish = (r: Run, outcome: "success" | "partial" | "hardCap" | "containment"): void => {
    const criteriaMet = metCriteriaIds(r.criteriaDefs, r.criteria);
    // A2: a meters conversation without success does not close the mission: it stays open and what is known is kept (the
    // encounter state is saved by its system), so the next visit continues from there.
    const keepOpen = r.conversation !== null && outcome !== "success";
    if (outcome !== "containment" && !keepOpen) {
      // Closing without criteria (doesn't converge / hard cap) still leaves the world as the sheet says (salida_si_no_converge):
      // the player never "loses" the scene (02 §3.2 G3; invariant d).
      const effects = sceneCloseEffects(r.mission, r.scene.escena_id, r.progress.story);
      appendEvidence(r, { kind: "mission_outcome", outcome, effects, criteriaMet });
      send({ type: "scene.effects", missionId: r.mission.id, sceneId: r.scene.escena_id, effects });
    }
    send({ type: "scene.end", outcome, criteriaMet, evidence: r.evidence });
    callHook(deps.conversation, deps.conversation?.onSceneEnd, { sceneRunId: r.sceneRunId, outcome, criteriaMet });
  };

  function runEffect(r: Run, eff: SceneEffect): void {
    switch (eff.type) {
      case "openSession":
        if (r.voice) return openVoice(r, r.voice); // voice: opened during the pretask (03 §5.4 point 1)
        queue.push({ type: "sceneReady" }); // text: there is no session to warm up
        return;
      case "startPretask": {
        const pre = applies(r.mission.pre_tarea);
        if (pre) send({ type: "npc.line", line: { lineId: newId(), speaker: "LUMI", kind: "pretask", text: null, template: pre.plantilla } });
        queue.push({ type: "pretaskDone" });
        return;
      }
      case "startClock": {
        // The scene's own caps (a free conversation needs more room) or those from models.yaml.
        const topes = r.scene.topes;
        const softCapMs = topes ? topes.suave_s * 1000 : deps.models.scene.softCapMs;
        const hardCapMs = topes ? topes.duro_s * 1000 : deps.models.scene.hardCapMs;
        r.cancelCaps = [
          scheduler.schedule(softCapMs, () => dispatch({ type: "softCap" })),
          scheduler.schedule(hardCapMs, () => dispatch({ type: "hardCap" })),
        ];
        return;
      }
      case "stopClock":
        r.cancelCaps.forEach((c) => c());
        r.cancelCaps = [];
        return;
      case "emitLine":
        if (eff.line === "opening") sendLines(r, openingLines(r.scene), "opening");
        else if (eff.line === "closing") sendLines(r, r.scene.cierre_guionado, "closing");
        else if (eff.line === "exit") sendLines(r, exitLines(r.scene), "exit");
        else {
          // Containment (D-112): out-of-fiction line + local help resource; provisional texts until F13.
          const c = r.catalog.safety.containment;
          const resource = c.recursos[c.pais_por_defecto];
          send({ type: "scene.notice", code: "containment", message: "Escena detenida por seguridad." });
          send({
            type: "scene.containment", line: c.contencion_es,
            resource: resource ? { label: resource.etiqueta, detail: resource.detalle } : null, provisional: c.estado !== "revisado",
          });
        }
        return;
      case "startTurnTimer":
        r.cancelTurnTimer = scheduler.schedule(deps.models.scene.turnTimerMs, () => dispatch({ type: "turnTimer" }));
        return;
      case "cancelTurnTimer":
        r.cancelTurnTimer?.();
        r.cancelTurnTimer = null;
        return;
      case "commitTurn":
        // Text: enters the transcript only after the input moderation (processTurn): a cut turn
        // never reaches the model. If the commit is due to the hard cap, the scene closes and the text is not used.
        // Voice: activityEnd and the turn is processed with the transcript and the clip.
        if (r.voice && snap.ctx.modality === "voice") commitVoiceTurn(r, r.voice, eff.via);
        return;
      case "requestNpcReply": {
        if (r.voice && snap.ctx.modality === "voice") {
          // Without a note, the reply was already requested by the commit's activityEnd; with a note, the [DIRECTOR] note requests it.
          if (eff.directorNote) directorReply(r, r.voice, eff.directorNote);
          return;
        }
        const text = r.pendingText;
        r.pendingText = null;
        track(processTurn(r, text, eff.directorNote));
        return;
      }
      case "closeSession":
        r.generation++; // whatever is in flight no longer speaks (invariant e)
        // Live closes on entering closing (also by hardCap: the closing line is the scripted one, D-130).
        closeVoice(r, snap.state === "aborted" ? "abort" : snap.ctx.closingReason === "hardCap" ? "hardCap" : "done");
        return;
      case "cutAudio":
        for (const t of r.voice?.turns.values() ?? []) t.cut = true;
        return;
      case "modalityChanged":
        // Voice → text (sceneFailed, voiceLost, budgetExhausted): the voice session does not continue.
        if (eff.modality === "text") closeVoice(r, "error");
        return;
      case "sceneEnded":
        finish(r, eff.outcome);
        return;
      case "sceneAborted":
        send({ type: "scene.end", outcome: "aborted", criteriaMet: [], evidence: r.evidence });
        callHook(deps.conversation, deps.conversation?.onSceneEnd, { sceneRunId: r.sceneRunId, outcome: "aborted", criteriaMet: [] });
        return;
      // No effect yet: Lumi (F6) and the pass menu (shown by the client via scene.state).
      case "showPassMenu":
      case "passOption":
      case "companionSignal":
      case "posttask":
        return;
    }
  }

  function dispatch(ev: SceneEvent): void {
    queue.push(ev);
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        const next = queue.shift() as SceneEvent;
        const r = run;
        if (!r) continue;
        const prev = snap.state;
        const t = sceneTransition(snap, next);
        if (!t.changed) continue;
        snap = t.snapshot;
        sendState();
        for (const eff of t.effects) runEffect(r, eff);
        if (r.voiceSwap && snap.state === "playerTurn" && snap.sub === "waiting") trySwapVoice(r);
        const auto = AUTO_DONE[snap.state];
        if (auto && snap.state !== prev) queue.push(auto);
      }
    } finally {
      draining = false;
    }
  }

  // ---------- client messages ----------

  function start(npcId: string | null, wanted: "voice" | "text"): void {
    if (run && ACTIVE_RUN.includes(snap.state)) return fail("scene_busy", "Ya hay una escena en curso.");
    const catalog = readCatalog(deps.content());
    const npc = npcId === null ? null : catalog.npc(npcId) ?? null;
    if (npcId !== null && !npc) return fail("unknown_npc", "No existe ese NPC.");
    const progress = foldProgress(withoutResets(deps.evidence.list(deps.accountId), deps.resets?.() ?? []), catalog);
    const res = resolveScene(catalog.missions, npc, progress.story);
    if (res.kind === "notIntroduced") {
      send({ type: "npc.line", line: { lineId: newId(), speaker: res.npcId, kind: "notIntroduced", text: NOT_INTRODUCED_LINE, template: null } });
      return send({ type: "scene.blocked", npcId: res.npcId, reason: "notIntroduced" });
    }
    const mission = res.kind === "scene" ? catalog.mission(res.missionId) : undefined;
    const scene = res.kind === "scene" ? catalog.scene(res.missionId, res.sceneId) : undefined;
    if (!mission || !scene) return send({ type: "scene.blocked", npcId, reason: "noScene" });
    const intro = npc ? catalog.introOf(npc.id) : undefined;
    const built = npc ? buildNpcPrompt({
      catalog, npc, scene, world: progress.world,
      introducedBy: intro && progress.story.intros.includes(npc.id) ? intro.presentado_por : null,
    }) : null;
    const conversation = scene.conversacion ? catalog.conversation(scene.conversacion) ?? null : null;
    run = {
      catalog, mission, scene, npc, sceneRunId: newId(), progress,
      system: built?.system ?? null, openingTurn: built?.openingAsModelTurn ?? null,
      conversation, baseSystem: built?.system ?? null, brief: null, completePending: false, voiceSwap: null,
      criteriaDefs: scene.criterios_exito.map((c) => ({ id: c.id, optional: c.opcional })),
      criteria: emptyCriteria(), transcript: [], evidence: [], lastNpcLine: null, pendingText: null,
      generation: 0, cancelCaps: [], cancelTurnTimer: null,
      moderator: createModerator({ lists: catalog.safety.lists, classifier: deps.moderation ?? null }),
      voice: null,
    };
    // Voice only with an NPC and a configured adapter; without an adapter (e.g. no key), the scene goes by text with a notice.
    // A scene with no NPC (Lumi only) doesn't open a voice session: Lumi speaks through templates (02 §2.7).
    let modality: "voice" | "text" = "text";
    if (wanted === "voice" && npc) {
      if (deps.voice) {
        const provider = deps.voice();
        const v: VoiceRun = { provider, opened: false, openedAt: 0, system: "", speaking: null, turns: new Map() };
        const r = run;
        provider.on((ev) => onVoiceEvent(r, v, ev));
        run.voice = v;
        modality = "voice";
      } else {
        send({ type: "scene.notice", code: "model_unavailable", message: "La voz no está disponible (sin proveedor configurado); la escena va por texto." });
      }
    }
    snap = initialSceneSnapshot();
    send({ type: "scene.opened", sceneRunId: run.sceneRunId, missionId: mission.id, sceneId: scene.escena_id, npcId, modality });
    const r = run;
    const live = (): boolean => run === r && (snap.state === "idle" || ACTIVE_RUN.includes(snap.state));
    const control: ConversationSceneControl = {
      setNpcBrief(block) {
        if (!live()) return;
        r.brief = block;
        r.system = r.baseSystem === null ? null : block ? `${r.baseSystem}\n\n${block}` : r.baseSystem;
        refreshVoice(r);
      },
      complete() {
        if (live()) r.completePending = true;
      },
      sendState(view) {
        if (run === r) send({ type: "conversation.state", ...view });
      },
    };
    callHook(deps.conversation, deps.conversation?.onSceneStart, {
      sceneRunId: run.sceneRunId, accountId: deps.accountId, missionId: mission.id, sceneId: scene.escena_id, npcId, npcName: npc?.nombre ?? null, modality, conversation,
    }, control);
    dispatch({ type: "interact", npcId, sceneId: scene.escena_id, modality });
  }

  /** Voice messages: only with the voice session open and on the player's turn. */
  function handleVoice(type: "voice.turnStart" | "voice.turnEnd"): void {
    const r = run;
    const v = r?.voice;
    if (!r || !v?.opened || snap.ctx.modality !== "voice") return fail("not_voice", "La escena no está en modo voz.");
    if (snap.state !== "playerTurn") return fail("not_your_turn", "No es tu turno.");
    if (type === "voice.turnStart") {
      if (snap.sub !== "waiting" && snap.sub !== "endPending") return fail("not_your_turn", "No es tu turno.");
      return voiceTurnStart(r, v);
    }
    // End of the spoken turn (Done or the client's silence threshold): pause + confirmation.
    if (snap.sub !== "speaking" && snap.sub !== "endPending") return fail("not_your_turn", "No hay un turno hablado abierto.");
    if (snap.sub === "speaking") dispatch({ type: "speechPause" });
    dispatch({ type: "pressDone" });
  }

  function handle(msg: ClientMessage): void {
    switch (msg.type) {
      case "scene.start":
        return start(msg.npcId, msg.modality ?? "text");
      case "turn.text": {
        if (!run || snap.state !== "playerTurn" || (snap.sub !== "waiting" && snap.sub !== "speaking" && snap.sub !== "endPending")) {
          return fail("not_your_turn", "No es tu turno.");
        }
        if (snap.ctx.modality === "voice") return fail("not_your_turn", "La escena está en voz: el turno se habla.");
        run.pendingText = msg.text;
        if (snap.sub === "waiting") dispatch({ type: "speechStart" });
        if (snap.sub === "speaking") dispatch({ type: "speechPause" });
        return dispatch({ type: "pressDone" });
      }
      case "turn.pass":
        if (!run || snap.state !== "playerTurn" || (snap.sub !== "waiting" && snap.sub !== "endPending")) return fail("not_your_turn", "No es tu turno.");
        return dispatch({ type: "pressPass" });
      case "turn.choose":
        if (!run || snap.state !== "playerTurn" || snap.sub !== "passMenu") return fail("not_your_turn", "No hay menú abierto.");
        return dispatch({ type: "choose", option: msg.option });
      case "scene.abort":
        return dispatch({ type: "abort" });
      case "voice.turnStart":
      case "voice.turnEnd":
        return handleVoice(msg.type);
    }
  }

  const settled = async (): Promise<void> => {
    while (pending.size > 0) await Promise.all([...pending]);
  };

  return {
    async receive(raw) {
      const parsed = ClientMessageSchema.safeParse(raw);
      if (!parsed.success) return fail("bad_message", "Mensaje inválido.");
      handle(parsed.data);
      await settled();
    },
    receiveAudio(pcm16) {
      const v = run?.voice;
      if (!v?.opened || snap.ctx.modality !== "voice") return false;
      const t = v.speaking;
      if (!t || snap.state !== "playerTurn" || snap.sub !== "speaking") return true;
      t.clip?.append(pcm16); // the clip belongs to scene-runtime (its own copy)
      v.provider.sendAudio(t.turnId, pcm16);
      return true;
    },
    close() {
      if (run && ACTIVE_RUN.includes(snap.state)) dispatch({ type: "abort" });
      if (run) {
        run.cancelCaps.forEach((c) => c());
        run.cancelTurnTimer?.();
        run.generation++;
        closeVoice(run, "abort");
      }
    },
    get snapshot() {
      return snap;
    },
    settled,
  };
}
