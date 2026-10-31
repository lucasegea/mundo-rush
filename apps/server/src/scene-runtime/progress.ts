// Operator progress as a fold of the evidence (ADR-004, D-157): closed scenes are left as
// `mission_outcome` with their effects, so restarting the server loses neither the prologue order nor the network.
// The full save (SaveStore) arrives with F7.
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

/** Development reset of a mission (A2, scripts/dev/reset-encounter.ts): anything before `at` doesn't count. */
export interface MissionReset {
  readonly missionId: string;
  readonly at: string;
}

/**
 * Removes the evidence of the reset missions dated up to their reset (inclusive). The evidence log is append-only
 * and is not touched: the reset is a filter when reading it. The rest of the real progress stays the same.
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
    // A mission that no longer exists in the content (renamed in director mode) doesn't break the fold.
    story = mission
      ? advanceStory(story, mission, e.sceneId, effects)
      : { ...story, completedScenes: [...story.completedScenes, e.sceneId] };
    world = applyWorldEffects(world, effects);
  }
  return { story, world };
}
