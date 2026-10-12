// scene-runtime (03 §4.2): orquesta UNA escena por conexión con la máquina de @lg/core/scene. Ejecuta los efectos que
// la máquina devuelve (siempre con el estado destino ya vigente), dispara los temporizadores (softCap, hardCap,
// turnTimer: el servidor manda, D-130), llama al NPC (modelo de texto) y al observador, evalúa criterios y, al cerrar,
// emite los efectos de misión y la evidencia (EvidenceStore). F4.1 es solo texto: los "terminé de decir la línea" que
// en voz manda el cliente acá los da el propio runtime apenas envía el texto.
// Nunca envía al cliente un prompt, un nombre de modelo ni una clave (A4): todo sale por mensajes del protocolo, que
// son objetos estrictos, y `send` valida cada uno antes de mandarlo.
// F5.1a (voz, 03 §5.4-§5.6, §5.11): con `modality: "voice"` abre UNA sesión del `RealtimeVoiceProvider` configurado
// durante la pretarea, con el setup armado acá; es el único dueño del TurnClip de cada turno (lo arma con el audio del
// jugador, lo pasa de solo lectura al observador y lo libera al terminar o a los 10 s); modera la salida (no el
// adaptador); cierra la sesión al entrar a `closing` (hardCap incluido: la línea de cierre es la guionada) y registra el
// costo de cada `usage` en el CostLedger. Si la voz no abre o se pierde, la misma escena sigue por texto.
import { randomUUID } from "node:crypto";
import {
  applyCriteriaReports, criteriaSatisfied, emptyCriteria, initialSceneSnapshot, metCriteriaIds, resolveScene,
  sceneCloseEffects, sceneTransition,
  type CriteriaState, type CriterionDef, type SceneEffect, type SceneEvent, type SceneSnapshot, type SceneStateName,
} from "@lg/core/scene";
import type { Clock } from "@lg/core";
import {
  ClientMessageSchema, ServerMessageSchema,
  type ClientMessage, type EvidenceEvent, type ServerMessage,
} from "@lg/protocol";
import type { Escena, LineaGuionada, Mision, Npc } from "@lg/content-schema";
import type { ServerContent } from "../content/loader.ts";
import type { ModelsConfig } from "../config/models.ts";
import { runObserver } from "../observer/observer.ts";
import type { TextModelProvider, TextTurn } from "../providers/text.ts";
import type { EvidenceStore } from "../store/evidence.ts";
import { createModerator, type ModerationResult, type Moderator } from "../moderation/moderation.ts";
import type { ModerationProvider } from "../providers/moderation.ts";
import { createMemorySafetyStore, type SafetyEventStore } from "../store/safety.ts";
import { costPolicyFromConfig, createMemoryCostLedger, type CostAlert, type CostLedger } from "../cost/ledger.ts";
import type { CloseReason, RealtimeVoiceProvider, SceneVoiceSetup, VoiceEvent, VoiceProviderFactory } from "../providers/types.ts";
import { applies, exitLines, isNpcLine, openingLines, readCatalog, renderScriptedText, type Catalog } from "./catalog.ts";
import { foldProgress, type OperatorProgress } from "./progress.ts";
import { buildNpcPrompt } from "./prompt.ts";
import { createTurnClip, readOnly, type TurnClip, type TurnClipView } from "./turn-clip.ts";
import { callHook, type ConversationHooks } from "./hooks.ts";

/** Línea guionada de un NPC que pide presentación y nadie lo presentó (02 §1.7). */
export const NOT_INTRODUCED_LINE = "Hi! Do I know you?";

/** Notas [DIRECTOR] de "Pasar el turno" (03 §5.5.3): el modelo nunca las dice en voz alta. */
const DIRECTOR_NOTES = {
  simpler: "[DIRECTOR] The player asked for something simpler: rephrase your last line with fewer words and offer two options.",
  continue: "[DIRECTOR] Continue the conversation without waiting for an answer; give the player an easy yes/no question.",
} as const;
const SCENE_START_NOTE = "[DIRECTOR] The scene starts now.";

export interface Scheduler {
  /** Programa `fn` en `ms`; devuelve la cancelación. */
  schedule(ms: number, fn: () => void): () => void;
}

