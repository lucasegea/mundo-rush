// Slice `progression` (03 §3.3, §3.5.3): only by applying events confirmed by the server. Initial state.
export type MissionStatus = "locked" | "available" | "done" | "canImprove";

export interface ProgressionState {
  /** Server evidence event ids (local log). */
  evidenceLog: string[];
  /** Potions per branch in whole thirds (03 §3.3: no floats). */
  potionThirdsByBranch: Record<string, number>;
  unlockedSkills: string[];
  pouredPotions: Record<string, number>;
  canDoDemonstrated: string[];
  missions: Record<string, MissionStatus>;
  chapter: number;
  /**
   * Open-world-3d T9: NPCs whose scene ended successfully (`scene.end` with `success` of the scene opened with that NPC),
   * in order of arrival and without duplicates. The minimap marks in red those of the diorama that are not here.
   * T9 SEAM: today it is built on the client from the `scene.end`s; when the server sends a progress snapshot on
   * connect, that snapshot replaces it entirely (the server is the source, like the rest of this slice).
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
