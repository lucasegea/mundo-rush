// world/actors/chibiModel.ts — el cuerpo de cápsulas en proporciones C (plan estetica-c M1 ítem 13, propuesta C §3). Desde
// M3 es el cuerpo de reserva: se ve mientras baja el cuerpo con esqueleto del pipeline (o si no baja), y es el que miden
// los tests sin red. Cuerpo de cápsulas, manos de bolita y la misma cabeza por código que el cuerpo con esqueleto
// (head.ts), 2,5 a 3 cabezas de alto. Presupuesto ≤ 6 llamadas (revisión de arquitectura 2026-10-12): cabeza, torso y 4 extremidades.
import { Group, Mesh, type BufferGeometry } from "three";
import { toonMaterial } from "../materials/registry";
import { capsule, mergeParts, painted, sphere } from "../props/geometry";
import { characterHeadGeometry, HEAD_RADIUS } from "./head";
import type { CharacterLook } from "./looks";

export { HEAD_RADIUS } from "./head";

/** Escala de juguete: ~2,3 m de alto (plan estetica-c M1 riesgo 2: se mide en el gate). */
export const CHIBI_SCALE = 1.05;
const HEAD_Y = 1.78;
/** Alto de la cabeza (arriba del pelo, sin sombrero) en metros del mundo. */
export const CHIBI_HEAD_TOP = (HEAD_Y + HEAD_RADIUS + 0.03) * CHIBI_SCALE;
/** Donde va la etiqueta: ~0,4 m sobre la cabeza (con lugar para el sombrero de paja). */
export const LABEL_HEIGHT = CHIBI_HEAD_TOP + 0.4 + 0.2;

export interface Chibi {
  root: Group;
  body: Group;
  head: Mesh;
  arms: [Group, Group];
  legs: [Group, Group];
  meshes: Mesh[];
}

/** Compatibilidad con M1: la cabeza del cuerpo de cápsulas es la misma que la del cuerpo con esqueleto. */
export const chibiHeadGeometry = characterHeadGeometry;

const mesh = (g: BufferGeometry, castShadow = true): Mesh => {
  const m = new Mesh(g, toonMaterial());
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
};

/** Arma el personaje (sin GPU): 6 mallas, pivotes en hombros y caderas para animar. */
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
  // La cabeza no proyecta sombra: el sombrero no ensombrece la cara (propuesta C §3, legibilidad antes que realismo).
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
 * Animación procedural (pura): quieto, respiración y balanceo de cabeza; caminando, piernas y brazos que van y vienen
 * y un rebote que crece con la velocidad. `phase` avanza con el paso; `t` es el reloj; `bounce` escala el rebote (0 con
 * "reducir movimiento", lo decide la máquina de animación).
 */
export function chibiPose(phase: number, speed01: number, t: number, bounce = 1): ChibiPose {
  if (speed01 <= 0.05) return { legSwing: 0, armSwing: 0, bob: Math.sin(t * 2) * 0.015 * bounce, headRoll: Math.sin(t * 0.9) * 0.04 };
  const s = Math.sin(phase);
  return { legSwing: s * 0.7 * speed01, armSwing: -s * 0.6 * speed01, bob: Math.abs(s) * 0.07 * speed01 * bounce, headRoll: 0 };
}

/** Aplica la pose al personaje. */
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
