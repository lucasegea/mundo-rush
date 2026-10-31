// world/actors/gestures.ts — the procedural gestures of proposal C §3's minimal set that KayKit Rig_Medium does not ship
// as a clip (plan estetica-c M3): talk, listen, wave, nod, shake, think, be surprised and carry. Pure (no
// three): each gesture gives, for an instant, where some arm bones point (direction in the character's
// space, which faces +z, with the character's left at +x) and how much others rotate in their own frame (KayKit's head
// has the character's frame at rest: x nods, y shakes, z tilts). skinned.ts applies it on top of the
// base clip with the envelope weight. Bone names are the glTF ones (`upperarm.r`).
// M3 SEAM: if the retargeting of Quaternius UAL 2 to Rig_Medium is validated (clip manifest), a gesture can become
// a file clip by changing its row in clips.ts; the animation machine does not change.

export type Vec3 = readonly [number, number, number];

export const PROCEDURAL_GESTURES = ["hablar", "escuchar", "saludar", "asentir", "negar", "pensar", "sorprenderse", "cargar"] as const;
export type ProceduralGesture = (typeof PROCEDURAL_GESTURES)[number];

export interface GestureSpec {
  /** Seconds it lasts; null = continues while requested (talk, listen, think, carry). */
  durationSec: number | null;
  /** Bones it moves (the manifest validates them against the skeleton). */
  bones: readonly string[];
}

export interface GesturePose {
  /** Envelope weight, from 0 to 1 (enters in 0.25 s and, if it lasts, exits in the last 0.3 s). */
  weight: number;
  /** Bone → direction it points (from the bone to its child), in the character's space. */
  aim: Readonly<Record<string, Vec3>>;
  /** Bone → added rotation in its own frame (radians in x, y, z). */
  turn: Readonly<Record<string, Vec3>>;
}

const FADE_IN = 0.25;
const FADE_OUT = 0.3;
const TAU = Math.PI * 2;

/** Left-right mirror of a direction. */
const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];

export const GESTURES: Readonly<Record<ProceduralGesture, GestureSpec>> = {
  hablar: { durationSec: null, bones: ["head", "upperarm.r", "lowerarm.r"] },
  escuchar: { durationSec: null, bones: ["head"] },
  saludar: { durationSec: 1.8, bones: ["upperarm.r", "lowerarm.r"] },
  asentir: { durationSec: 1.2, bones: ["head"] },
  negar: { durationSec: 1.2, bones: ["head"] },
  pensar: { durationSec: null, bones: ["head", "upperarm.r", "lowerarm.r"] },
  sorprenderse: { durationSec: 1.1, bones: ["head", "chest", "upperarm.l", "lowerarm.l", "upperarm.r", "lowerarm.r"] },
  cargar: { durationSec: null, bones: ["upperarm.l", "lowerarm.l", "upperarm.r", "lowerarm.r"] },
};

/** Envelope of a gesture at second `t` since it started. */
export function gestureWeight(spec: GestureSpec, t: number): number {
  if (t < 0) return 0;
  const fadeIn = Math.min(1, t / FADE_IN);
  if (spec.durationSec === null) return fadeIn;
  if (t >= spec.durationSec) return 0;
  return Math.min(fadeIn, (spec.durationSec - t) / FADE_OUT, 1);
}

/** Finished? (the ones that last while requested never finish by themselves). */
export const gestureDone = (id: ProceduralGesture, t: number): boolean => {
  const d = GESTURES[id].durationSec;
  return d !== null && t >= d;
};

/** The pose of gesture `id` at `t` seconds since it started. */
export function gesturePose(id: ProceduralGesture, t: number): GesturePose {
  const weight = gestureWeight(GESTURES[id], t);
  const s = (hz: number, phase = 0) => Math.sin(TAU * hz * t + phase);
  switch (id) {
    case "asentir":
      return { weight, aim: {}, turn: { head: [0.16 + 0.16 * s(2.4, -Math.PI / 2), 0, 0] } };
    case "negar":
      return { weight, aim: {}, turn: { head: [0, 0.38 * s(2), 0] } };
    case "escuchar":
      return { weight, aim: {}, turn: { head: [0.05 + 0.03 * s(0.4), 0, 0.11] } };
    case "hablar":
      return {
        weight,
        aim: { "upperarm.r": [-0.45, -0.78, 0.4], "lowerarm.r": [-0.25, 0.05 + 0.3 * s(0.7), 1] },
        turn: { head: [0.05 * s(1.6), 0.07 * s(0.55), 0.04 * s(0.35)] },
      };
    case "saludar":
      return { weight, aim: { "upperarm.r": [-0.62, 0.72, 0.2], "lowerarm.r": [-0.1 + 0.42 * s(2.2), 1, 0.15] }, turn: {} };
    case "pensar":
      return { weight, aim: { "upperarm.r": [-0.22, -0.8, 0.55], "lowerarm.r": [0.38, 0.86, 0.34] }, turn: { head: [-0.12, 0, 0.13] } };
    case "sorprenderse": {
      const upper: Vec3 = [-0.75, -0.15, 0.62];
      const lower: Vec3 = [-0.3, 0.75, 0.6];
      return {
        weight,
        aim: { "upperarm.r": upper, "lowerarm.r": lower, "upperarm.l": mirror(upper), "lowerarm.l": mirror(lower) },
        turn: { head: [-0.22, 0, 0], chest: [-0.12, 0, 0] },
      };
    }
    case "cargar": {
      const upper: Vec3 = [-0.22, -0.5, 0.84];
      const lower: Vec3 = [0.12, 0.05, 1];
      return { weight, aim: { "upperarm.r": upper, "lowerarm.r": lower, "upperarm.l": mirror(upper), "lowerarm.l": mirror(lower) }, turn: {} };
    }
  }
}
