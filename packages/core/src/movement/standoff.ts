// Player positioning when starting a chat from the map (plan estetica-c M1 item 4, architecture review 2026-10-12): the player
// ends up 2.6 m from the NPC, on their side, at a walkable spot and with a free line from where they are (the segment does not cross
// anything blocked: without this they could "jump" a fence). That way the camera's two-shot is not blocked. Pure.
import { circleBlocked } from "./collision";
import type { Point, WalkGrid } from "./grid";

export const STANDOFF_DISTANCE = 2.6;
/** Fallback range if there is no room at 2.6 m. */
export const STANDOFF_MIN = 1.8;
export const STANDOFF_MAX = 3.2;
/** Radius of the body that has to fit at the chosen point (that of DEFAULT_MOVEMENT). */
const BODY_RADIUS = 0.24;
/** Angle deviations tried around the player's side, from smallest to largest (never crosses to the other side). */
const ANGLE_OFFSETS_DEG = [0, 10, -10, 20, -20, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90];

/** Candidate distances: 2.6 first and then the ones closest to 2.6 within [1.8, 3.2], in steps of 0.1 m. */
function distances(preferred: number): number[] {
  const out: number[] = [];
  for (let d = STANDOFF_MIN; d <= STANDOFF_MAX + 1e-9; d += 0.1) out.push(Math.round(d * 10) / 10);
  return out.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b);
}

/** Can you go in a straight line from `a` to `b` without the body touching a blocked cell? */
export function clearLine(g: WalkGrid, a: Point, b: Point, radius = BODY_RADIUS): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(len / (g.cellSize / 8)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (circleBlocked(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, radius)) return false;
  }
  return true;
}

/**
 * Where the player stands to talk to the NPC: at `distance` m, on the side they arrived from, at a point where
 * the body fits and with a free line from the current position. If there is none at 2.6 m, the nearest to 2.6 between
 * 1.8 and 3.2 m; if there is none, the current position.
 */
export function standoffPoint(player: Point, npc: Point, g: WalkGrid, distance = STANDOFF_DISTANCE): Point {
  const dx = player.x - npc.x;
  const dz = player.z - npc.z;
  // On top of the NPC (odd data): +z is taken as "their side".
  const base = Math.hypot(dx, dz) > 1e-9 ? Math.atan2(dz, dx) : Math.PI / 2;
  for (const d of distances(distance)) {
    for (const off of ANGLE_OFFSETS_DEG) {
      const a = base + (off * Math.PI) / 180;
      const p = { x: npc.x + Math.cos(a) * d, z: npc.z + Math.sin(a) * d };
      if (!circleBlocked(g, p.x, p.z, BODY_RADIUS) && clearLine(g, player, p)) return p;
    }
  }
  return player;
}
