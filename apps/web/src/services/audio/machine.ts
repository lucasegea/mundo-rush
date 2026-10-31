// Client audio state machine (F5.2, 04 F5.2), pure. Slow turns: the player opens and closes their turn
// (hold "Talk" or Talk + "Done"); nobody interrupts them and they do not talk over the NPC either (you cannot talk while
// the NPC voice is playing).
//
//   off ──prepare──► asking ──micGranted──► ready ──talkStart──► listening ──talkEnd──► thinking
//                      └──micDenied──► noPermission         ▲                              │
//   ready / thinking ──npcAudio──► playing ──drained──► ready ┘    thinking ──turnReturned──┘ (response without audio)
//   any ──micLost──► noPermission · any ──stop──► off
//
// `noPermission` = no microphone, permission denied or browser without capture: the scene goes by text with a clear message.

// The type lives in the `dialogue` slice (the store keeps it and the UI reads it); the machine belongs to services/audio.
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

/** Next state; an event that does not apply leaves the state unchanged. */
export function audioTransition(state: AudioState, event: AudioEvent): AudioState {
  if (event === "stop") return "off";
  if (event === "micLost") return state === "off" ? "off" : "noPermission";
  return TABLE[state]?.[event] ?? state;
}

/** A spoken turn can be opened (in addition, the scene must be in `playerTurn.waiting`). */
export const canTalk = (state: AudioState): boolean => state === "ready";
