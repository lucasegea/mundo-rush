// world/camera/zoom.ts — el zoom continuo de `thirdPerson` (open-world-3d T5, PD-5), puro: el lente según el aspecto,
// la distancia del mapa entero (`fitDistance`, que depende del yaw y del aspecto) y la pose que sale de t en [0, 1]: la
// distancia log-lineal de 2,5 m (t = 0) a `fitDistance` (t = 1), la inclinación efectiva que sube a 82°, el pivote que
// va del jugador al centro del mapa, la niebla y el plano lejano que crecen, las etiquetas que se apagan y las balizas
// que aparecen. Los números son los del mockup V6 (`main.js` updateCamera, `world.js` applyView).

/** Lente y medidas de la tercera persona (plan v3 T5; mockup V6 `fixture.js` ZOOM_MIN, ZOOM_DEFAULT). */
export const THIRD_PERSON_VIEW = {
  /** FOV vertical apaisado y vertical (aspecto < 1). */
  fovDeg: 50,
  portraitFovDeg: 74,
  /** Altura del pivote sobre el suelo (m): el pecho del personaje. */
  targetHeight: 1.4,
  /** Distancia más cercana (t = 0) y la de entrada (m); las mismas que THIRD_PERSON del núcleo (un test lo compara). */
  minDistance: 2.5,
  defaultDistance: 6,
  /** Inclinación efectiva en t = 1. */
  overviewPitchDeg: 82,
  /** En t = 1, la esquina más lejana del mapa cae a esta fracción del borde de la pantalla (NDC). */
  fitNdc: 0.94,
  /** La distancia del mapa entero nunca es menor que esto (mapas chicos). */
  minFitDistance: 20,
  /** Hasta qué distancia del pivote mira hacia adelante (la mirada baja hacia el horizonte). */
  lookAhead: 30,
} as const;

