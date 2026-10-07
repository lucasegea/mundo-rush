// Selectores del slice `player` (baja frecuencia, R7: celda, nunca la posición por frame).
import type { GameState } from "../store";

export const selectPlayerCell = (s: GameState): [number, number] | null => s.player.cell;
