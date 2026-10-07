// Hook de lectura para ui/ (R14): ui/ no importa el store; lee view-models por acá. El store usa
// useSyncExternalStore por debajo (zustand), así que la suscripción es segura con el render concurrente.
import { useGameStore, type GameState } from "../store";

export const useGameView = <T>(selector: (s: GameState) => T): T => useGameStore(selector);
