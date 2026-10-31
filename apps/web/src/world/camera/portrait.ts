// world/camera/portrait.ts — the camera for dialogue-only portraits (plan estetica-c M3, D-030; R11: cameras live
// in world/camera/). The framing is pure: a front-facing bust, slightly from above, with the head (and the hat) inside
// and the shoulders below. The factory builds the PerspectiveCamera used by the portrait studio (world/portraits/studio.ts).
import { PerspectiveCamera } from "three";

export interface PortraitFraming {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fovDeg: number;
}

/** Square portrait: vertical field of view and how much of the bust fits (in head radii). */
export const PORTRAIT_FOV_DEG = 24;
const BUST_RADII = 3.4;

/**
 * Bust framing for a head with center `head` (world meters, the character facing +z) and radius `radius`:
 * the camera in front and slightly above; it looks a little below the center so the shoulders fit.
 */
export function portraitFraming(head: readonly [number, number, number], radius: number): PortraitFraming {
  const halfFov = (PORTRAIT_FOV_DEG * Math.PI) / 360;
  const distance = (BUST_RADII * radius) / Math.tan(halfFov);
  const target: [number, number, number] = [head[0], head[1] - 0.35 * radius, head[2]];
  return { position: [head[0], target[1] + distance * 0.12, head[2] + distance], target, fovDeg: PORTRAIT_FOV_DEG };
}

export function createPortraitCamera(f: PortraitFraming): PerspectiveCamera {
  const cam = new PerspectiveCamera(f.fovDeg, 1, 0.05, 50);
  cam.position.set(...f.position);
  cam.lookAt(...f.target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}
