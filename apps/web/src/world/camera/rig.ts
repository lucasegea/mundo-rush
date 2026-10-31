// Pure math of CameraRig (R11, D-053, D-197, D-207, D-208): offset by pitch/yaw, the long lens `perspective3D`
// from proposal C §4 (FOV, the frustum's footprint on the ground and its reach, clipping planes and scale of what
// depends on distance; the zoom ladder lives in the core and arrives as a distance), the 3/4 two-person shot of the
// chat with occlusion test, smoothing and "cut" for "reduce motion". Plan estetica-c M7: the HD-2D ortho
// math (frustum, integer pixel scale, pixel-grid snap) was removed along with its presets.

/** Default distance of `cameraOffset` (m), when none is passed. */
export const CAMERA_DISTANCE = 40;

type Vec3 = [number, number, number];

/** Offset from the target to the camera: raised by pitch, rotated in Y by yaw (yaw 0 = camera on the +z side). */
export function cameraOffset(pitchDeg: number, yawDeg: number, distance = CAMERA_DISTANCE): Vec3 {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  const flat = Math.cos(p) * distance;
  return [Math.sin(y) * flat, Math.sin(p) * distance, Math.cos(y) * flat];
}

/** Framerate-independent exponential smoothing factor. */
export function followAlpha(dtSec: number, rate = 6): number {
  return 1 - Math.exp(-rate * Math.max(0, dtSec));
}

/**
 * "Reduce motion" (D-053, F2 A7): the camera does not follow the player continuously. It stays still and, when
 * the player leaves the view center (more than `margin` of the half view on some axis), cuts straight to them.
 */
export function cutFollow(
  current: { x: number; z: number },
  target: { x: number; z: number },
  halfWidth: number,
  halfDepth: number,
  margin = 0.6,
): { x: number; z: number } {
  const out = Math.abs(target.x - current.x) > halfWidth * margin || Math.abs(target.z - current.z) > halfDepth * margin;
  return out ? { x: target.x, z: target.z } : current;
}

// ---------- perspective3D: long lens (proposal C §4, plan estetica-c M1 item 1) ----------

export const PERSPECTIVE = {
  fovDeg: 30,
  /** Vertical FOV on portrait screens (aspect < 1). */
  portraitFovDeg: 40.5,
  near: 0.5,
  far: 200,
  /** The camera looks at the player at this height. */
  targetHeight: 0.8,
  /** Exponential smoothing of the follow (1/s). */
  followRate: 5,
} as const;

/**
 * Reference distance (m): that of the start step, where proposal C §5's numbers hold (fog 34 to 78 m,
 * 44 m shadow box). Farther, what depends on distance scales with `viewScale` (D-208); closer, it does not.
 */
export const VIEW_REFERENCE_DISTANCE = 30;

/** Fog, shadow and clipping scale factor for a camera distance: 1 up to the reference one, linear after. */
export function viewScale(distance: number): number {
  return Math.max(1, distance / VIEW_REFERENCE_DISTANCE);
}

/** Vertical FOV by canvas aspect (wider in portrait, so the same width fits). */
export function perspectiveFov(aspect: number): number {
  return aspect < 1 ? PERSPECTIVE.portraitFovDeg : PERSPECTIVE.fovDeg;
}

const RAD = Math.PI / 180;
const normalize3 = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Frustum footprint on the ground y = 0: the 4 screen corners projected from the camera (which looks at
 * `target` from `cameraOffset(pitch, yaw, distance)`). null if some corner does not touch the ground (the horizon would show).
 */
