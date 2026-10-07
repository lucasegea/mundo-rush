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
});
