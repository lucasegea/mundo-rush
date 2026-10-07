// state/store.ts — composición de slices (03 §3.3, ADR-003). Un solo store; las claves de primer nivel son
// EXACTAMENTE los 9 slices (contrato; sin economía, construcción, moneda ni racha, D-018). Las acciones no
// viven en el estado: están en slices de acciones (state/actions.ts) y delegan las reglas a @lg/core.
// Middleware: subscribeWithSelector (los servicios se suscriben a una parte). Sin `persist` (03 §2.5).
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  initialCompanion, initialDialogue, initialLearner, initialPlayer, initialProgression, initialSession,
  initialSettings, initialUi, initialWorld,
  type CompanionState, type DialogueState, type LearnerState, type PlayerState, type ProgressionState,
  type SessionState, type SettingsState, type UiState, type WorldState,
} from "./slices";

export interface GameState {
  session: SessionState;
  settings: SettingsState;
  world: WorldState;
  player: PlayerState;
  dialogue: DialogueState;
  companion: CompanionState;
  progression: ProgressionState;
  learner: LearnerState;
  ui: UiState;
}

/** Los 9 slices de 03 §3.3, en el orden de la tabla. */
export const SLICE_NAMES = [
  "session", "settings", "world", "player", "dialogue", "companion", "progression", "learner", "ui",
] as const satisfies readonly (keyof GameState)[];

export const initialGameState = (): GameState => ({
  session: initialSession(),
  settings: initialSettings(),
  world: initialWorld(),
  player: initialPlayer(),
  dialogue: initialDialogue(),
  companion: initialCompanion(),
  progression: initialProgression(),
  learner: initialLearner(),
  ui: initialUi(),
});

/** Un store nuevo (los tests crean uno por caso; la app usa `gameStore`). */
export const createGameStore = (initial: GameState = initialGameState()) =>
  createStore<GameState>()(subscribeWithSelector(() => initial));

export type GameStore = ReturnType<typeof createGameStore>;

/** El store único de la app. */
export const gameStore: GameStore = createGameStore();

/** Hook de React sobre el store único. Solo lo usan state/selectors/ (ui/ no importa este archivo, R14). */
export const useGameStore = <T>(selector: (s: GameState) => T): T => useStore(gameStore, selector);
