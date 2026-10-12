// Servicio de audio del cliente (F5.2): une la máquina de estados (machine.ts), el motor (único AudioContext, micrófono
// y cola, AudioEngine) y el transporte de voz (VoiceTransport) con el store. La UI pide por acciones ("Hablar",
// "Terminé"); acá se ejecuta: con el turno abierto los bloques del micrófono van al servidor, al cerrarlo se manda una
// cola corta de audio (para no comerse la última sílaba) y recién después `voice.turnEnd`. La voz del NPC suena por la
// cola y, mientras suena, no se puede hablar (nadie pisa a nadie). El medidor de nivel corre siempre que hay micrófono.
// El cliente no guarda audio: los bloques se mandan y se sueltan (D-108).
import type { GameActions } from "../../state/actions";
import type { GameStore } from "../../state/store";
import { DEFAULT_VAD, initialVad, levelFromRms, vadStep, type CaptureFrame, type VadState } from "./dsp";
import { audioTransition, type AudioEvent, type AudioState } from "./machine";
import type { AudioEngine, VoiceTransport } from "./types";

/** = NPC_AUDIO_SAMPLE_RATE de @lg/protocol (servidor → cliente). */
export const NPC_SAMPLE_RATE = 24000;
/** Audio que se sigue mandando después de "Terminé" (ms). */
export const TALK_TAIL_MS = 250;
/** Si el servidor no saca la escena de tu turno en este tiempo tras "Terminé" (rechazó el turno), se vuelve a listo. */
export const TURN_ACK_TIMEOUT_MS = 5000;
/**
 * Vigía de reproducción: si la cola no avisa que se vació en (lo encolado desde el último vaciado + este margen), se da
 * por terminada. Sin esto, un AudioContext que no avanza dejaba el HUD en "sonando" y el jugador sin poder hablar.
 */
export const PLAYBACK_STUCK_GRACE_MS = 4000;
/** Cada cuánto se publica el nivel del micrófono en el store (ms) y con qué paso (evita re-renders por ruido). */
export const LEVEL_INTERVAL_MS = 100;
const LEVEL_STEP = 0.05;

export type Schedule = (ms: number, fn: () => void) => () => void;

const defaultSchedule: Schedule = (ms, fn) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export interface AudioServiceDeps {
  store: GameStore;
  actions: Pick<GameActions, "audioChanged" | "voiceTurnClosed">;
  createEngine: () => Promise<AudioEngine>;
  transport: VoiceTransport;
  schedule?: Schedule;
  now?: () => number;
  tailMs?: number;
}

export interface AudioService {
  /** Prepara el micrófono para una escena: "voice" si hay, "text" si no (y el HUD dice por qué). */
  prepare(): Promise<"voice" | "text">;
  /** Suelta micrófono y audio (fin de la escena, salir del HUD). */
  release(): void;
  /** Para el servicio. */
  stop(): void;
}

