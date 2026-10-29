// world/lighting/params.ts — la sombra del sol y su geometría (plan estetica-c M1 ítem 12, D-208), como dato puro para
// testearlos sin GPU. Open-world-3d T7b (D-838, D-839): los valores de luz, niebla, fondo y tono de la propuesta C §5
// (SUN, HEMI, FOG, TONE, BACKGROUND) pasaron al look (`WorldLook.light`, `fog`, `background` de @lg/art) y Lighting.tsx y
// GameCanvas los leen del look del diorama; la `fogFor` de distancia de D-208 (sin llamadas desde T5) se fundió en la de
// world/sky. Acá queda lo del núcleo: la caja de sombra por tier y la dirección hacia el sol.

/** Sombra direccional del tier alto (03 §2.7.1): mapa de 1024 en una caja de 44 × 44 m que sigue al objetivo. */
export const SUN_SHADOW = { mapSize: 1024, half: 22, near: 1, far: 90, bias: -0.0004, normalBias: 0.03, distance: 40 } as const;

/**
 * Caja de sombra para una distancia de cámara (D-208): la de 44 × 44 m hasta la referencia y, más lejos, la caja, la
 * distancia del sol al objetivo y los planos escalan juntos, así la sombra cubre lo que se ve y la profundidad alcanza.
 */
export function sunShadowFor(scale: number): { half: number; distance: number; near: number; far: number } {
  const k = Math.max(1, scale);
  return { half: SUN_SHADOW.half * k, distance: SUN_SHADOW.distance * k, near: SUN_SHADOW.near, far: SUN_SHADOW.far * k };
}

/** Dirección unitaria hacia el sol (elevación sobre el horizonte, azimut alrededor de +y desde +z hacia +x), del look. */
export function sunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}
