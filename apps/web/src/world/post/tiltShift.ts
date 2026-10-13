// world/post/tiltShift.ts — el tilt-shift del tier alto según la distancia de la cámara (D-208), puro. La línea de foco
// es horizontal y pasa por el centro de la pantalla, que es donde la cámara pone al jugador (y en la charla, el punto
// entre los dos): el desenfoque crece arriba y abajo, como pide la propuesta C §5. Hasta la distancia de referencia
// (30 m) valen los números de M1; más lejos el desenfoque baja y la franja nítida se abre, para que alejarse muestre
// el mapa en vez de taparlo.

export interface TiltShiftParams {
  blur: number;
  taper: number;
  /** Extremos de la línea de foco en coordenadas de pantalla (0 a 1). */
  start: [number, number];
  end: [number, number];
}

export const TILT_SHIFT_BASE = { blur: 0.25, taper: 0.6 } as const;

/** `scale` es `viewScale(distance)` de world/camera/rig.ts (1 hasta 30 m, lineal después). */
export function tiltShiftFor(scale: number): TiltShiftParams {
  const k = Math.max(1, scale);
  return {
    blur: TILT_SHIFT_BASE.blur * Math.max(0.6, 1 / Math.sqrt(k)),
    taper: TILT_SHIFT_BASE.taper * Math.min(1.5, Math.sqrt(k)),
    start: [0, 0.5],
    end: [1, 0.5],
  };
}
