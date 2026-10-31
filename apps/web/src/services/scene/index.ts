// services/scene — scene server client (F4.2; 03 §5.3, §5.8; F4.1 protocol). Network effect in
// services/ (R5): listens to the store, opens the connection when the UI asks for a scene (single-use token + WebSocket),
// sends the commands the UI left in `dialogue.outbox` and delivers each server message to the store via actions.
// Every incoming message is validated with the strict @lg/protocol schema (03 §7.8): what does not validate is discarded.
// Loaded via deferred import() the first time a scene is opened: zod does not enter the initial chunk (03 §2.7.3).
// F5.2: with an audio engine (deps.audio), before requesting the scene it prepares the microphone: with a microphone it requests the scene
// in voice and acts as VoiceTransport (binary frames, ADR-017); without a microphone or permission, it requests it as text and the HUD
// says why.
import { ClientMessageSchema, ServerMessageSchema, type ClientMessage } from "@lg/protocol";
import { startAudioService, type AudioEngine, type AudioService, type VoiceTransport } from "../audio";
import { pcm16FromBytes, pcm16ToBytes } from "../audio/dsp";
import type { GameActions } from "../../state/actions";
import { selectLexiconStatus, selectSceneOutbox, selectSceneRequest } from "../../state/selectors";
import type { GameStore } from "../../state/store";
import { loadLexicon } from "../content/lexicon";
import type { FetchJson } from "../content/dialogOnlyCatalog";
import type { SceneConnector, SceneSocket } from "./connector";

export type { SceneConnector, SceneHandlers, SceneSocket } from "./connector";
export { browserSceneConnector } from "./connector";

export interface SceneServiceDeps {
  store: GameStore;
  actions: Pick<GameActions,
    "sceneConnecting" | "sceneConnected" | "sceneConnectionFailed" | "sceneConnectionClosed" | "sceneMessage" | "outboxSent" |
    "lexiconLoading" | "lexiconLoaded" | "lexiconFailed" | "audioChanged" | "voiceTurnClosed">;
  connector: SceneConnector;
  baseUrl: string;
  fetchJson?: FetchJson;
  /** D-814: content universe (glossary, manifest, Lumi). Without this, the legacy tree. */
  universeId?: string;
  /** F5.2: voice. Without this (text tests, `?voz=0`) scenes are requested as text. */
  audio?: { createEngine: () => Promise<AudioEngine> };
}

/** Starts the service. Returns the function that stops it (closes the open connection). */
export function startSceneService(deps: SceneServiceDeps): () => void {
  const { store, actions } = deps;
  let socket: SceneSocket | null = null;
  /** Increments with each request: a connection that finishes opening for an old request is closed unused. */
  let generation = 0;
  let stopped = false;
  const npcListeners = new Set<(pcm16: Int16Array) => void>();

  /** Voice travels over the same scene WebSocket. */
  const transport: VoiceTransport = {
    sendPlayerAudio: (pcm16) => socket?.sendBinary(pcm16ToBytes(pcm16)),
    onNpcAudio(listener) {
      npcListeners.add(listener);
      return () => npcListeners.delete(listener);
    },
  };
  const audio: AudioService | null = deps.audio
    ? startAudioService({ store, actions, createEngine: deps.audio.createEngine, transport })
    : null;

  const closeSocket = (): void => {
    const s = socket;
    socket = null;
    s?.close();
  };

  const flush = (): void => {
    const outbox = selectSceneOutbox(store.getState());
    if (!socket || outbox.length === 0) return;
    let last = 0;
    for (const item of outbox) {
      const msg: ClientMessage = ClientMessageSchema.parse(item.msg);
      socket.send(JSON.stringify(msg));
      last = item.seq;
    }
    actions.outboxSent(last);
  };

  const onMessage = (gen: number) => (text: string): void => {
    if (gen !== generation) return;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return console.warn("[scene] mensaje que no es JSON: descartado");
    }
    const parsed = ServerMessageSchema.safeParse(raw);
    if (!parsed.success) return console.warn("[scene] mensaje fuera del protocolo: descartado");
    actions.sceneMessage(parsed.data);
  };

  const onBinary = (gen: number) => (bytes: ArrayBuffer): void => {
    if (gen !== generation || npcListeners.size === 0) return;
    const pcm16 = pcm16FromBytes(bytes);
    for (const l of npcListeners) l(pcm16);
  };

  const open = async (npcId: string | null): Promise<void> => {
    const gen = ++generation;
    closeSocket();
    actions.sceneConnecting();
    if (selectLexiconStatus(store.getState()) === "idle") void loadLexicon(actions, deps.baseUrl, deps.fetchJson, deps.universeId);
    // The microphone is requested BEFORE the token (it expires in 60 s; the permission can take as long as the player takes).
    const modality = audio ? await audio.prepare() : null;
    if (stopped || gen !== generation) return;
    try {
      const s = await deps.connector.open({
        onMessage: onMessage(gen),
        onBinary: onBinary(gen),
        onClose: () => { if (gen === generation) { socket = null; audio?.release(); actions.sceneConnectionClosed(); } },
      });
      if (stopped || gen !== generation) return s.close();
      socket = s;
      actions.sceneConnected();
      s.send(JSON.stringify(ClientMessageSchema.parse({ type: "scene.start", npcId, ...(modality ? { modality } : {}) })));
      flush();
    } catch (err) {
      if (gen !== generation) return;
      audio?.release();
      console.warn("[scene] no se pudo conectar con el servidor de escenas:", err instanceof Error ? err.message : err);
      actions.sceneConnectionFailed();
    }
  };

  const stopRequest = store.subscribe(selectSceneRequest, (req) => {
    if (req) void open(req.npcId);
    else {
      generation++;
      closeSocket(); // the server aborts a scene in progress when the connection closes (03 §3.5.1)
      audio?.release(); // the microphone is released on leaving the scene
    }
  }, { fireImmediately: true });
  const stopOutbox = store.subscribe(selectSceneOutbox, flush);

  return () => {
    stopped = true;
    generation++;
    stopRequest();
    stopOutbox();
    closeSocket();
    audio?.stop();
  };
}
