// world/actors/head.ts — the characters' code-built head (proposal C §3, plan estetica-c M1 item 13 and M3): round head
// of radius 0.42, oval eyes with highlight, cheeks, hairstyle, hat and scarf or neckwear, merged into ONE
// mesh (one call). Used by the skeleton body (hung from the `head` bone) and the fallback capsule body. The
// mouth is separate (it appears only when talking, no mouth drawn at rest). All painted per vertex with the palette.
// Measured segments (plan estetica-c M3): with the head and the skeleton body, the test diorama fits in `medium`.
// Since M5 hairstyles, hats and scarves arrive described in the content (each sheet's `apariencia`, via CharacterLook);
// here they are only assembled. In M6 the head has no reduced version: `low` fits the budget without touching it (measured).
import { SphereGeometry, type BufferGeometry } from "three";
import { capsule, mergeParts, painted, sphere, torus } from "../props/geometry";
import type { CharacterLook } from "./looks";

export const HEAD_RADIUS = 0.42;

function hair(look: CharacterLook, seed: number): BufferGeometry[] {
  const cap = (theta = 0.6, radius = 0.445) =>
    painted(new SphereGeometry(radius, 14, 6, 0, Math.PI * 2, 0, Math.PI * theta).rotateX(-0.55).translate(0, 0.02, -0.02), look.hair, seed, { top: 0.1 });
  switch (look.hairStyle) {
    case "corto":
      return [painted(new SphereGeometry(0.432, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.42).rotateX(-0.35).translate(0, 0.02, -0.02), look.hair, seed, { top: 0.1 })];
    case "rodete":
      return [cap(), painted(sphere(0.21, 10, 6).translate(0, 0.36, -0.22), look.hair, seed)];
    case "coleta":
      return [
        cap(),
        painted(sphere(0.13, 8, 5).translate(0, 0.12, -0.44), look.hair, seed),
        painted(capsule(0.1, 0.5, 6).rotateX(0.35).translate(0, -0.38, -0.5), look.hair, seed),
      ];
    case "largo":
      return [cap(0.62), painted(sphere(0.4, 12, 6).scale(1.02, 1.15, 0.55).translate(0, -0.16, -0.2), look.hair, seed, { top: 0.1 })];
    default:
      return [cap()];
  }
}

function hat(look: CharacterLook, seed: number): BufferGeometry[] {
  switch (look.hat) {
    case "gorra":
      return [
        painted(new SphereGeometry(0.45, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, 0.06, 0), "gorra", seed),
        painted(sphere(0.3, 10, 4).scale(1, 0.12, 1.1).translate(0, 0.2, 0.36), "gorra", seed),
      ];
    case "paja":
      return [
        painted(sphere(0.74, 14, 4).scale(1, 0.06, 1).translate(0, 0.28, 0), "paja", seed, { jitter: 0.12 }),
        painted(new SphereGeometry(0.4, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.9, 1).translate(0, 0.3, 0), "paja", seed, { jitter: 0.12 }),
        painted(torus(0.4, 0.05, 4, 16).rotateX(Math.PI / 2).translate(0, 0.33, 0), "techo", seed),
      ];
    case "boina":
      return [
        painted(sphere(0.47, 14, 6).scale(1, 0.32, 1).rotateZ(-0.12).translate(0.03, 0.34, -0.03), "pantalon", seed),
        painted(sphere(0.06, 6, 4).translate(0.02, 0.5, -0.02), "pantalon", seed),
      ];
    default:
      return [];
  }
}

function scarf(look: CharacterLook, seed: number): BufferGeometry[] {
  switch (look.scarf) {
    case "panuelo":
      return [
        painted(new SphereGeometry(0.455, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(-0.35).translate(0, 0.02, -0.02), "casa-1", seed),
        painted(sphere(0.11, 6, 4).translate(0, 0.02, -0.45), "casa-1", seed),
      ];
    case "bufanda":
      return [
        painted(torus(0.3, 0.1, 5, 12).rotateX(Math.PI / 2).translate(0, -0.4, 0.02), "techo", seed),
        painted(capsule(0.07, 0.36, 6).rotateX(0.2).translate(0.16, -0.78, 0.26), "techo", seed),
      ];
    default:
      return [];
  }
}

/** Head geometry: head, hairstyle, eyes with highlight, cheeks, hat and scarf, in one mesh centered at 0. */
export function characterHeadGeometry(look: CharacterLook, seed = 0): BufferGeometry {
  const parts: BufferGeometry[] = [
    painted(sphere(HEAD_RADIUS, 14, 9), look.skin, seed, { top: 0.1, bottomDark: 0.08 }),
    // The head scarf replaces the hair cap (the first thing in each hairstyle); the rest (bun, long hair) stays.
    ...hair(look, seed).slice(look.scarf === "panuelo" ? 1 : 0),
  ];
  for (const x of [-0.14, 0.14]) {
    parts.push(painted(sphere(0.068, 7, 5).scale(1, 1.3, 0.6).translate(x, -0.02, 0.385), "tinta", seed, { jitter: 0, bottomDark: 0 }));
    parts.push(painted(sphere(0.022, 4, 3).translate(x + 0.02, 0.02, 0.43), "blanco", seed, { jitter: 0, bottomDark: 0 }));
    parts.push(painted(sphere(0.06, 6, 3).scale(1, 0.6, 0.3).translate(x * 1.7, -0.12, 0.37), "mejilla", seed, { jitter: 0, bottomDark: 0 }));
  }
  parts.push(...hat(look, seed), ...scarf(look, seed));
  return mergeParts(parts);
}

/** The mouth that appears when talking (proposal C §3): a dark oval under the eyes. It opens and closes by scaling y. */
export function mouthGeometry(): BufferGeometry {
  return mergeParts([painted(sphere(0.07, 10, 6).scale(1, 0.55, 0.35).translate(0, -0.2, 0.392), "tinta", 0, { jitter: 0, bottomDark: 0 })]);
}