export function frustumGroundFootprint(target: Vec3, pitchDeg: number, yawDeg: number, distance: number, fovDeg: number, aspect: number): [number, number][] | null {
  const off = cameraOffset(pitchDeg, yawDeg, distance);
  const cam: Vec3 = [target[0] + off[0], target[1] + off[1], target[2] + off[2]];
  const fwd = normalize3([-off[0], -off[1], -off[2]]);
  const right = normalize3(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const th = Math.tan((fovDeg * RAD) / 2);
  const tw = th * aspect;
  const out: [number, number][] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const dir: Vec3 = [fwd[0] + right[0] * sx * tw + up[0] * sy * th, fwd[1] + right[1] * sx * tw + up[1] * sy * th, fwd[2] + right[2] * sx * tw + up[2] * sy * th];
    if (dir[1] >= -1e-6) return null;
    const t = -cam[1] / dir[1];
    out.push([cam[0] + dir[0] * t, cam[2] + dir[2] * t]);
  }
  return out;
}

/**
 * Reach of the footprint on the ground: how far from the target (in x and z, the larger) what fits on screen goes.
 * Infinity if the horizon shows. The terrain must extend at least this far beyond the walkable bounds.
 */
export function groundReach(distance: number, pitchDeg: number, yawDeg: number, fovDeg: number, aspect: number): number {
  const fp = frustumGroundFootprint([0, PERSPECTIVE.targetHeight, 0], pitchDeg, yawDeg, distance, fovDeg, aspect);
  if (!fp) return Infinity;
  return Math.max(...fp.map(([x, z]) => Math.max(Math.abs(x), Math.abs(z))));
}

/** Far plane margin over the longest screen ray to the ground. */
export const FAR_MARGIN = 1.2;

/**
 * Clipping planes for a camera distance (D-208). `far` covers with margin the longest ray from the screen corners to
 * the ground (never less than PERSPECTIVE.far; if the horizon shows, PERSPECTIVE.far). `near` grows
 * with distance so as not to waste depth precision: 0.5 m up to the reference, capped at 4 m.
 */
export function cameraClip(distance: number, pitchDeg: number, fovDeg: number, aspect: number): { near: number; far: number } {
  const near = Math.min(4, PERSPECTIVE.near * viewScale(distance));
  const off = cameraOffset(pitchDeg, 0, distance);
  const cam: Vec3 = [off[0], PERSPECTIVE.targetHeight + off[1], off[2]];
  const fp = frustumGroundFootprint([0, PERSPECTIVE.targetHeight, 0], pitchDeg, 0, distance, fovDeg, aspect);
  if (!fp) return { near, far: PERSPECTIVE.far };
  const longest = Math.max(...fp.map(([x, z]) => Math.hypot(x - cam[0], cam[1], z - cam[2])));
  return { near, far: Math.max(PERSPECTIVE.far, Math.ceil(longest * FAR_MARGIN)) };
}

// ---------- dialogueFrame: 3/4 two-person shot (proposal C §4, plan estetica-c M1 item 3) ----------

export const TWO_SHOT = {
  pitchDeg: 20,
  distance: 12.5,
  /** The look-at drops 0.9 m from chest height so both fall in the upper third, above the panel. */
  chestHeight: 1.2,
  lookDrop: 0.9,
  /** Offset toward the NPC's face: the preferred one first, then the other two (6 candidates with both sides). */
  leansDeg: [27, 17.5, 37] as const,
  /** Transition (1/s). */
  rate: 3,
} as const;

/** Footprint of something that can block the chat (props by their box, trees by their canopy), with its height. */
export type Obstacle =
  | { kind: "rect"; minX: number; maxX: number; minZ: number; maxZ: number; height: number }
  | { kind: "circle"; x: number; z: number; r: number; height: number };

export interface TwoShotCandidate {
  side: 1 | -1;
  leanDeg: number;
  yawDeg: number;
  /** Blocked samples of the camera-characters segments, plus 0.5 if it is not the preferred offset. */
  score: number;
}

export interface TwoShot {
  target: Vec3;
  pitchDeg: number;
  yawDeg: number;
  distance: number;
  chosen: TwoShotCandidate;
}

type P2 = { x: number; z: number };

const inside = (o: Obstacle, x: number, z: number, margin: number): boolean =>
  o.kind === "rect"
    ? x > o.minX - margin && x < o.maxX + margin && z > o.minZ - margin && z < o.maxZ + margin
    : Math.hypot(x - o.x, z - o.z) < o.r + margin;