export function startAudioService(deps: AudioServiceDeps): AudioService {
  const { store, actions, transport } = deps;
  const schedule = deps.schedule ?? defaultSchedule;
  const now = deps.now ?? (() => Date.now());
  const tailMs = deps.tailMs ?? TALK_TAIL_MS;

  let state: AudioState = "off";
  let engine: AudioEngine | null = null;
  /** Sube con cada prepare/release: un prepare viejo que termina tarde se descarta. */
  let generation = 0;
  let capturing = false;
  let vad: VadState = initialVad();
  let cancelTail: (() => void) | null = null;
  let cancelAck: (() => void) | null = null;
  let levelAt = 0;
  let levelPeak = 0;
  let stopped = false;
  /** Segundos de voz del NPC encolados desde el último vaciado y la cancelación del vigía. */
  let queuedSeconds = 0;
  let cancelStuck: (() => void) | null = null;
  /** Último `estado.subestado` de la escena visto (para reaccionar a cambios, no a cada render del store). */
  let sceneKey = "";

  const go = (ev: AudioEvent): void => {
    const next = audioTransition(state, ev);
    if (next === state) return;
    state = next;
    actions.audioChanged({ audio: state });
  };

  const clearStuck = (): void => {
    cancelStuck?.();
    cancelStuck = null;
    queuedSeconds = 0;
  };

  const clearTimers = (): void => {
    cancelTail?.();
    cancelTail = null;
    cancelAck?.();
    cancelAck = null;
    clearStuck();
  };

  const onFrame = (frame: CaptureFrame): void => {
    // Medidor: el pico del intervalo, cuantizado.
    levelPeak = Math.max(levelPeak, frame.rms);
    const t = now();
    if (t - levelAt >= LEVEL_INTERVAL_MS) {
      levelAt = t;
      actions.audioChanged({ level: Math.round(levelFromRms(levelPeak) / LEVEL_STEP) * LEVEL_STEP });
      levelPeak = 0;
    }
    if (!capturing) return;
    vad = vadStep(vad, frame.rms, (frame.pcm.length / 16000) * 1000, DEFAULT_VAD).state;
    transport.sendPlayerAudio(frame.pcm);
  };

  /** Cierra el turno hablado: deja de mandar audio y avisa (con o sin `voice.turnEnd`). */
  const closeTurn = (send: boolean): void => {
    clearTimers();
    capturing = false;
    actions.voiceTurnClosed(vad.heardSpeech, send);
    go("talkEnd");
    if (!send) return go("turnReturned");
    // Si el servidor no sacó la escena de tu turno (rechazó el turno), no quedarse "pensando" para siempre.
    cancelAck = schedule(TURN_ACK_TIMEOUT_MS, () => {
      cancelAck = null;
      const d = store.getState().dialogue;
      if (d.state === "playerTurn" && d.turnSubstate === "waiting") go("turnReturned");
    });
  };

  const onTalk = (talk: "idle" | "talking" | "ending"): void => {
    if (talk === "talking" && state === "ready") {
      engine?.resume(); // estamos dentro del gesto que abrió el turno
      vad = initialVad();
      capturing = true;
      go("talkStart");
    } else if (talk === "ending" && !cancelTail) {
      // Sin captura abierta no hay cola que esperar: el fin sale ya (el servidor nunca queda con el turno colgado).
      if (!capturing) return closeTurn(true);
      cancelTail = schedule(tailMs, () => {
        cancelTail = null;
        closeTurn(true);
      });
    }
  };

  const onScene = (d: ReturnType<GameStore["getState"]>["dialogue"]): void => {
    if (d.voice.talk !== "idle" && d.state !== "playerTurn") return closeTurn(false); // p. ej. tope de tiempo
    const key = `${d.state}.${d.turnSubstate ?? ""}`;
    const changed = key !== sceneKey;
    sceneKey = key;
    if (changed && key === "playerTurn.waiting" && state === "thinking") {
      cancelAck?.();
      cancelAck = null;
      go("turnReturned"); // la respuesta llegó sin audio (línea segura, error) o ya terminó
    }
    // El servidor pasó la escena a texto (sin clave, voz perdida): se suelta el micrófono.
    if (d.modality === "text" && d.sceneId !== null && engine) release();
  };

  const stopNpc = transport.onNpcAudio((pcm16) => {
    if (!engine || state === "off" || state === "asking" || state === "noPermission") return;
    engine.play(pcm16, NPC_SAMPLE_RATE);
    go("npcAudio");
    // Vigía: se reprograma con cada pedazo según cuánto audio hay encolado.
    queuedSeconds += pcm16.length / NPC_SAMPLE_RATE;
    cancelStuck?.();
    cancelStuck = schedule(Math.ceil(queuedSeconds * 1000) + PLAYBACK_STUCK_GRACE_MS, () => {
      cancelStuck = null;
      queuedSeconds = 0;
      if (state === "playing") go("drained");
    });
  });

  const unsubTalk = store.subscribe((s) => s.dialogue.voice.talk, onTalk);
  const unsubScene = store.subscribe((s) => s.dialogue, onScene);

  function release(): void {
    generation++;
    clearTimers();
    capturing = false;
    const e = engine;
    engine = null;
    e?.close();
    go("stop");
    actions.audioChanged({ level: 0 });
  }

  async function prepare(): Promise<"voice" | "text"> {
    release();
    if (stopped) return "text";
    const gen = generation;
    actions.audioChanged({ micProblem: null });
    go("prepare");
    let e: AudioEngine;
    try {
      e = await deps.createEngine();
    } catch {
      if (gen !== generation) return "text";
      actions.audioChanged({ micProblem: "unsupported" });
      go("micDenied");
      return "text";
    }
    if (gen !== generation) {
      e.close();
      return "text";
    }
    const res = await e.startMic(onFrame).catch(() => ({ ok: false as const, problem: "failed" as const }));
    if (gen !== generation) {
      e.close();
      return "text";
    }
    if (!res.ok) {
      e.close();
      actions.audioChanged({ micProblem: res.problem });
      go("micDenied");
      return "text";
    }
    engine = e;
    e.onDrained(() => {
      if (engine !== e) return;
      clearStuck();
      go("drained");
    });
    e.onMicLost(() => {
      if (engine !== e) return;
      if (capturing) closeTurn(true);
      actions.audioChanged({ micProblem: "noDevice" });
      go("micLost");
    });
    go("micGranted");
    return "voice";
  }

  return {
    prepare,
    release,
    stop() {
      stopped = true;
      release();
      stopNpc();
      unsubTalk();
      unsubScene();
    },
  };
}
