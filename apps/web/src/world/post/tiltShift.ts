// world/post/tiltShift.ts — the high tier tilt-shift according to the camera distance (D-208), pure. The focus line
// is horizontal and passes through the screen center, which is where the camera puts the player (and in the chat, the point
// between the two): the blur grows above and below, as proposal C §5 asks. Up to the reference distance
// (30 m) M1's numbers hold; farther the blur drops and the sharp band opens, so moving away shows
// the map instead of covering it.

export interface TiltShiftParams {
  blur: number;
  taper: number;
  /** Ends of the focus line in screen coordinates (0 to 1). */
  start: [number, number];
  end: [number, number];
}

export const TILT_SHIFT_BASE = { blur: 0.25, taper: 0.6 } as const;

/** `scale` is `viewScale(distance)` from world/camera/rig.ts (1 up to 30 m, linear after). */
export function tiltShiftFor(scale: number): TiltShiftParams {
  const k = Math.max(1, scale);
  return {
    blur: TILT_SHIFT_BASE.blur * Math.max(0.6, 1 / Math.sqrt(k)),
    taper: TILT_SHIFT_BASE.taper * Math.min(1.5, Math.sqrt(k)),
    start: [0, 0.5],
    end: [1, 0.5],
  };
}

/** Open-world-3d T6 (D-823): the tilt-shift goes in the overview and the two-person shot, never in `thirdPerson`. */
export const tiltShiftOn = (preset: string): boolean => preset !== "thirdPerson";
