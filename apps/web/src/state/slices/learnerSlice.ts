// Slice `learner` (03 §3.3): banco de repaso, patrones de error, andamiaje. Estado inicial (F7).
export interface LearnerState {
  reviewBank: { id: string; box: number; dueAt: string | null }[];
  errorPatterns: { key: string; type: string; count: number; systematic: boolean }[];
  /** Nivel de andamiaje 1-5 y ventana de señales de las últimas 3 escenas. */
  scaffoldLevel: 1 | 2 | 3 | 4 | 5;
  scaffoldWindow: string[];
  dueItems: string[];
  /** Palabras marcadas para repasar desde el HUD (D-068). Las lleva al cuaderno F7; hoy viven en la sesión. */
  marked: string[];
}

export const LEARNER_PERSIST = "server" as const;

export const initialLearner = (): LearnerState => ({
  reviewBank: [],
  errorPatterns: [],
  scaffoldLevel: 1,
  scaffoldWindow: [],
  dueItems: [],
  marked: [],
});
