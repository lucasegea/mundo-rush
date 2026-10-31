// world/actors/glide.ts — visual smoothing of a jump in the logical pose (plan estetica-c M1 item 4, architecture review 2026-10-12):
// when the chat starts the core drops the player 2.6 m from the NPC at once (position = previous); world/ carries it there
// from the last drawn position in ~0.35 s. With "reduce motion" it snaps. A normal step (< 0.6 m) does not glide.
export const GLIDE_SEC = 0.35;
/** More than this between the drawn and the logical is a jump (a 30 Hz step moves ~0.13 m). */
export const GLIDE_JUMP = 0.6;

export interface Spot {
  x: number;
  z: number;
}

export interface GlideState {
  shown: Spot;
  /** Where it glides from and how far along it is (0 to 1); null with no glide. */
  glide: { from: Spot; t: number } | null;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

/** One frame: where it is drawn, given the logical one. */
export function stepGlide(s: GlideState, logical: Spot, dtSec: number, cut: boolean): GlideState {
  if (cut) return { shown: logical, glide: null };
  let glide = s.glide;
  if (!glide && Math.hypot(logical.x - s.shown.x, logical.z - s.shown.z) > GLIDE_JUMP) glide = { from: s.shown, t: 0 };
  if (!glide) return { shown: logical, glide: null };
  const t = Math.min(1, glide.t + dtSec / GLIDE_SEC);
  const k = ease(t);
  const shown = { x: glide.from.x + (logical.x - glide.from.x) * k, z: glide.from.z + (logical.z - glide.from.z) * k };
  return { shown, glide: t >= 1 ? null : { from: glide.from, t } };
}
