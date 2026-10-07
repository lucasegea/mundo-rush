// Lectura transitoria para world/ (03 §2.3 disciplina #2, R7): dentro de useFrame se lee el store sin
// suscribirse ni re-renderizar. world/ no importa el store (§4.3): pasa por acá.
import { gameStore, type GameState } from "../store";

export const readGame = <T>(selector: (s: GameState) => T): T => selector(gameStore.getState());
