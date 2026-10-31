// Nearby interactables (03 §2.4 #5): interaction radius per entity. The core computes them; world/ never
// writes `nearbyInteractables` (the UI reads it for the "E para hablar" notice and the accessible list).
import type { Point } from "./grid";

export interface Interactable {
  id: string;
  kind: "npc" | "object";
  x: number;
  z: number;
  /** Interaction radius, m. */
  radius: number;
}

/** Default radius if the layout does not set one: a bit more than a tile. */
export const DEFAULT_INTERACT_RADIUS = 1.5;

/** Ids within reach, from nearest to farthest (tie-break by id: deterministic). */
export function nearbyInteractables(p: Point, items: readonly Interactable[]): string[] {
  return items
    .map((it) => ({ id: it.id, d: Math.hypot(it.x - p.x, it.z - p.z), r: it.radius }))
    .filter((e) => e.d <= e.r)
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e) => e.id);
}

/** Are two lists of ids equal? (avoids notifying the store on every step) */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
