// Slice `progression` (03 §3.3, §3.5.3): solo aplicando eventos confirmados por el servidor. Estado inicial.
export type MissionStatus = "locked" | "available" | "done" | "canImprove";

export interface ProgressionState {
  /** Ids de eventos de evidencia del servidor (log local). */
  evidenceLog: string[];
  /** Pociones por rama en tercios enteros (03 §3.3: sin flotantes). */
  potionThirdsByBranch: Record<string, number>;
  unlockedSkills: string[];
  pouredPotions: Record<string, number>;
  canDoDemonstrated: string[];
  missions: Record<string, MissionStatus>;
  chapter: number;
  /**
   * Open-world-3d T9: NPCs cuya escena terminó con éxito (`scene.end` con `success` de la escena abierta con ese NPC),
   * en orden de llegada y sin repetidos. El minimapa marca en rojo a los del diorama que no están acá.
   * T9 SEAM: hoy se arma en el cliente con los `scene.end`; cuando el servidor mande una instantánea de progreso al
   * conectar, esa instantánea la reemplaza entera (el servidor es la fuente, como el resto de este slice).
   */
  completedNpcs: string[];
}

export const PROGRESSION_PERSIST = "server" as const;

export const initialProgression = (): ProgressionState => ({
  evidenceLog: [],
  potionThirdsByBranch: {},
  unlockedSkills: [],
  pouredPotions: {},
  canDoDemonstrated: [],
  missions: {},
  chapter: 0,
  completedNpcs: [],
});
