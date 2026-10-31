// Per-frame presentation state, shared among world/ components (R7: high frequency in refs, never in
// the store). Player writes the player's drawn position; CameraRig follows it and the NPCs look at it. Player is mounted
// before CameraRig, so each frame the camera reads the already-updated position. Characters leave their spot in
// `actorSpots` for the blob shadows; CameraRig leaves in `cameraLook` the point it looks at and its already-smoothed distance
// (the sun, the shadow box and the fog follow it, D-208).
import type { Camera, WebGLRenderer } from "three";

export const followTarget = { x: 0, z: 0, ready: false };
export const actorSpots = new Map<string, { x: number; y: number; z: number }>();
/**
 * Open-world-3d T6 (D-819): the mounted diorama's ground. Diorama sets `heightAt` (the drawn mesh) and `lift` (0.02 m
 * with relief, 0 without); characters rest their feet at `actorY`. Without a diorama, the ground is y = 0.
 */
export const worldGround: { heightAt: (x: number, z: number) => number; lift: number } = { heightAt: () => 0, lift: 0 };
/** The height of a character's feet at (x, z): the terrain plus the lift. */
export const actorY = (x: number, z: number): number => worldGround.heightAt(x, z) + worldGround.lift;
/**
 * Open-world-3d T7 (AC45): the open-world canvas's renderer (set by Diorama). The browser walkthrough draws
 * only the trees with it and reads `renderer.info` looking at the forest and with its back to it.
 */
export const worldRenderer: { gl: WebGLRenderer | null } = { gl: null };
/**
 * Open-world-3d T5: also the already-smoothed zoom t (fog, labels and beacons follow it), the drawn yaw and the
 * camera itself (the browser walkthrough projects the beacons with its matrices, AC30).
 */
export const cameraLook: { x: number; y: number; z: number; distance: number; t: number; yawDeg: number; camera: Camera | null } = {
  x: 0, y: 0, z: 0, distance: 30, t: 0, yawDeg: 0, camera: null,
};
/**
 * Plan estetica-c M3: the characters animated this frame (AnimationGovernor picks them by tier, distance and
 * screen). While no governor is mounted (`active` false) everyone is animated.
 */
export const animatedActors = { active: false, ids: new Set<string>() };
/**
 * Open-world-3d T7b (LK6): the mounted diorama look's id (set by GameCanvas). The browser walkthrough reads it to
 * run AC39 and AC41 against an explicit DEFAULT_LOOK (they are rules of that look, not of the engine).
 */
export const activeLook: { id: string | null } = { id: null };
/**
 * Open-world-3d T8 (AC41): the drawn grass bed (center, radius and on/off of the disc, the ground's `grassBed`). Diorama
 * sets it every frame; the browser walkthrough measures AC41's rings against this disc, not against the tier's
 * radius (with the zoom the disc shrinks and its center goes ahead of the player).
 */
export const grassBedView: { x: number; z: number; radius: number; on: number } = { x: 0, z: 0, radius: 0, on: 0 };
/**
 * T10-integrate: the destination of the world's frames according to the tier (set by GameCanvas when drawing). With postprocessing
 * the scene is drawn into the composer's render target and its programs are different (no tone mapping, linear space); the
 * precompilation (world/budget/WorldLoad.tsx) compiles for that destination.
 */
export const worldFrame: { post: boolean } = { post: false };
