// Selectores del slice `progression` (pociones en tercios enteros, 03 §3.3; el cuaderno llega con F7).
import type { GameState } from "../store";

export const selectPotionThirdsByBranch = (s: GameState): Record<string, number> => s.progression.potionThirdsByBranch;
