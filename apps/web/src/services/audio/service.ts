// Client audio service (F5.2): ties the state machine (machine.ts), the engine (single AudioContext, microphone
// and queue, AudioEngine) and the voice transport (VoiceTransport) to the store. The UI asks via actions ("Talk",
// "Done"); this is where they run: with the turn open the microphone blocks go to the server, on closing it a short
// tail of audio is sent (so the last syllable is not cut off) and only then `voice.turnEnd`. The NPC voice plays through the
// queue and, while it plays, you cannot talk (nobody talks over anybody). The level meter runs whenever there is a microphone.
// The client does not store audio: blocks are sent and dropped (D-108).
import type { GameActions } from "../../state/actions";
import type { GameStore } from "../../state/store";
import { DEFAULT_VAD, initialVad, levelFromRms, vadStep, type CaptureFrame, type VadState } from "./dsp";
import { audioTransition, type AudioEvent, type AudioState } from "./machine";
import type { AudioEngine, VoiceTransport } from "./types";

/** = NPC_AUDIO_SAMPLE_RATE from @lg/protocol (server → client). */
export const NPC_SAMPLE_RATE = 24000;
/** Audio that keeps being sent after "Done" (ms). */
export const TALK_TAIL_MS = 250;
/** If the server does not take the scene out of your turn within this time after "Done" (it rejected the turn), go back to ready. */
export const TURN_ACK_TIMEOUT_MS = 5000;
/**
 * Playback watchdog: if the queue does not signal it drained within (what was queued since the last drain + this margin), it is considered
 * finished. Without this, an AudioContext that does not advance left the HUD on "playing" and the player unable to talk.
 */
export const PLAYBACK_STUCK_GRACE_MS = 4000;
/** How often the microphone level is published to the store (ms) and with what step (avoids re-renders from noise). */
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
  /** Prepares the microphone for a scene: "voice" if available, "text" otherwise (and the HUD says why). */
  prepare(): Promise<"voice" | "text">;
  /** Releases microphone and audio (end of the scene, leaving the HUD). */
  release(): void;
  /** Stops the service. */
  stop(): void;
}

export function startAudioService(deps: AudioServiceDeps): AudioService {
  const { store, actions, transport } = deps;
  const schedule = deps.schedule ?? defaultSchedule;
  const now = deps.now ?? (() => Date.now());
  const tailMs = deps.tailMs ?? TALK_TAIL_MS;

  let state: AudioState = "off";
  let engine: AudioEngine | null = null;
  /** Increments with each prepare/release: a stale prepare that finishes late is discarded. */
  let generation = 0;
  let capturing = false;
  let vad: VadState = initialVad();
  let cancelTail: (() => void) | null = null;
  let cancelAck: (() => void) | null = null;
  let levelAt = 0;
  let levelPeak = 0;
  let stopped = false;
  /** Seconds of NPC voice queued since the last drain and the watchdog cancellation. */
  let queuedSeconds = 0;
  let cancelStuck: (() => void) | null = null;
  /** Last scene `estado.subestado` seen (to react to changes, not to every store render). */
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
    // Meter: the peak of the interval, quantized.
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

  /** Closes the spoken turn: stops sending audio and signals (with or without `voice.turnEnd`). */
  const closeTurn = (send: boolean): void => {
    clearTimers();
    capturing = false;
    actions.voiceTurnClosed(vad.heardSpeech, send);
    go("talkEnd");
    if (!send) return go("turnReturned");
    // If the server did not take the scene out of your turn (it rejected the turn), do not stay "thinking" forever.
    cancelAck = schedule(TURN_ACK_TIMEOUT_MS, () => {
      cancelAck = null;
      const d = store.getState().dialogue;
      if (d.state === "playerTurn" && d.turnSubstate === "waiting") go("turnReturned");
    });
  };

  const onTalk = (talk: "idle" | "talking" | "ending"): void => {
    if (talk === "talking" && state === "ready") {
      engine?.resume(); // we are inside the gesture that opened the turn
      vad = initialVad();
      capturing = true;
      go("talkStart");
    } else if (talk === "ending" && !cancelTail) {
      // With no capture open there is no queue to wait for: the end goes out right away (the server never ends up with a dangling turn).
      if (!capturing) return closeTurn(true);
      cancelTail = schedule(tailMs, () => {
        cancelTail = null;
        closeTurn(true);
      });
    }
  };

  const onScene = (d: ReturnType<GameStore["getState"]>["dialogue"]): void => {
    if (d.voice.talk !== "idle" && d.state !== "playerTurn") return closeTurn(false); // e.g. time cap
    const key = `${d.state}.${d.turnSubstate ?? ""}`;
    const changed = key !== sceneKey;
    sceneKey = key;
    if (changed && key === "playerTurn.waiting" && state === "thinking") {
      cancelAck?.();
      cancelAck = null;
      go("turnReturned"); // the response arrived without audio (safe line, error) or already finished
    }
    // The server switched the scene to text (no key, voice lost): the microphone is released.
    if (d.modality === "text" && d.sceneId !== null && engine) release();
  };

  const stopNpc = transport.onNpcAudio((pcm16) => {
    if (!engine || state === "off" || state === "asking" || state === "noPermission") return;
    engine.play(pcm16, NPC_SAMPLE_RATE);
    go("npcAudio");
    // Watchdog: rescheduled with each chunk depending on how much audio is queued.
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
