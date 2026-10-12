// Progreso del operador como plegado de la evidencia (ADR-004, D-157): las escenas cerradas quedan como
// `mission_outcome` con sus efectos, así que reiniciar el servidor no pierde ni el orden del prólogo ni la red.
// El guardado completo (SaveStore) llega con F7.
import {
  advanceStory, applyWorldEffects, emptyStoryProgress, emptyWorldProgress,
  type StoryProgress, type WorldProgress,
} from "@lg/core/scene";
import type { EvidenceEvent } from "@lg/protocol";
import type { Catalog } from "./catalog.ts";

export interface OperatorProgress {
  story: StoryProgress;
  world: WorldProgress;
}

/** Reinicio de desarrollo de una misión (A2, scripts/dev/reset-encounter.ts): lo anterior a `at` no cuenta. */
export interface MissionReset {
  readonly missionId: string;
  readonly at: string;
}

/**
 * Saca la evidencia de las misiones reiniciadas fechada hasta su reinicio (incluido). El log de evidencia es append-only
 * y no se toca: el reinicio es un filtro al leerlo. El resto del progreso real queda igual.
 */
export function withoutResets(events: readonly EvidenceEvent[], resets: readonly MissionReset[]): EvidenceEvent[] {
  if (resets.length === 0) return [...events];
  return events.filter((e) => !resets.some((r) => r.missionId === e.missionId && Date.parse(e.at) <= Date.parse(r.at)));
}

export function foldProgress(events: readonly EvidenceEvent[], catalog: Catalog): OperatorProgress {
  let story = emptyStoryProgress();
  let world = emptyWorldProgress();
  for (const e of events) {
    if (e.kind !== "mission_outcome") continue;
    const effects = e.effects ?? [];
    const mission = catalog.mission(e.missionId);
    // Una misión que ya no existe en el contenido (renombrada en el modo director) no rompe el plegado.
    story = mission
      ? advanceStory(story, mission, e.sceneId, effects)
      : { ...story, completedScenes: [...story.completedScenes, e.sceneId] };
    world = applyWorldEffects(world, effects);
  }
  return { story, world };
}
