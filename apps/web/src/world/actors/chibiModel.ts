// world/actors/chibiModel.ts — personaje placeholder en proporciones C (plan estetica-c M1 ítem 13, propuesta C §3): cuerpo
// de cápsulas, cabeza redonda de radio 0,42, manos de bolita, ojos ovalados con brillo y mejillas, 2,5 a 3 cabezas de
// alto. Presupuesto ≤ 6 llamadas por personaje (revisión de arquitectura 2026-10-12): cabeza (con ojos, mejillas, pelo y accesorio
// fusionados), torso y 4 extremidades con su mano o su pie. Todo con el material toon compartido.
import { Group, Mesh, SphereGeometry, type BufferGeometry } from "three";
import { toonMaterial } from "../materials/registry";
import { capsule, mergeParts, painted, sphere, torus } from "../props/geometry";
import type { ChibiLook } from "./looks";

/** Escala de juguete: ~2,3 m de alto (plan estetica-c M1 riesgo 2: se mide en el gate). */
export const CHIBI_SCALE = 1.05;
const HEAD_Y = 1.78;
export const HEAD_RADIUS = 0.42;
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

function accessory(look: ChibiLook, seed: number): BufferGeometry[] {
  switch (look.accessory) {
    case "gorra":
      return [
        painted(new SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, 0.06, 0), "gorra", seed),
        painted(sphere(0.3, 12, 6).scale(1, 0.12, 1.1).translate(0, 0.2, 0.36), "gorra", seed),
      ];
    case "paja":
      return [
        painted(sphere(0.74, 16, 6).scale(1, 0.06, 1).translate(0, 0.28, 0), "paja", seed, { jitter: 0.12 }),
        painted(new SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.9, 1).translate(0, 0.3, 0), "paja", seed, { jitter: 0.12 }),
        painted(torus(0.4, 0.05, 6, 20).rotateX(Math.PI / 2).translate(0, 0.33, 0), "techo", seed),
      ];
    case "panuelo":
      return [
        painted(new SphereGeometry(0.455, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(-0.35).translate(0, 0.02, -0.02), "casa-1", seed),
        painted(sphere(0.11, 8, 6).translate(0, 0.02, -0.45), "casa-1", seed),
      ];
    case "rodete":
      return [painted(sphere(0.21, 12, 8).translate(0, 0.36, -0.22), look.hair, seed)];
    default:
      return [];
  }
}

/** Geometría de la cabeza: cabeza, pelo, ojos con brillo, mejillas y accesorio, en una sola malla centrada en 0. */
export function chibiHeadGeometry(look: ChibiLook, seed = 0): BufferGeometry {
  const parts: BufferGeometry[] = [
    painted(sphere(HEAD_RADIUS, 16, 11), look.skin, seed, { top: 0.1, bottomDark: 0.08 }),
    painted(new SphereGeometry(0.445, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateX(-0.55).translate(0, 0.02, -0.02), look.hair, seed, { top: 0.1 }),
  ];
  for (const x of [-0.14, 0.14]) {
    parts.push(painted(sphere(0.068, 8, 6).scale(1, 1.3, 0.6).translate(x, -0.02, 0.385), "tinta", seed, { jitter: 0, bottomDark: 0 }));
    parts.push(painted(sphere(0.022, 6, 4).translate(x + 0.02, 0.02, 0.43), "blanco", seed, { jitter: 0, bottomDark: 0 }));
    parts.push(painted(sphere(0.06, 8, 6).scale(1, 0.6, 0.3).translate(x * 1.7, -0.12, 0.37), "mejilla", seed, { jitter: 0, bottomDark: 0 }));
  }
  parts.push(...accessory(look, seed));
  return mergeParts(parts);
}

const mesh = (g: BufferGeometry, castShadow = true): Mesh => {
  const m = new Mesh(g, toonMaterial());
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
};

/** Arma el personaje (sin GPU): 6 mallas, pivotes en hombros y caderas para animar. */
export function buildChibi(look: ChibiLook, seed = 0): Chibi {
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
  const head = mesh(chibiHeadGeometry(look, seed), false);
  head.position.y = HEAD_Y;
  body.add(head);
  meshes.push(head);
  root.scale.setScalar(CHIBI_SCALE);
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
 * y un rebote que crece con la velocidad. `phase` avanza con el paso; `t` es el reloj.
 */
export function chibiPose(phase: number, speed01: number, t: number): ChibiPose {
  if (speed01 <= 0.05) return { legSwing: 0, armSwing: 0, bob: Math.sin(t * 2) * 0.015, headRoll: Math.sin(t * 0.9) * 0.04 };
  const s = Math.sin(phase);
  return { legSwing: s * 0.7 * speed01, armSwing: -s * 0.6 * speed01, bob: Math.abs(s) * 0.07 * speed01, headRoll: 0 };
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
