// Máquina de estados del audio del cliente (F5.2, 04 F5.2), pura. Turnos lentos: el jugador abre y cierra su turno
// (mantener "Hablar" o Hablar + "Terminé"); nadie lo interrumpe y él tampoco pisa al NPC (no se puede hablar mientras
// suena la voz del NPC).
//
//   off ──prepare──► asking ──micGranted──► ready ──talkStart──► listening ──talkEnd──► thinking
//                      └──micDenied──► noPermission         ▲                              │
//   ready / thinking ──npcAudio──► playing ──drained──► ready ┘    thinking ──turnReturned──┘ (respuesta sin audio)
//   cualquiera ──micLost──► noPermission · cualquiera ──stop──► off
//
// `noPermission` = sin micrófono, permiso denegado o navegador sin captura: la escena va por texto con un mensaje claro.

// El tipo vive en el slice `dialogue` (el store lo guarda y la UI lo lee); la máquina es de services/audio.
import type { AudioState } from "../../state/slices";

export type { AudioState };

export type AudioEvent =
  | "prepare" | "micGranted" | "micDenied" | "micLost"
  | "talkStart" | "talkEnd" | "npcAudio" | "drained" | "turnReturned" | "stop";

type Table = Partial<Record<AudioState, Partial<Record<AudioEvent, AudioState>>>>;

const TABLE: Table = {
  off: { prepare: "asking" },
  asking: { micGranted: "ready", micDenied: "noPermission" },
  noPermission: { prepare: "asking" },
  ready: { talkStart: "listening", npcAudio: "playing" },
  listening: { talkEnd: "thinking" },
  thinking: { npcAudio: "playing", turnReturned: "ready" },
  playing: { drained: "ready" },
};

/** Siguiente estado; un evento que no aplica deja el mismo estado. */
export function audioTransition(state: AudioState, event: AudioEvent): AudioState {
  if (event === "stop") return "off";
  if (event === "micLost") return state === "off" ? "off" : "noPermission";
  return TABLE[state]?.[event] ?? state;
}

/** Se puede abrir un turno hablado (además, la escena tiene que estar en `playerTurn.waiting`). */
export const canTalk = (state: AudioState): boolean => state === "ready";
