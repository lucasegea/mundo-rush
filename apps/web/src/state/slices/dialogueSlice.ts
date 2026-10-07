// Slice `dialogue` (03 §3.3). Arranca en su estado inicial: la máquina de escena y el HUD llegan con F4.
import type { NpcSpeed } from "@lg/core";

export interface DialogueState {
  sceneId: string | null;
  npcId: string | null;
  /** Estado de la máquina de escena (03 §3.5.1); `idle` sin escena. */
  state: string;
  turnSubstate: string | null;
  modality: "voice" | "text";
  subtitles: { final: string[]; partial: string | null };
  lastNpcLine: string | null;
  effectiveSpeed: NpcSpeed | null;
  silenceMenuOpen: boolean;
  hintChipVisible: boolean;
  suggestedOptions: string[];
  criteriaProgress: number;
  textFallbackReason: string | null;
}

/** No se persiste: la escena se reanuda desde su inicio (GDD §2.16). */
export const DIALOGUE_PERSIST = "none" as const;

export const initialDialogue = (): DialogueState => ({
  sceneId: null,
  npcId: null,
  state: "idle",
  turnSubstate: null,
  modality: "voice",
  subtitles: { final: [], partial: null },
  lastNpcLine: null,
  effectiveSpeed: null,
  silenceMenuOpen: false,
  hintChipVisible: false,
  suggestedOptions: [],
  criteriaProgress: 0,
  textFallbackReason: null,
});