const RAD = Math.PI / 180;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** FOV vertical (grados) de la tercera persona según el aspecto del canvas. */
export function thirdPersonFov(aspect: number): number {
  return aspect < 1 ? THIRD_PERSON_VIEW.portraitFovDeg : THIRD_PERSON_VIEW.fovDeg;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

type Vec3 = [number, number, number];

/** Offset del pivote a la cámara (yaw 0 = cámara del lado +z, mirando hacia -z), como `cameraOffset` de rig.ts. */
function offset(pitchDeg: number, yawDeg: number, distance: number): Vec3 {
  const p = pitchDeg * RAD;
  const y = yawDeg * RAD;
  const flat = Math.cos(p) * distance;
  return [Math.sin(y) * flat, Math.sin(p) * distance, Math.cos(y) * flat];
}

/** Proyección de un punto a NDC para una cámara en `eye` que mira a `at` (sin roll, arriba = +y). null si queda detrás. */
export function projectNdc(eye: Vec3, at: Vec3, fovDeg: number, aspect: number, p: Vec3): [number, number] | null {
  const f: Vec3 = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  f[0] /= fl; f[1] /= fl; f[2] /= fl;
  // right = f × up, up' = right × f
  const r: Vec3 = [-f[2], 0, f[0]];
  const rl = Math.hypot(r[0], r[2]) || 1;
  r[0] /= rl; r[2] /= rl;
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const v: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
  const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  if (z <= 1e-6) return null;
  const th = Math.tan((fovDeg * RAD) / 2);
  const x = v[0] * r[0] + v[1] * r[1] + v[2] * r[2];
  const y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  return [x / (z * th * aspect), y / (z * th)];
}

/** Centro del mapa a la altura del pivote: hacia donde va el pivote en el mapa entero. */
export function boundsCenter(b: Bounds, groundY = 0): Vec3 {
  return [(b.minX + b.maxX) / 2, groundY + THIRD_PERSON_VIEW.targetHeight, (b.minZ + b.maxZ) / 2];
}

/**
 * La distancia del mapa entero para un yaw y un aspecto (PD-5, AC26): la menor a la que, con la pose de t = 1
 * (inclinación 82°, pivote en el centro, mirando al pivote), las cuatro esquinas de `bounds` (a la altura `groundY`)
 * caen dentro de `fitNdc` de la pantalla. Búsqueda binaria sobre la proyección real (el tamaño aparente baja con la
 * distancia).
 */
export function fitDistance(yawDeg: number, aspect: number, bounds: Bounds, groundY = 0): number {
  const fov = thirdPersonFov(aspect);
  const at = boundsCenter(bounds, groundY);
  const corners: Vec3[] = [
    [bounds.minX, groundY, bounds.minZ], [bounds.maxX, groundY, bounds.minZ], [bounds.maxX, groundY, bounds.maxZ], [bounds.minX, groundY, bounds.maxZ],
  ];
  const fits = (d: number): boolean => {
    const o = offset(THIRD_PERSON_VIEW.overviewPitchDeg, yawDeg, d);
    const eye: Vec3 = [at[0] + o[0], at[1] + o[1], at[2] + o[2]];
    return corners.every((c) => {
      const p = projectNdc(eye, at, fov, aspect, c);
      return p !== null && Math.abs(p[0]) <= THIRD_PERSON_VIEW.fitNdc && Math.abs(p[1]) <= THIRD_PERSON_VIEW.fitNdc;
    });
  };
  let lo = 1;
  let hi = 8000;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return Math.max(THIRD_PERSON_VIEW.minFitDistance, hi);
}

/** Distancia (m) en un t: log-lineal de 2,5 m a `fit`. Igual a `zoomDistanceAt` del núcleo. */
export function zoomDistanceAt(t: number, fit: number): number {
  const min = THIRD_PERSON_VIEW.minDistance;
  const f = Math.max(fit, min * 1.01);
  return min * Math.pow(f / min, clamp01(t));
}

/** t para una distancia, inversa de `zoomDistanceAt`. Igual a `zoomTAt` del núcleo. */
export function zoomTAt(distance: number, fit: number): number {
  const min = THIRD_PERSON_VIEW.minDistance;
  const lo = Math.log(min);
  const hi = Math.log(Math.max(fit, min * 1.01));
  return clamp01((Math.log(Math.max(distance, min)) - lo) / (hi - lo));
}

export interface ZoomPose {
  t: number;
  /** Distancia de la cámara al pivote (m). */
  distance: number;
  /** Inclinación efectiva (grados): la del jugador en t = 0, 82 en t = 1. */
  pitchDeg: number;
  /** Cuánto mira hacia abajo (grados): de cerca hacia el horizonte (55 % de la inclinación), de lejos al pivote. */
  lookPitchDeg: number;
  /** 0 = el pivote es el jugador, 1 = el centro del mapa. */
  pivotBlend: number;
  /** Niebla (m), con la escala del tier en el extremo cercano (`fogScale` de DENSITY). */
  fogNear: number;
  fogFar: number;
  /** Planos de recorte de la cámara (m). */
  near: number;
  far: number;
  /** Opacidad de las etiquetas de nombre y de las balizas del mapa entero. */
  labelAlpha: number;
  beaconAlpha: number;
}

/**
 * La pose de un t de zoom (PD-5, AC26). `fit` es `fitDistance` del yaw y el aspecto vigentes; `userPitchDeg` la
 * inclinación del jugador; `fogScale` la del tier (1 en medium y high).
 */
export function zoomPose(t: number, fit: number, userPitchDeg: number, fogScale = 1): ZoomPose {
  const tt = clamp01(t);
  const distance = zoomDistanceAt(tt, fit);
  const pitchDeg = lerp(userPitchDeg, THIRD_PERSON_VIEW.overviewPitchDeg, smoothstep(0.3, 1, tt));
  const lookPitchDeg = lerp(pitchDeg * 0.55, pitchDeg, smoothstep(0.3, 0.8, tt));
  const sT = smoothstep(0.3, 0.95, tt);
  return {
    t: tt,
    distance,
    pitchDeg,
    lookPitchDeg,
    pivotBlend: smoothstep(0.55, 1, tt),
    fogNear: lerp(45 * fogScale, 520, sT),
    fogFar: lerp(250 * fogScale, 1500, sT),
    near: Math.min(4, Math.max(0.1, distance * 0.03)),
    far: Math.round(lerp(700, 2200, sT)),
    labelAlpha: 1 - smoothstep(0.3, 0.55, tt),
    beaconAlpha: smoothstep(0.4, 0.7, tt),
  };
}

/**
 * Suavizado exponencial independiente del framerate hacia un objetivo (1/s). Con "reducir movimiento" (`cut`) llega en
 * el mismo cuadro (AC26: un `zoomOut` llega a su objetivo en ese cuadro).
 */
export function approach(current: number, target: number, dtSec: number, rate: number, cut: boolean): number {
  if (cut) return target;
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dtSec)));
}
