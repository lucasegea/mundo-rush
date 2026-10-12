// world/lighting/params.ts — los valores de luz, niebla y tono de la propuesta C §5 (plan estetica-c M1 ítem 12), como
// dato puro para testearlos sin GPU. Lighting.tsx y GameCanvas los aplican.
import { PALETTE } from "../materials/palette";

export const SUN = { color: PALETTE.sol, intensity: 2.3, elevationDeg: 48, azimuthDeg: -30 } as const;
export const HEMI = { sky: PALETTE["luz-cielo"], ground: PALETTE["luz-suelo"], intensity: 1.15 } as const;
export const FOG = { color: PALETTE.bruma, near: 34, far: 78 } as const;
export const TONE = { exposure: 1.05 } as const;
export const BACKGROUND = PALETTE.bruma;

/** Sombra direccional del tier alto (03 §2.7.1): mapa de 1024 en una caja de 44 × 44 m que sigue al objetivo. */
export const SUN_SHADOW = { mapSize: 1024, half: 22, near: 1, far: 90, bias: -0.0004, normalBias: 0.03, distance: 40 } as const;

/** Dirección unitaria hacia el sol (elevación sobre el horizonte, azimut alrededor de +y desde +z hacia +x). */
export function sunDirection(elevationDeg: number = SUN.elevationDeg, azimuthDeg: number = SUN.azimuthDeg): [number, number, number] {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}
