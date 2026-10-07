// Selectores del slice `dialogue`. En F1.3 no hay escena real (F4): la vista dice si hay una activa.
import type { GameState } from "../store";
import { createViewSelector } from "./view";

export interface DialogueView {
  active: boolean;
  npcId: string | null;
  state: string;
}

export const selectDialogueView = createViewSelector(
  (s: GameState) => [s.dialogue] as const,
  (d): DialogueView => ({ active: d.sceneId !== null, npcId: d.npcId, state: d.state }),
);
