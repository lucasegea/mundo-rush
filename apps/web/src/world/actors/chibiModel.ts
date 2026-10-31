// world/actors/chibiModel.ts — the capsule body in C proportions (plan estetica-c M1 item 13, proposal C §3). Since
// M3 it is the fallback body: it shows while the skeleton body from the pipeline downloads (or if it does not), and it is the one the
// network-free tests measure. Capsule body, ball hands and the same code-built head as the skeleton body
// (head.ts), 2.5 to 3 heads tall. Budget ≤ 6 calls (architecture review 2026-10-12): head, torso and 4 limbs.
import { Group, Mesh, type BufferGeometry } from "three";
import { toonMaterial } from "../materials/registry";
import { capsule, mergeParts, painted, sphere } from "../props/geometry";
import { characterHeadGeometry, HEAD_RADIUS } from "./head";
import type { CharacterLook } from "./looks";

export { HEAD_RADIUS } from "./head";

/** Toy scale: ~2.3 m tall (plan estetica-c M1 risk 2: measured at the gate). */
export const CHIBI_SCALE = 1.05;
const HEAD_Y = 1.78;
/** Head height (top of the hair, no hat) in world meters. */
export const CHIBI_HEAD_TOP = (HEAD_Y + HEAD_RADIUS + 0.03) * CHIBI_SCALE;
/** Where the label goes: ~0.4 m above the head (with room for the straw hat). */
export const LABEL_HEIGHT = CHIBI_HEAD_TOP + 0.4 + 0.2;

export interface Chibi {
  root: Group;
  body: Group;
  head: Mesh;
  arms: [Group, Group];
  legs: [Group, Group];
  meshes: Mesh[];
}

/** M1 compatibility: the capsule body's head is the same as the skeleton body's. */
export const chibiHeadGeometry = characterHeadGeometry;

const mesh = (g: BufferGeometry, castShadow = true): Mesh => {
  const m = new Mesh(g, toonMaterial());
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
};

/** Builds the character (no GPU): 6 meshes, pivots at shoulders and hips for animating. */
export function buildChibi(look: CharacterLook, seed = 0): Chibi {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const meshes: Mesh[] = [];
  const limb = (x: number, y: number, g: BufferGeometry): Group => {
    const pivot = new Group();
    pivot.position.set(x, y, 0);
    const m = mesh(g);
    pivot.add(m);
    meshes.push(m);
    body.add(pivot);
    return pivot;
  };
  const leg = (x: number) => limb(x, 0.62, mergeParts([
    painted(capsule(0.12, 0.58).translate(0, -0.6, 0), look.pants, seed),
    painted(sphere(0.13, 8, 6).scale(1, 0.7, 1.25).translate(0, -0.56, 0.05), "tronco", seed),
  ]));
  const arm = (x: number) => limb(x, 1.22, mergeParts([
    painted(capsule(0.1, 0.56).translate(0, -0.55, 0), look.shirt, seed),
    painted(sphere(0.11, 8, 6).translate(0, -0.55, 0), look.skin, seed),
  ]));
  const legs: [Group, Group] = [leg(-0.16), leg(0.16)];
  const torso = mesh(painted(capsule(0.34, 1.04).translate(0, 0.48, 0), look.shirt, seed, { top: 0.1 }));
  body.add(torso);
  meshes.push(torso);
  const arms: [Group, Group] = [arm(-0.45), arm(0.45)];
  // The head casts no shadow: the hat does not shade the face (proposal C §3, legibility over realism).
  const head = mesh(characterHeadGeometry(look, seed), false);
  head.position.y = HEAD_Y;
  body.add(head);
  meshes.push(head);
  root.scale.setScalar(CHIBI_SCALE * look.scale);
  return { root, body, head, arms, legs, meshes };
}

export interface ChibiPose {
  legSwing: number;
  armSwing: number;
  bob: number;
  headRoll: number;
}

/**
 * Procedural animation (pure): idle, breathing and head sway; walking, legs and arms swinging back and forth
 * and a bounce that grows with speed. `phase` advances with the stride; `t` is the clock; `bounce` scales the bounce (0 with
 * "reduce motion", decided by the animation machine).
 */
export function chibiPose(phase: number, speed01: number, t: number, bounce = 1): ChibiPose {
  if (speed01 <= 0.05) return { legSwing: 0, armSwing: 0, bob: Math.sin(t * 2) * 0.015 * bounce, headRoll: Math.sin(t * 0.9) * 0.04 };
  const s = Math.sin(phase);
  return { legSwing: s * 0.7 * speed01, armSwing: -s * 0.6 * speed01, bob: Math.abs(s) * 0.07 * speed01 * bounce, headRoll: 0 };
}

/** Applies the pose to the character. */
export function applyChibiPose(c: Chibi, p: ChibiPose): void {
  c.legs[0].rotation.x = p.legSwing;
  c.legs[1].rotation.x = -p.legSwing;
  c.arms[0].rotation.x = p.armSwing;
  c.arms[1].rotation.x = -p.armSwing;
  c.body.position.y = p.bob;
  c.head.rotation.z = p.headRoll;
}

export function disposeChibi(c: Chibi): void {
  for (const m of c.meshes) m.geometry.dispose();
}
