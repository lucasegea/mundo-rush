// Selectors of the `progression` slice (potions in whole thirds, 03 §3.3; the notebook arrives with F7).
import type { GameState } from "../store";

export const selectPotionThirdsByBranch = (s: GameState): Record<string, number> => s.progression.potionThirdsByBranch;