export const realScheduler: Scheduler = {
  schedule(ms, fn) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export interface SceneDeps {
  /** Contenido para la escena que arranca (loader.forNextScene: el modo director relee entre escenas). */
  content: () => ServerContent;
  npcModel: TextModelProvider;
  observerModel: TextModelProvider;
  models: ModelsConfig;
  evidence: EvidenceStore;
  accountId: string;
  clock: Clock;
  scheduler?: Scheduler;
  newId?: () => string;
  /** Clasificador de moderación (F4.2, 03 §7.7). null o ausente: la capa no corre; las listas y reglas sí. */
  moderation?: ModerationProvider | null;
  /** safety_events (D-112). Sin él, en memoria. */
  safety?: SafetyEventStore;
  /** Adaptador de voz elegido por configuración (providers/voice.ts). null o ausente: sin voz (la escena va por texto). */
  voice?: VoiceProviderFactory | null;
  /** Libro de costos de voz. Sin él, en memoria con las tarifas de models.yaml. */
  ledger?: CostLedger;
  /** Alerta de costo (D-027): no corta nada, solo avisa al operador. */
  onCostAlert?: (alert: CostAlert) => void;
  /** El libro de costos no pudo registrar un uso (p. ej. sin tarifa para el adaptador): se avisa y la escena sigue. */
  onCostError?: (message: string) => void;
  /** Diagnóstico (tests): vista de solo lectura de cada TurnClip al crearse, para ver que se libera. */
  onTurnClip?: (clip: TurnClipView) => void;
  /** F5.2: ganchos de conversación (hooks.ts): arranque, cada turno de jugador y NPC, y fin de la escena. */
  conversation?: ConversationHooks;
}

export interface SceneSession {
  /** Un mensaje crudo del cliente (ya parseado como JSON). Resuelve cuando la escena quedó quieta. */
  receive(raw: unknown): Promise<void>;
  /**
   * Un frame de audio del jugador (PCM16 16 kHz, ADR-017). false: la escena no está en voz (el gateway avisa); en voz,
   * un frame fuera del turno hablado (p. ej. el que llega tarde) se descarta en silencio.
   */
  receiveAudio(pcm16: Int16Array): boolean;
  /** La conexión se cerró: una escena activa se aborta (se reanuda desde su inicio, 03 §3.5.1). */
  close(): void;
  readonly snapshot: SceneSnapshot;
  /** Espera a que terminen las llamadas en curso (NPC y observador). */
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
  /** Sube al cerrar la sesión: una respuesta en vuelo de una generación vieja se descarta. */
  generation: number;
  cancelCaps: (() => void)[];
  cancelTurnTimer: (() => void) | null;
  moderator: Moderator;
  /** Sesión de voz de la escena (null en texto, o después de cerrarla o perderla). */
  voice: VoiceRun | null;
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

/** Un turno de voz: el del jugador (con clip) o una respuesta pedida por una nota [DIRECTOR] (sin clip). */
interface VoiceTurn {
  turnId: string;
  /** turnIndex de la escena al que pertenece este turno (el del jugador cuenta al confirmarse). */
  index: number;
  /** Lo que se va oyendo del jugador (transcripción parcial acumulada). */
  heard: string;
  clip: TurnClip | null;
  cancelClipTimer: (() => void) | null;
  /** Transcripción final del jugador; "" si no se oyó nada o la voz se perdió. */
  transcript: Deferred<string>;
  npcText: string[];
  npcFinal: string | null;
  /** true: el NPC terminó; false: la voz se perdió antes. */
  npcDone: Deferred<boolean>;
  /** Moderación o tope: el audio que siga llegando de este turno no sale. */
  cut: boolean;
}

interface VoiceRun {
  provider: RealtimeVoiceProvider;
  opened: boolean;
  openedAt: number;
  /** Turno del jugador abierto (entre voice.turnStart y el commit). */
  speaking: VoiceTurn | null;
  turns: Map<string, VoiceTurn>;
}

/**
 * El runtime da por terminada la línea de cada estado apenas la manda. En voz también, mientras las líneas guionadas no
 * tengan audio cacheado (03 §6.3, F8) ni el cliente confirme su reproducción (F5.2): las dice el cliente como texto.
 * `npcTurn` no está acá: en voz lo cierra el `npcTurnDone` del adaptador.
 */
const AUTO_DONE: Partial<Record<SceneStateName, SceneEvent>> = {
  npcOpening: { type: "openingDone" },
  signal: { type: "companionDone" },
  nonConverging: { type: "nonConvergingDone" },
  containment: { type: "containmentDone" },
  closing: { type: "closingDone" },
  posttask: { type: "posttaskDone" },
};

/** Tope de `turn.transcript` en @lg/protocol. */
const MAX_TRANSCRIPT_CHARS = 2000;

/** Junta pedazos de la transcripción de entrada con un espacio entre palabras (como el adaptador Live). */
const joinHeard = (acc: string, piece: string): string =>
  acc && !acc.endsWith(" ") && !piece.startsWith(" ") ? `${acc} ${piece}` : `${acc}${piece}`;

const ACTIVE_RUN: readonly SceneStateName[] = ["pretask", "npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging", "closing", "posttask", "containment"];

export function createSceneSession(
  deps: SceneDeps,
  sendRaw: (msg: ServerMessage) => void,
  /** Audio del NPC hacia el cliente (frames binarios, NPC_AUDIO_SAMPLE_RATE). */
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

  /** Todo mensaje pasa por el esquema estricto: lo que no está en el protocolo no sale (A4). */
  const send = (msg: ServerMessage): void => sendRaw(ServerMessageSchema.parse(msg));
  const fail = (code: Extract<ServerMessage, { type: "error" }>["code"], message: string): void => send({ type: "error", code, message });

  const sendState = (): void => send({
    type: "scene.state", state: snap.state, sub: snap.sub, modality: snap.ctx.modality,
    turnIndex: snap.ctx.turnIndex, softCapReached: snap.ctx.softCapReached,
  });

  const sendLines = (r: Run, lines: readonly LineaGuionada[], kind: "pretask" | "opening" | "closing" | "exit"): void => {
    for (const l of lines) {
      if (isNpcLine(l)) {
        // El servidor todavía no conoce el nombre de juego (llega con el onboarding): los huecos se dicen sin él.
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

  // ---------- ganchos de conversación (F5.2) ----------

  const emitTurn = (r: Run, speaker: "player" | "npc", text: string, final: boolean, kind: "turn" | "safe" = "turn",
    turnIndex: number = snap.ctx.turnIndex): void => callHook(deps.conversation, deps.conversation?.onTurn, {
    sceneRunId: r.sceneRunId, missionId: r.mission.id, sceneId: r.scene.escena_id, npcId: r.npc?.id ?? null,
    turnId: `${r.sceneRunId}:${turnIndex}`, turnIndex, speaker, text, final, modality: snap.ctx.modality, kind,
  });

  /** Un turno entra al transcripto de la escena (ya moderado) y los ganchos se enteran. */
  const addTranscript = (r: Run, speaker: "player" | "npc", text: string, kind: "turn" | "safe" = "turn"): void => {
    r.transcript.push({ speaker, text });
    emitTurn(r, speaker, text, true, kind);
  };

  // ---------- turno del NPC (texto) ----------

  const modelTurns = (r: Run, note: string | null): TextTurn[] => {
    const raw: TextTurn[] = [{ role: "user", text: SCENE_START_NOTE }];
    if (r.openingTurn) raw.push({ role: "model", text: r.openingTurn });
    for (const t of r.transcript) raw.push({ role: t.speaker === "player" ? "user" : "model", text: t.text });
    if (note) raw.push({ role: "user", text: note });
    // Turnos seguidos del mismo rol se juntan (el proveedor alterna usuario/modelo).
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
   * Corte o contención por moderación (03 §7.7): queda el safety_event (sin el texto) y el cliente lo sabe por
   * `scene.safety`. En un corte el NPC dice la línea segura guionada (en una escena sin NPC no se dice nada: Lumi solo
   * habla por plantillas) y el turno sigue; en contención la máquina pasa a `containment`.
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
    // Modo texto: la entrada se modera ANTES de llegar al modelo o al observador (03 §7.7 punto 2).
    if (playerText !== null) {
      // Sin clasificador la decisión es síncrona: el modelo se llama en el mismo tick (como en F4.1).
      const pendingInput = r.moderator.checkInput(playerText);
      const input = pendingInput instanceof Promise ? await pendingInput : pendingInput;
      if (!stillOn(r, gen, turn)) return;
      if (input.action !== "allow") return safetyStop(r, input);
      addTranscript(r, "player", playerText);
    }
    // El observador corre mientras el NPC responde (03 §5.6); la decisión se toma con los dos resultados.
    const observing = playerText === null ? Promise.resolve(null) : runObserver(deps.observerModel, {
      turnId: `${r.sceneRunId}:${turn}`, playerText, lastNpcLine: r.lastNpcLine,
      criteria: r.scene.criterios_exito, structures, cefrBand: r.scene.banda,
    }, role.observer);
    const replying: Promise<{ text: string } | { error: string } | null> = r.npc && r.system
      ? deps.npcModel.generate({
        system: r.system, turns: modelTurns(r, note ? DIRECTOR_NOTES[note] : null),
        json: false, maxOutputTokens: role.textNpc.maxOutputTokens, timeoutMs: role.textNpc.timeoutMs,
      }).then((res) => ({ text: res.text }), (err: unknown) => ({ error: err instanceof Error ? err.message : "error" }))
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
      // Salida en texto: moderación síncrona y completa antes de mostrar (03 §7.7 punto 4).
      if (!(await speakModerated(r, reply.text, () => stillOn(r, gen, turn)))) return;
    } else if (reply) {
      send({ type: "scene.notice", code: "model_unavailable", message: "El NPC no pudo responder (modelo no disponible)." });
    }
    dispatch({ type: "npcDone" });
  }

  /**
   * Aplica el resultado del observador. El observador también es una capa de seguridad, y su veredicto gana siempre
   * sobre los criterios: un turno marcado no cumple la escena, no deja evidencia (ni cita) y no recibe la respuesta.
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
      if (criteriaSatisfied(r.criteriaDefs, r.criteria)) return "criteria";
    } else if (obs) {
      send({ type: "scene.notice", code: "observer_invalid", message: "El observador no devolvió un resultado válido; el turno sigue sin evaluar." });
    }
    return "continue";
  }

  /** Modera la línea del NPC y, si pasa, la manda y la anota. false: se cortó (o la escena ya siguió). */
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

  // ---------- voz (F5.1a) ----------

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

  /** Lo que el servidor oyó del jugador viaja al cliente como texto (el tope del esquema nunca se pasa). */
  const sendHeard = (t: VoiceTurn, text: string, final: boolean): void =>
    send({ type: "turn.transcript", turnId: t.turnId, speaker: "player", text: text.slice(0, MAX_TRANSCRIPT_CHARS), final });

  const releaseClip = (t: VoiceTurn): void => {
    t.cancelClipTimer?.();
    t.cancelClipTimer = null;
    t.clip?.release();
  };

  /** Abre la sesión de voz durante la pretarea; si no abre, la escena sigue por texto (sceneFailed). */
  function openVoice(r: Run, v: VoiceRun): void {
    const gen = r.generation;
    track(v.provider.open(voiceSetup(r)).then(() => {
      if (run !== r || r.generation !== gen || r.voice !== v) return void v.provider.close("abort");
      v.opened = true;
      v.openedAt = deps.clock.now();
      // La apertura guionada ya dicha entra como turno previo del modelo: no dispara una respuesta (P0 §4.2).
      if (r.openingTurn) v.provider.injectContext([{ role: "user", text: SCENE_START_NOTE }, { role: "model", text: r.openingTurn }]);
      dispatch({ type: "sceneReady" });
    }, () => {
      if (run !== r || r.voice !== v) return;
      r.voice = null;
      send({ type: "scene.notice", code: "model_unavailable", message: "La voz no está disponible ahora; la escena sigue por texto." });
      dispatch({ type: "sceneFailed", reason: "net" });
    }));
  }

  /** Cierra la sesión de voz: libera los clips, cierra el adaptador y escribe la fila de costo de la escena. */
  function closeVoice(r: Run, reason: CloseReason): void {
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
    // Corre también dentro del handler del socket de Live (error no recuperable): un fallo del libro (disco lleno,
    // archivo bloqueado) no puede tirar el proceso, igual que en recordTurn.
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

  function onVoiceEvent(r: Run, v: VoiceRun, ev: VoiceEvent): void {
    if (run !== r || r.voice !== v) return;
    const t = "turnId" in ev && ev.turnId ? v.turns.get(ev.turnId) : undefined;
    switch (ev.type) {
      case "playerTranscriptPartial":
        // F5.2: el cliente ve lo que se va oyendo; los ganchos, como turno no final (sin moderar todavía).
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
        // Invariante (a): audio del NPC solo en npcTurn, del turno vigente y no cortado.
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
        // Corre dentro del manejador del socket del proveedor: una tarifa faltante no puede tirar el proceso.
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
        return; // el adaptador se reconecta solo con el handle de reanudación
      case "error":
        if (ev.recoverable) return;
        // La voz se perdió: la misma escena sigue por texto desde el último turno (03 §5.4 punto 5, §5.8).
        closeVoice(r, "error");
        send({ type: "scene.notice", code: "model_unavailable", message: "Se perdió la voz; la escena sigue por texto." });
        return dispatch({ type: "voiceLost" });
    }
  }

  /** Turno de voz cerrado: transcripción → moderación de entrada → observador (con el clip) → línea del NPC moderada. */
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
        sendHeard(t, playerText, true); // "" = no se oyó nada (el cliente lo dice)
        const obs = await runObserver(deps.observerModel, {
          turnId: t.turnId, playerText, lastNpcLine: r.lastNpcLine, criteria: r.scene.criterios_exito, structures,
          cefrBand: r.scene.banda, audio: readOnly(t.clip),
        }, deps.models.roles.observer);
        releaseClip(t); // el observador ya leyó el clip: se libera (no espera a los 10 s)
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
      dispatch(verdict === "criteria" ? { type: "criteriaMet" } : { type: "npcDone" });
    } finally {
      releaseClip(t);
    }
  }

  /** El jugador empieza a hablar (voice.turnStart): turno nuevo con su clip, o retoma el que estaba en pausa. */
  function voiceTurnStart(r: Run, v: VoiceRun): void {
    if (snap.sub === "endPending" && v.speaking) return dispatch({ type: "speechResume" });
    const t = newVoiceTurn(r, snap.ctx.turnIndex + 1, true);
    if (t.clip) deps.onTurnClip?.(readOnly(t.clip));
    v.turns.set(t.turnId, t);
    v.speaking = t;
    v.provider.startTurn(t.turnId);
    dispatch({ type: "speechStart" });
  }

  /** Commit del turno hablado: activityEnd al proveedor y el clip empieza a contar sus 10 s. */
  function commitVoiceTurn(r: Run, v: VoiceRun, via: "pressDone" | "turnTimer" | "pass" | "hardCap"): void {
    const t = v.speaking;
    v.speaking = null;
    if (!t) return;
    // hardCap: la sesión se cierra ya, no hay respuesta ni transcripción que esperar. pass: el turno hablado se descarta.
    if (via === "hardCap" || via === "pass") {
      v.turns.delete(t.turnId);
      return releaseClip(t);
    }
    t.cancelClipTimer = scheduler.schedule(deps.models.voice.clipTtlMs, () => releaseClip(t));
    v.provider.endTurn(t.turnId);
    track(processVoiceTurn(r, t));
  }

  /** Pase con nota [DIRECTOR] en voz: el modelo responde a la nota, sin turno hablado. */
  function directorReply(r: Run, v: VoiceRun, note: "simpler" | "continue"): void {
    const t = newVoiceTurn(r, snap.ctx.turnIndex, false);
    v.turns.set(t.turnId, t);
    v.provider.injectContext([{ role: "user", text: DIRECTOR_NOTES[note] }], t.turnId);
    track(processVoiceTurn(r, t));
  }

  // ---------- efectos ----------

  const finish = (r: Run, outcome: "success" | "partial" | "hardCap" | "containment"): void => {
    const criteriaMet = metCriteriaIds(r.criteriaDefs, r.criteria);
    if (outcome !== "containment") {
      // Cerrar sin criterios (no converge / tope duro) igual deja el mundo como dice la ficha (salida_si_no_converge):
      // el jugador nunca "pierde" la escena (02 §3.2 G3; invariante d).
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
        if (r.voice) return openVoice(r, r.voice); // voz: se abre durante la pretarea (03 §5.4 punto 1)
        queue.push({ type: "sceneReady" }); // texto: no hay sesión que precalentar
        return;
      case "startPretask": {
        const pre = applies(r.mission.pre_tarea);
        if (pre) send({ type: "npc.line", line: { lineId: newId(), speaker: "LUMI", kind: "pretask", text: null, template: pre.plantilla } });
        queue.push({ type: "pretaskDone" });
        return;
      }
      case "startClock": {
        const { softCapMs, hardCapMs } = deps.models.scene;
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
          // Contención (D-112): línea fuera de la ficción + recurso de ayuda local; textos provisorios hasta F13.
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
        // Texto: entra al transcripto recién después de la moderación de entrada (processTurn): un turno cortado
        // nunca llega al modelo. Si el commit es por el tope duro, la escena cierra y el texto no se usa.
        // Voz: activityEnd y el turno se procesa con la transcripción y el clip.
        if (r.voice && snap.ctx.modality === "voice") commitVoiceTurn(r, r.voice, eff.via);
        return;
      case "requestNpcReply": {
        if (r.voice && snap.ctx.modality === "voice") {
          // Sin nota, la respuesta ya la pidió el activityEnd del commit; con nota, la pide la nota [DIRECTOR].
          if (eff.directorNote) directorReply(r, r.voice, eff.directorNote);
          return;
        }
        const text = r.pendingText;
        r.pendingText = null;
        track(processTurn(r, text, eff.directorNote));
        return;
      }
      case "closeSession":
        r.generation++; // lo que esté en vuelo ya no habla (invariante e)
        // Live se cierra al entrar a closing (también por hardCap: la línea de cierre es la guionada, D-130).
        closeVoice(r, snap.state === "aborted" ? "abort" : snap.ctx.closingReason === "hardCap" ? "hardCap" : "done");
        return;
      case "cutAudio":
        for (const t of r.voice?.turns.values() ?? []) t.cut = true;
        return;
      case "modalityChanged":
        // Voz → texto (sceneFailed, voiceLost, budgetExhausted): la sesión de voz no sigue.
        if (eff.modality === "text") closeVoice(r, "error");
        return;
      case "sceneEnded":
        finish(r, eff.outcome);
        return;
      case "sceneAborted":
        send({ type: "scene.end", outcome: "aborted", criteriaMet: [], evidence: r.evidence });
        callHook(deps.conversation, deps.conversation?.onSceneEnd, { sceneRunId: r.sceneRunId, outcome: "aborted", criteriaMet: [] });
        return;
      // Sin efecto todavía: Lumi (F6) y el menú de pase (lo muestra el cliente por scene.state).
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
        const auto = AUTO_DONE[snap.state];
        if (auto && snap.state !== prev) queue.push(auto);
      }
    } finally {
      draining = false;
    }
  }

  // ---------- mensajes del cliente ----------

  function start(npcId: string | null, wanted: "voice" | "text"): void {
    if (run && ACTIVE_RUN.includes(snap.state)) return fail("scene_busy", "Ya hay una escena en curso.");
    const catalog = readCatalog(deps.content());
    const npc = npcId === null ? null : catalog.npc(npcId) ?? null;
    if (npcId !== null && !npc) return fail("unknown_npc", "No existe ese NPC.");
    const progress = foldProgress(deps.evidence.list(deps.accountId), catalog);
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
    run = {
      catalog, mission, scene, npc, sceneRunId: newId(), progress,
      system: built?.system ?? null, openingTurn: built?.openingAsModelTurn ?? null,
      criteriaDefs: scene.criterios_exito.map((c) => ({ id: c.id, optional: c.opcional })),
      criteria: emptyCriteria(), transcript: [], evidence: [], lastNpcLine: null, pendingText: null,
      generation: 0, cancelCaps: [], cancelTurnTimer: null,
      moderator: createModerator({ lists: catalog.safety.lists, classifier: deps.moderation ?? null }),
      voice: null,
    };
    // Voz solo con un NPC y un adaptador configurado; sin adaptador (p. ej. sin clave), la escena va por texto con aviso.
    // Una escena sin NPC (solo Lumi) no abre sesión de voz: Lumi habla por plantillas (02 §2.7).
    let modality: "voice" | "text" = "text";
    if (wanted === "voice" && npc) {
      if (deps.voice) {
        const provider = deps.voice();
        const v: VoiceRun = { provider, opened: false, openedAt: 0, speaking: null, turns: new Map() };
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
    callHook(deps.conversation, deps.conversation?.onSceneStart, { sceneRunId: run.sceneRunId, missionId: mission.id, sceneId: scene.escena_id, npcId, modality });
    dispatch({ type: "interact", npcId, sceneId: scene.escena_id, modality });
  }

  /** Mensajes de voz: solo con la sesión de voz abierta y en el turno del jugador. */
  function handleVoice(type: "voice.turnStart" | "voice.turnEnd"): void {
    const r = run;
    const v = r?.voice;
    if (!r || !v?.opened || snap.ctx.modality !== "voice") return fail("not_voice", "La escena no está en modo voz.");
    if (snap.state !== "playerTurn") return fail("not_your_turn", "No es tu turno.");
    if (type === "voice.turnStart") {
      if (snap.sub !== "waiting" && snap.sub !== "endPending") return fail("not_your_turn", "No es tu turno.");
      return voiceTurnStart(r, v);
    }
    // Fin del turno hablado (Terminé o el umbral de silencio del cliente): pausa + confirmación.
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
      t.clip?.append(pcm16); // el clip es de scene-runtime (copia propia)
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
