// services/scene — cliente del servidor de escenas (F4.2; 03 §5.3, §5.8; protocolo de F4.1). Efecto de red en
// services/ (R5): escucha el store, abre la conexión cuando la UI pide una escena (token de un solo uso + WebSocket),
// manda los comandos que la UI dejó en `dialogue.outbox` y entrega cada mensaje del servidor al store por acciones.
// Todo mensaje que llega se valida con el esquema estricto de @lg/protocol (03 §7.8): lo que no valida se descarta.
// Se carga por import() diferido la primera vez que se abre una escena: zod no entra al chunk inicial (03 §2.7.3).
// F5.2: con un motor de audio (deps.audio), antes de pedir la escena prepara el micrófono: con micrófono pide la escena
// en voz y hace de VoiceTransport (frames binarios, ADR-017); sin micrófono o sin permiso, la pide por texto y el HUD
// dice por qué.
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
  /** F5.2: voz. Sin esto (tests de texto, `?voz=0`) las escenas se piden por texto. */
  audio?: { createEngine: () => Promise<AudioEngine> };
}

/** Arranca el servicio. Devuelve la función que lo para (cierra la conexión abierta). */
export function startSceneService(deps: SceneServiceDeps): () => void {
  const { store, actions } = deps;
  let socket: SceneSocket | null = null;
  /** Sube con cada pedido: una conexión que termina de abrir para un pedido viejo se cierra sin usarse. */
  let generation = 0;
  let stopped = false;
  const npcListeners = new Set<(pcm16: Int16Array) => void>();

  /** La voz viaja por el mismo WebSocket de la escena. */
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
    if (selectLexiconStatus(store.getState()) === "idle") void loadLexicon(actions, deps.baseUrl, deps.fetchJson);
    // El micrófono se pide ANTES del token (vence en 60 s; el permiso puede tardar lo que tarde el jugador).
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
      closeSocket(); // el servidor aborta una escena en curso al cerrarse la conexión (03 §3.5.1)
      audio?.release(); // se suelta el micrófono al salir de la escena
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