/** The 6 candidates (2 sides × 3 offsets) with their occlusion score, in order of preference. */
export function twoShotCandidates(player: P2, npc: P2, obstacles: readonly Obstacle[], heightAt?: (x: number, z: number) => number): TwoShotCandidate[] {
  const L = Math.hypot(player.x - npc.x, player.z - npc.z) || 1;
  const nx = (player.x - npc.x) / L;
  const nz = (player.z - npc.z) / L;
  const target = twoShotTarget(player, npc, heightAt);
  const out: TwoShotCandidate[] = [];
  for (const side of [1, -1] as const) {
    for (const leanDeg of TWO_SHOT.leansDeg) {
      // Perpendicular to the player-NPC line, shifted toward the player: the NPC (who faces the player) ends up front-on in 3/4.
      const lean = Math.sin(leanDeg * RAD);
      const ux = -nz * side;
      const uz = nx * side;
      const ox = ux * Math.sqrt(1 - lean * lean) + nx * lean;
      const oz = uz * Math.sqrt(1 - lean * lean) + nz * lean;
      const yawDeg = Math.atan2(ox, oz) / RAD;
      const off = cameraOffset(TWO_SHOT.pitchDeg, yawDeg, TWO_SHOT.distance);
      const cam: Vec3 = [target[0] + off[0], target[1] + off[1], target[2] + off[2]];
      let hits = 0;
      for (const who of [player, npc]) {
        const N = 28;
        const chest = (heightAt ? heightAt(who.x, who.z) : 0) + TWO_SHOT.chestHeight;
        for (let k = 1; k <= N; k++) {
          const t = k / N;
          const x = who.x + (cam[0] - who.x) * t;
          const y = chest + (cam[1] - chest) * t;
          const z = who.z + (cam[2] - who.z) * t;
          if (Math.hypot(x - who.x, z - who.z) < 0.7) continue; // the character itself
          // The obstacles' height is above their ground; the sample is compared against the same ground.
          const base = heightAt ? heightAt(x, z) : 0;
          for (const o of obstacles) if (y - base < o.height && inside(o, x, z, 0.3)) hits++;
          if (heightAt && heightAt(x, z) > y - 0.2) hits++;
        }
      }
      out.push({ side, leanDeg, yawDeg, score: hits + (leanDeg === TWO_SHOT.leansDeg[0] ? 0 : 0.5) });
    }
  }
  return out;
}

/**
 * The point the two-person shot looks at: between the two, at chest height minus the drop, over the ground of both
 * (with relief, a fixed height left the camera under the hill).
 */
export function twoShotTarget(player: P2, npc: P2, heightAt?: (x: number, z: number) => number): Vec3 {
  const ground = heightAt ? (heightAt(player.x, player.z) + heightAt(npc.x, npc.z)) / 2 : 0;
  return [(player.x + npc.x) / 2, ground + TWO_SHOT.chestHeight - TWO_SHOT.lookDrop, (player.z + npc.z) / 2];
}

/** The chat framing: the candidate with the least occlusion (tie: the first in order of preference). Never fails. */
export function twoShotFrame(player: P2, npc: P2, obstacles: readonly Obstacle[], heightAt?: (x: number, z: number) => number): TwoShot {
  const cands = twoShotCandidates(player, npc, obstacles, heightAt);
  const chosen = cands.reduce((best, c) => (c.score < best.score ? c : best));
  return { target: twoShotTarget(player, npc, heightAt), pitchDeg: TWO_SHOT.pitchDeg, yawDeg: chosen.yawDeg, distance: TWO_SHOT.distance, chosen };
}

