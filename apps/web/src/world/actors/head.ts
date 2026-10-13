// world/actors/head.ts — la cabeza de los personajes por código (propuesta C §3, plan estetica-c M1 ítem 13 y M3): cabeza
// redonda de radio 0,42, ojos ovalados con brillo, mejillas, peinado, sombrero y pañuelo o bufanda, fusionados en UNA
// malla (una llamada). La usan el cuerpo con esqueleto (colgada del hueso `head`) y el cuerpo de cápsulas de reserva. La
// boca va aparte (aparece solo al hablar, sin boca dibujada en reposo). Todo pintado por vértice con la paleta.
// Segmentos medidos (plan estetica-c M3): con la cabeza y el cuerpo con esqueleto, el diorama de prueba entra en `medium`.
// Desde M5 peinados, sombreros y pañuelos llegan descritos en el contenido (`apariencia` de cada ficha, vía CharacterLook);
// acá solo se arman. En M6 la cabeza no tiene versión reducida: `low` entra en presupuesto sin tocarla (medido).
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

/** Geometría de la cabeza: cabeza, peinado, ojos con brillo, mejillas, sombrero y pañuelo, en una malla centrada en 0. */
export function characterHeadGeometry(look: CharacterLook, seed = 0): BufferGeometry {
  const parts: BufferGeometry[] = [
    painted(sphere(HEAD_RADIUS, 14, 9), look.skin, seed, { top: 0.1, bottomDark: 0.08 }),
    // El pañuelo de cabeza reemplaza al casquete de pelo (lo primero de cada peinado); lo demás (rodete, pelo largo) queda.
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

/** La boca que aparece al hablar (propuesta C §3): un óvalo oscuro bajo los ojos. Se abre y cierra escalando y. */
export function mouthGeometry(): BufferGeometry {
  return mergeParts([painted(sphere(0.07, 10, 6).scale(1, 0.55, 0.35).translate(0, -0.2, 0.392), "tinta", 0, { jitter: 0, bottomDark: 0 })]);
}
