// world/nature/culling.ts — which tree, rock and detail instances are uploaded to the GPU (open-world-3d T7, AC45), port
// of the V6 mockup (`world.js` updateLOD). An instance enters each level whose band contains its distance to the player
// (with the @lg/art margin `bandLimits`) only if its sphere touches the frustum, it is not past the fog nor its maximum
// distance (small rocks), and the camera is not inside it (a canopy covering the screen is hidden). It walks
// only when the view really changed (CullGate): the player moved 1 m, the turn or tilt changed 5° or the
// zoom changed the camera distance by 1 m (5 % when far), and once more when the view settles far from the last
// walk. Standing still, nothing is uploaded.
import { Sphere, type Frustum, type InstancedMesh, type Vector3 } from "three";
import { bandLimits, type ShaderBand } from "@lg/art";

/** An instance: its place, its sphere (center at height and radius, in the world), its matrix and its tint. */
export interface NatureEntry {
  x: number;
  z: number;
  /** Base height and scale of the instance: with the mesh loaded, the sphere is recomputed with them. */
  base: number;
  k: number;
  cy: number;
  rad: number;
  /** Beyond this distance to the player it is not drawn (small rocks, SMALL_ROCK_MAX_DISTANCE); otherwise, Infinity. */
  maxD: number;
  matrix: ArrayLike<number>;
  tint: readonly [number, number, number];
}

export interface NatureLevel {
  band: ShaderBand;
  mesh: InstancedMesh;
}

/** A group of instances of a variant with its levels (full, light, impostor; or a single band). */
export interface NatureGroup {
  entries: NatureEntry[];
  levels: NatureLevel[];
}

export interface CullView {
  /** The player (center of the bands). */
  cx: number;
  cz: number;
  camera: Vector3;
  frustum: Frustum;
  fogFar: number;
  full: number;
  mid: number;
}

const sphere = new Sphere();

/** Is the instance seen? (sphere in the frustum, before the fog and its maximum distance, camera outside it). */
export function entryVisible(e: NatureEntry, v: CullView): boolean {
  const d = Math.hypot(e.x - v.cx, e.z - v.cz);
  if (d - e.rad > v.fogFar || d > e.maxD) return false;
  sphere.center.set(e.x, e.cy, e.z);
  sphere.radius = e.rad;
  if (!v.frustum.intersectsSphere(sphere)) return false;
  return sphere.center.distanceTo(v.camera) >= e.rad * 0.8;
}

/** Uploads to each level its visible instances within its band. Returns how many it uploaded per level. */
export function cullGroup(g: NatureGroup, v: CullView): number[] {
  const n = g.levels.map(() => 0);
  const lim = g.levels.map((l) => bandLimits(l.band, v.full, v.mid));
  for (const e of g.entries) {
    if (!entryVisible(e, v)) continue;
    const d = Math.hypot(e.x - v.cx, e.z - v.cz);
    g.levels.forEach((l, li) => {
      const [a, b] = lim[li] as [number, number];
      if (d < a || d > b) return;
      const k = (n[li] as number)++;
      l.mesh.instanceMatrix.array.set(e.matrix, k * 16);
      const c = l.mesh.instanceColor?.array;
      if (c) c.set(e.tint, k * 3);
    });
  }
  g.levels.forEach((l, li) => {
    l.mesh.count = n[li] as number;
    l.mesh.visible = (n[li] as number) > 0;
    l.mesh.instanceMatrix.needsUpdate = true;
    if (l.mesh.instanceColor) l.mesh.instanceColor.needsUpdate = true;
  });
  return n;
}

/** Thresholds of the walk (AC45). */
export const CULL_MOVE_M = 1;
export const CULL_TURN_DEG = 5;

export interface GateState {
  /** The player. */
  x: number;
  z: number;
  /** Turn and tilt of the view (degrees) and camera distance to the player (m). */
  yawDeg: number;
  pitchDeg: number;
  distance: number;
}

const angleDelta = (a: number, b: number): number => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/**
 * Below this between two consecutive frames, the view is still (the camera finished settling). QA fix 1
 * (finding 5): with only the thresholds, a camera settling by less than 1 m or 5° was left with the walk at
 * half way and the probe triangles came out bimodal in the same pose.
 */
export const CULL_REST_M = 1e-3;
export const CULL_REST_DEG = 0.02;

const near = (a: GateState, b: GateState, m: number, deg: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) < m
  && angleDelta(a.yawDeg, b.yawDeg) < deg
  && Math.abs(a.pitchDeg - b.pitchDeg) < deg
  && Math.abs(a.distance - b.distance) < m;

/**
 * Decides when to walk: the first time, afterwards only if the view changed more than the thresholds since the last, and one
 * more time when the view stays still at a place different from the last walk (settling), so a fixed pose always gives
 * the same walk.
 */
export class CullGate {
  private last: GateState | null = null;
  private prev: GateState | null = null;
  /** How many times it said yes (the tests and the probe read it). */
  runs = 0;

  shouldUpdate(s: GateState): boolean {
    const l = this.last;
    const p = this.prev;
    this.prev = { ...s };
    const changed = !l
      || Math.hypot(s.x - l.x, s.z - l.z) >= CULL_MOVE_M
      || angleDelta(s.yawDeg, l.yawDeg) >= CULL_TURN_DEG
      || Math.abs(s.pitchDeg - l.pitchDeg) >= CULL_TURN_DEG
      || Math.abs(s.distance - l.distance) >= Math.max(CULL_MOVE_M, 0.05 * l.distance);
    const settled = !changed && p !== null && near(s, p, CULL_REST_M, CULL_REST_DEG) && !near(s, l, CULL_REST_M, CULL_REST_DEG);
    if (changed || settled) {
      this.last = { ...s };
      this.runs += 1;
    }
    return changed || settled;
  }

  /** The next query walks no matter what (the content changed: the meshes arrived). */
  reset(): void {
    this.last = null;
  }
}

/** Turn and elevation (degrees) of a camera view direction (from its world matrix, the -z column). */
export function viewAngles(matrixWorld: { elements: ArrayLike<number> }): { yawDeg: number; pitchDeg: number } {
  const e = matrixWorld.elements;
  const fx = -(e[8] as number), fy = -(e[9] as number), fz = -(e[10] as number);
  const len = Math.hypot(fx, fy, fz) || 1;
  return { yawDeg: (Math.atan2(fx, fz) * 180) / Math.PI, pitchDeg: (Math.asin(Math.max(-1, Math.min(1, fy / len))) * 180) / Math.PI };
}
