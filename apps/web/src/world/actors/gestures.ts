// world/actors/gestures.ts — los gestos procedurales del set mínimo de la propuesta C §3 que KayKit Rig_Medium no trae
// como clip (plan estetica-c M3): hablar, escuchar, saludar, asentir, negar, pensar, sorprenderse y cargar. Puro (sin
// three): cada gesto da, para un instante, a dónde apuntan algunos huesos del brazo (dirección en el espacio del
// personaje, que mira a +z, con la izquierda del personaje en +x) y cuánto giran otros en su propio marco (la cabeza
// de KayKit tiene el marco del personaje en reposo: x asiente, y niega, z inclina). skinned.ts lo aplica encima del
// clip de base con el peso de la envolvente. Los nombres de hueso son los del glTF (`upperarm.r`).
// M3 SEAM: si el retargeting de Quaternius UAL 2 a Rig_Medium se valida (manifiesto de clips), un gesto puede pasar a
// ser un clip de archivo cambiando su fila en clips.ts; la máquina de animación no cambia.

export type Vec3 = readonly [number, number, number];

export const PROCEDURAL_GESTURES = ["hablar", "escuchar", "saludar", "asentir", "negar", "pensar", "sorprenderse", "cargar"] as const;
export type ProceduralGesture = (typeof PROCEDURAL_GESTURES)[number];

export interface GestureSpec {
  /** Segundos que dura; null = sigue mientras se lo pida (hablar, escuchar, pensar, cargar). */
  durationSec: number | null;
  /** Huesos que mueve (los valida el manifiesto contra el esqueleto). */
  bones: readonly string[];
}

export interface GesturePose {
  /** Peso de la envolvente, de 0 a 1 (entra en 0,25 s y, si dura, sale en los últimos 0,3 s). */
  weight: number;
  /** Hueso → dirección a la que apunta (del hueso a su hijo), en el espacio del personaje. */
  aim: Readonly<Record<string, Vec3>>;
  /** Hueso → giro sumado en su propio marco (radianes en x, y, z). */
  turn: Readonly<Record<string, Vec3>>;
}

const FADE_IN = 0.25;
const FADE_OUT = 0.3;
const TAU = Math.PI * 2;

/** Espejo izquierda-derecha de una dirección. */
const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];

export const GESTURES: Readonly<Record<ProceduralGesture, GestureSpec>> = {
  hablar: { durationSec: null, bones: ["head", "upperarm.r", "lowerarm.r"] },
  escuchar: { durationSec: null, bones: ["head"] },
  saludar: { durationSec: 1.8, bones: ["upperarm.r", "lowerarm.r"] },
  asentir: { durationSec: 1.2, bones: ["head"] },
  negar: { durationSec: 1.2, bones: ["head"] },
  pensar: { durationSec: null, bones: ["head", "upperarm.r", "lowerarm.r"] },
  sorprenderse: { durationSec: 1.1, bones: ["head", "chest", "upperarm.l", "lowerarm.l", "upperarm.r", "lowerarm.r"] },
  cargar: { durationSec: null, bones: ["upperarm.l", "lowerarm.l", "upperarm.r", "lowerarm.r"] },
};

/** Envolvente de un gesto en el segundo `t` desde que empezó. */
export function gestureWeight(spec: GestureSpec, t: number): number {
  if (t < 0) return 0;
  const fadeIn = Math.min(1, t / FADE_IN);
  if (spec.durationSec === null) return fadeIn;
  if (t >= spec.durationSec) return 0;
  return Math.min(fadeIn, (spec.durationSec - t) / FADE_OUT, 1);
}

/** ¿Terminó? (los que duran mientras se los pide nunca terminan solos). */
export const gestureDone = (id: ProceduralGesture, t: number): boolean => {
  const d = GESTURES[id].durationSec;
  return d !== null && t >= d;
};

/** La pose del gesto `id` a los `t` segundos de empezado. */
export function gesturePose(id: ProceduralGesture, t: number): GesturePose {
  const weight = gestureWeight(GESTURES[id], t);
  const s = (hz: number, phase = 0) => Math.sin(TAU * hz * t + phase);
  switch (id) {
    case "asentir":
      return { weight, aim: {}, turn: { head: [0.16 + 0.16 * s(2.4, -Math.PI / 2), 0, 0] } };
    case "negar":
      return { weight, aim: {}, turn: { head: [0, 0.38 * s(2), 0] } };
    case "escuchar":
      return { weight, aim: {}, turn: { head: [0.05 + 0.03 * s(0.4), 0, 0.11] } };
    case "hablar":
      return {
        weight,
        aim: { "upperarm.r": [-0.45, -0.78, 0.4], "lowerarm.r": [-0.25, 0.05 + 0.3 * s(0.7), 1] },
        turn: { head: [0.05 * s(1.6), 0.07 * s(0.55), 0.04 * s(0.35)] },
      };
    case "saludar":
      return { weight, aim: { "upperarm.r": [-0.62, 0.72, 0.2], "lowerarm.r": [-0.1 + 0.42 * s(2.2), 1, 0.15] }, turn: {} };
    case "pensar":
      return { weight, aim: { "upperarm.r": [-0.22, -0.8, 0.55], "lowerarm.r": [0.38, 0.86, 0.34] }, turn: { head: [-0.12, 0, 0.13] } };
    case "sorprenderse": {
      const upper: Vec3 = [-0.75, -0.15, 0.62];
      const lower: Vec3 = [-0.3, 0.75, 0.6];
      return {
        weight,
        aim: { "upperarm.r": upper, "lowerarm.r": lower, "upperarm.l": mirror(upper), "lowerarm.l": mirror(lower) },
        turn: { head: [-0.22, 0, 0], chest: [-0.12, 0, 0] },
      };
    }
    case "cargar": {
      const upper: Vec3 = [-0.22, -0.5, 0.84];
      const lower: Vec3 = [0.12, 0.05, 1];
      return { weight, aim: { "upperarm.r": upper, "lowerarm.r": lower, "upperarm.l": mirror(upper), "lowerarm.l": mirror(lower) }, turn: {} };
    }
  }
}