/** Shortest angle difference (degrees), in (-180, 180]. */
export function shortestYawDelta(from: number, to: number): number {
  const d = (((to - from) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

// ---------- thirdPerson: behind the character (open-world-3d T5, D-820, PD-5) ----------

export interface ThirdPersonInput {
  /** The pivot: the player (or the map center) at chest height. */
  target: Vec3;
  yawDeg: number;
  /** Effective tilt (the zoom's, `zoomPose`). */
  pitchDeg: number;
  /** How far down the gaze drops (degrees); by default, the tilt (looks at the pivot). */
  lookPitchDeg?: number;
  distance: number;
  /** What can block the character: the camera moves closer until the camera-pivot segment is clear. */
  obstacles?: readonly Obstacle[];
  heightAt?: ((x: number, z: number) => number) | null;
}

export interface ThirdPersonShot {
  position: Vec3;
  lookAt: Vec3;
  /** Final distance to the pivot, after approaching for obstacles or terrain (never less than 1.5 m). */
  distanceUsed: number;
}

export const THIRD_PERSON_RIG = {
  /** Minimum distance after approaching for an obstacle. */
  minPullIn: 1.5,
  /** Sampling step of the camera-pivot segment (m) and margin around each obstacle. */
  sampleStep: 0.1,
  obstacleMargin: 0.2,
  /** What remains between the camera and the first obstacle. */
  pullInGap: 0.3,
  /** The camera never goes below this over the terrain, nor the segment's midpoint below this. */
  terrainClearance: 0.6,
  segmentClearance: 0.35,
  /** How far ahead it looks when it is not looking at the pivot. */
  lookAhead: 30,
} as const;

/**
 * The third-person camera (D-820, AC22-24): behind the yaw (yaw 0 = camera on the +z side), raised by the
 * tilt, at `distance` from the pivot; it moves closer if the camera-pivot segment crosses an obstacle (never closer than 1.5 m)
 * or the terrain, and never ends up less than 0.6 m above the ground. It looks ahead, dropping `lookPitchDeg`.
 */
export function solveThirdPerson(input: ThirdPersonInput): ThirdPersonShot {
  const { target, yawDeg, pitchDeg, distance } = input;
  const obstacles = input.obstacles ?? [];
  const heightAt = input.heightAt ?? null;
  const dir = cameraOffset(pitchDeg, yawDeg, 1);
  const at = (d: number): Vec3 => [target[0] + dir[0] * d, target[1] + dir[1] * d, target[2] + dir[2] * d];
  const blocked = (p: Vec3, s: number): boolean => {
    for (const o of obstacles) if (p[1] < o.height && inside(o, p[0], p[2], THIRD_PERSON_RIG.obstacleMargin)) return true;
    // The terrain blocks if the far half of the segment passes below the ground plus the margin.
    return heightAt !== null && s > 0.3 && p[1] < heightAt(p[0], p[2]) + THIRD_PERSON_RIG.segmentClearance;
  };
  let used = distance;
  if (obstacles.length > 0 || heightAt) {
    const n = Math.max(1, Math.ceil(distance / THIRD_PERSON_RIG.sampleStep));
    for (let k = 1; k <= n; k++) {
      const d = (k / n) * distance;
      if (blocked(at(d), k / n)) {
        used = Math.max(THIRD_PERSON_RIG.minPullIn, d - THIRD_PERSON_RIG.pullInGap);
        break;
      }
    }
  }
  const position = at(used);
  if (heightAt) position[1] = Math.max(position[1], heightAt(position[0], position[2]) + THIRD_PERSON_RIG.terrainClearance);
  const lp = (input.lookPitchDeg ?? pitchDeg) * RAD;
  const fx = -Math.sin(yawDeg * RAD);
  const fz = -Math.cos(yawDeg * RAD);
  const ahead = input.lookPitchDeg === undefined ? used : THIRD_PERSON_RIG.lookAhead;
  const lookAt: Vec3 = [position[0] + fx * Math.cos(lp) * ahead, position[1] - Math.sin(lp) * ahead, position[2] + fz * Math.cos(lp) * ahead];
  return { position, lookAt, distanceUsed: used };
}
