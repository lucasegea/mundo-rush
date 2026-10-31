// Minimap (open-world-3d T9, M4; mockup V6 `main.js`, "heading up, 60 m"): the pure model of what the HUD draws.
// Up is forward (the camera yaw: what is up on screen is up on the minimap), the player stays
// at the center and 60 m all around are visible. An NPC farther than the ring is pinned to the ring (`edge`) and the interface
// draws it as an arrow pointing toward it. The core knows nothing about canvas or colors: it returns minimap pixels
// (origin top left) and the interface just paints. Colors come from the look (@lg/art `minimapColors`, D-839).
// T9 SEAM: who is left to visit comes from `pendingNpcs` with the store's completed ones; when the server sends a
// progress snapshot, that list arrives from there and this model does not change.
import { yawDelta, normalizeYaw } from "../camera";
import type { Point } from "../movement";
import type { DioramaGround } from "./diorama";

type Vec2 = readonly [number, number];

/** Minimap numbers (mockup V6 `fixture.js` MINIMAP and `main.js` updateMinimap). */
export const MINIMAP = {
  /** Meters from the center to the circle's edge. */
  radiusM: 60,
  /** Side of the minimap in CSS pixels at 100 % text scale (desktop and phone). */
  sizePx: { desktop: 160, phone: 112 },
  /** The ring where far NPCs are pinned, as a fraction of the radius in pixels (leaves the arrow whole). */
  ringFraction: 0.88,
  /** Redraw at most every 100 ms (AC56: 10 per second), outside three's render loop. */
  redrawMs: 100,
  /** Turn smoothing (1/s): from one redraw to the next it covers 1 - e^(-1.2) = 70 % of what remains. */
  yawEasePerS: 12,
  /** A path or river is included if any point falls within this (in radii) plus its width. */
  shapeCullRadii: 1.5,
} as const;

export interface MinimapNpc {
  id: string;
  name: string;
  x: number;
  z: number;
}

export interface MinimapMarker {
  id: string;
  name: string;
  /** Minimap pixels (origin top left). */
  x: number;
  y: number;
  /** Real distance to the player (m). */
  distanceM: number;
  /** Farther than the ring: pinned to the ring, drawn as an arrow. */
  edge: boolean;
  /** Direction toward it, in clockwise degrees from the top (the edge arrow rotates by this). */
  bearingDeg: number;
}

export interface MinimapLine {
  widthPx: number;
  points: Vec2[];
}

export interface MinimapModel {
  sizePx: number;
  /** Center (the player), circle radius and marker ring, in pixels. */
  center: number;
  radiusPx: number;
  ringPx: number;
  pxPerM: number;
  /** Yaw it was projected with (up = forward of that yaw). */
  yawDeg: number;
  /** The player (the center), in world meters. */
  player: Point;
  markers: MinimapMarker[];
  roads: MinimapLine[];
  rivers: MinimapLine[];
  ponds: Vec2[][];
  /** The diorama's bounds as a 4-corner polygon (or null without bounds). */
  bounds: Vec2[] | null;
}

export interface MinimapInput {
  player: Point;
  yawDeg: number;
  npcs: readonly MinimapNpc[];
  sizePx: number;
  radiusM?: number;
  ground?: Pick<DioramaGround, "paths" | "rivers" | "ponds"> | null;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
}

const RAD = Math.PI / 180;

/** World-to-minimap projector: the yaw's forward goes up, the camera's right goes right. */
function projector(player: Point, yawDeg: number, center: number, pxPerM: number): (x: number, z: number) => Vec2 {
  const s = Math.sin(yawDeg * RAD);
  const c = Math.cos(yawDeg * RAD);
  // Forward = (-sin, -cos) and right = (cos, -sin): the same ones as `screenDirToWorld` in camera.ts.
  return (x, z) => {
    const dx = x - player.x;
    const dz = z - player.z;
    const forward = -dx * s - dz * c;
    const right = dx * c - dz * s;
    return [center + right * pxPerM, center - forward * pxPerM];
  };
}

/** What the minimap draws in this frame. Pure: same inputs, same pixels. */
export function minimapModel(input: MinimapInput): MinimapModel {
  const radiusM = input.radiusM ?? MINIMAP.radiusM;
  const sizePx = input.sizePx;
  const center = sizePx / 2;
  const radiusPx = sizePx / 2;
  const ringPx = radiusPx * MINIMAP.ringFraction;
  const pxPerM = radiusPx / radiusM;
  const yawDeg = normalizeYaw(input.yawDeg);
  const project = projector(input.player, yawDeg, center, pxPerM);

  const markers = input.npcs.map((n): MinimapMarker => {
    const [px, py] = project(n.x, n.z);
    const ox = px - center;
    const oy = py - center;
    const off = Math.hypot(ox, oy);
    const edge = off > ringPx;
    const k = edge ? ringPx / off : 1;
    return {
      id: n.id, name: n.name, x: center + ox * k, y: center + oy * k,
      distanceM: Math.hypot(n.x - input.player.x, n.z - input.player.z), edge,
      bearingDeg: off === 0 ? 0 : normalizeYaw(Math.atan2(ox, -oy) / RAD),
    };
  });

  const reach = radiusM * MINIMAP.shapeCullRadii;
  const near = (line: readonly { x: number; z: number }[], width: number): boolean =>
    line.some((p) => Math.hypot(p.x - input.player.x, p.z - input.player.z) <= reach + width);
  const lineOf = (l: { width: number; line: readonly { x: number; z: number }[] }): MinimapLine =>
    ({ widthPx: l.width * pxPerM, points: l.line.map((p) => project(p.x, p.z)) });
  const ground = input.ground ?? null;
  const b = input.bounds ?? null;
  return {
    sizePx, center, radiusPx, ringPx, pxPerM, yawDeg, player: { x: input.player.x, z: input.player.z }, markers,
    roads: (ground?.paths ?? []).filter((p) => near(p.line, p.width)).map(lineOf),
    rivers: (ground?.rivers ?? []).filter((r) => near(r.line, r.width)).map(lineOf),
    ponds: (ground?.ponds ?? []).filter((poly) => near(poly.map(([x, z]) => ({ x, z })), 0)).map((poly) => poly.map(([x, z]) => project(x, z))),
    bounds: b ? [project(b.minX, b.minZ), project(b.maxX, b.minZ), project(b.maxX, b.maxZ), project(b.minX, b.maxZ)] : null,
  };
}

/** The diorama's NPCs left to visit, in layout order (a completed one that is not in the diorama does not count). */
export function pendingNpcs<T extends { id: string }>(npcs: readonly T[], completed: readonly string[]): T[] {
  const done = new Set(completed);
  return npcs.filter((n) => !done.has(n.id));
}

/**
 * Minimap turn from one redraw to the next: exponential smoothing toward the camera yaw along the short way;
 * with "reduce motion" (or without a previous turn) it snaps to the requested yaw, no animation.
 */
export function stepMinimapYaw(prevDeg: number | null, targetDeg: number, dtS: number, reduceMotion: boolean): number {
  const target = normalizeYaw(targetDeg);
  if (reduceMotion || prevDeg === null || !Number.isFinite(prevDeg)) return target;
  const d = yawDelta(prevDeg, target);
  const k = 1 - Math.exp(-MINIMAP.yawEasePerS * Math.max(0, dtS));
  const next = normalizeYaw(prevDeg + d * k);
  // On arrival (less than a hundredth of a degree) it stays at the requested value: the redraw can be skipped.
  return Math.abs(yawDelta(next, target)) < 0.01 ? target : next;
}
