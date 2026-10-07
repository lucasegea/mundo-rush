// Slice `player` (03 §3.3). Arranca en su estado inicial: movimiento llega con F2, avatar con el onboarding.
export interface PlayerState {
  /** Posición lógica (celda de la grilla y coordenadas de simulación, R7). */
  cell: [number, number] | null;
  position: { x: number; z: number } | null;
  path: [number, number][];
  facing: "n" | "s" | "e" | "w";
  avatar: string | null;
  gameName: string | null;
  pronouns: string | null;
  /** Canasta: objetos prestados de misión. */
  basket: string[];
}

export const PLAYER_PERSIST = "server" as const;

export const initialPlayer = (): PlayerState => ({
  cell: null,
  position: null,
  path: [],
  facing: "s",
  avatar: null,
  gameName: null,
  pronouns: null,
  basket: [],
});
