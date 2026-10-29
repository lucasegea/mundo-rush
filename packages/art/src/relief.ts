// @lg/art relief.ts: el relieve interior del mundo abierto (open-world-3d T6, D-819), puro y sin three. Una sola función
// `reliefAt(x, z, seed, pads)` que leen world/terrain (la malla) y el estimador: ruido de baja frecuencia entre
// RELIEF.min y RELIEF.max metros, con un llano alrededor de cada "pad" (la aparición del jugador y cada NPC): plano en
// los primeros `padFlat` m y una mezcla suave en los `padBlend` siguientes. Los caminos aplanan su sección (el centro
// sigue al relieve y el ancho toma la altura del centro): eso lo hace buildTerrain, que tiene las curvas muestreadas.
// Determinístico: la misma semilla da el mismo relieve. La grilla de caminata del núcleo sigue plana y 2D (S-OW-3).
import { noise2 } from "./paint.ts";

export const RELIEF = {
  /** Alturas del relieve (m): AC36 pide el rango 2 a 8 m dentro de los límites caminables. */
  min: 2,
  max: 8,
  /** Llano alrededor de cada pad (m) y la mezcla que sigue (D-819: 8 m planos y 8 m de mezcla). */
  padFlat: 8,
  padBlend: 8,
} as const;

export interface ReliefPad {
  x: number;
  z: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * El relieve crudo (sin pads), entre RELIEF.min y RELIEF.max: lomas anchas de 46 m, una cresta suave de 34 m, ondas de
 * 17 m y un temblor de 6,5 m (las escalas del mockup V6 `reliefRaw` con otros pesos, sin su rampa de borde: afuera
 * de los límites las lomas las pone buildTerrain).
 */
export function reliefRaw(x: number, z: number, seed: number): number {
  const broad = noise2(x / 46 + 3.1, z / 46 + 7.7, seed);
  const ridge = (1 - Math.abs(2 * noise2(x / 34 + 40, z / 34 + 13, seed + 5) - 1)) ** 3;
  const waves = noise2(x / 17, z / 17, seed + 1);
  const tremor = noise2(x / 6.5, z / 6.5, seed + 2);
  const c = (0.6 * broad + 0.25 * ridge + 0.1 * waves + 0.02 * tremor) / 0.97;
  // El ruido de valor se junta en el medio: se estira alrededor de 0,5 para usar casi todo el rango sin aplanar los
  // extremos (con 1,25 la pendiente puntual queda bajo 24° en las semillas probadas; AC36 la mide en la malla).
  const k = clamp01((c - 0.5) * 1.25 + 0.5);
  return RELIEF.min + (RELIEF.max - RELIEF.min) * k;
}

/**
 * El relieve con sus pads (AC33): dentro de `padFlat` m de un pad vale exactamente la altura cruda en su centro; entre
 * `padFlat` y `padFlat + padBlend` se mezcla con smoothstep. Si dos pads se tocan manda el más cercano.
 */
export function reliefAt(x: number, z: number, seed: number, pads: readonly ReliefPad[] = []): number {
  let h = reliefRaw(x, z, seed);
  let nearest = Infinity;
  let padH = 0;
  for (const p of pads) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < nearest) {
      nearest = d;
      padH = reliefRaw(p.x, p.z, seed);
    }
  }
  if (nearest < RELIEF.padFlat + RELIEF.padBlend) h = padH + (h - padH) * smooth(RELIEF.padFlat, RELIEF.padFlat + RELIEF.padBlend, nearest);
  return h;
}
