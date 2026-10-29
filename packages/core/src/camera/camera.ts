// Reglas de cámara que no dependen del render (R11, D-053, D-197, D-207, D-208): ids de presets, ángulos, pasos de
// zoom y la dirección "arriba en pantalla" en el mundo. La cámara misma vive en apps/web/src/world/camera/.

/**
 * Presets de R11. Plan estetica-c M7 (D-207, revisión de arquitectura 2026-10-12): los dos ortográficos de HD-2D (cenital e
 * isométrico) salieron; `xrTabletop` queda declarado para el futuro (E-XR) y no se implementa todavía.
 * Open-world-3d T5 (PD-5, D-820): `thirdPerson` es la cámara del mapa (detrás del personaje, zoom continuo hasta el
 * mapa entero); `perspective3D` queda registrado y un ajuste guardado con él abre `thirdPerson` en t = 1.
 */
export const CAMERA_PRESET_IDS = ["thirdPerson", "dialogueFrame", "perspective3D", "xrTabletop"] as const;
export type CameraPresetId = (typeof CAMERA_PRESET_IDS)[number];

export interface CameraAngles {
  pitchDeg: number;
  yawDeg: number;
}

/** `perspective3D` (D-207, propuesta C §4): lente largo inclinado 50° y girado 45°. */
export const PERSPECTIVE_PITCH_DEG = 50;
export const PERSPECTIVE_YAW_DEG = 45;
/** Plano de a dos de la charla (propuesta C §4): la cámara baja a 20°; el giro lo decide el encuadre. */
export const DIALOGUE_PITCH_DEG = 20;

/**
 * Ángulos de los presets. `dialogueFrame` da su inclinación con el giro del mapa (el giro real lo calcula el
 * encuadre de a dos en world/camera/rig.ts). `xrTabletop` está solo declarado: hasta que exista (E-XR) da los del
 * lente largo. M7 SEAM: xrTabletop define sus propios ángulos cuando se implemente.
 */
export function presetAngles(preset: CameraPresetId): CameraAngles {
  if (preset === "dialogueFrame") return { pitchDeg: DIALOGUE_PITCH_DEG, yawDeg: PERSPECTIVE_YAW_DEG };
  return { pitchDeg: PERSPECTIVE_PITCH_DEG, yawDeg: PERSPECTIVE_YAW_DEG };
}

/**
 * Escalera de zoom de `perspective3D` (D-208, que extiende los 3 pasos de D-053/D-197): distancia de la cámara al
 * jugador en metros, del paso más lejano (0) al más cercano. La cantidad de pasos sale de este arreglo. Cada paso es
 * ~1,3x el siguiente, así cada muesca de la rueda se siente parecida; 30 m sigue siendo el paso de inicio.
 */
export const ZOOM_DISTANCES = [160, 120, 90, 65, 48, 38, 30, 22] as const;
export const ZOOM_STEPS = ZOOM_DISTANCES.length;
/** Índice en ZOOM_DISTANCES: 0 = más lejos, ZOOM_STEPS - 1 = más cerca. */
export type ZoomStep = number;
export const DEFAULT_ZOOM_STEP: ZoomStep = ZOOM_DISTANCES.indexOf(30);

/** Un paso válido: entero dentro de la escalera (lo que no es número cae al de inicio). */
export function clampZoomStep(step: number): ZoomStep {
  if (!Number.isFinite(step)) return DEFAULT_ZOOM_STEP;
  return Math.min(ZOOM_STEPS - 1, Math.max(0, Math.round(step)));
}

/** Un paso más cerca (+1) o más lejos (-1), acotado a los dos extremos de la escalera. */
export function stepZoom(current: ZoomStep, direction: 1 | -1): ZoomStep {
  return clampZoomStep(clampZoomStep(current) + direction);
}

/** Distancia (m) de la cámara al jugador en un paso de zoom. */
export function zoomDistance(step: ZoomStep): number {
  return ZOOM_DISTANCES[clampZoomStep(step)] as number;
}

/**
 * Dirección de pantalla (x = derecha, y = arriba) llevada al plano XZ del mundo según el yaw de la cámara.
 * Con yaw 0 la cámara mira hacia -z: arriba en pantalla es -z y derecha es +x.
 */
export function screenDirToWorld(dir: { x: number; y: number }, yawDeg: number): { x: number; z: number } {
  const y = (yawDeg * Math.PI) / 180;
  const c = Math.cos(y);
  const s = Math.sin(y);
  const x = dir.x * c - dir.y * s;
  const z = -dir.x * s - dir.y * c;
  return { x: Math.abs(x) < 1e-12 ? 0 : x, z: Math.abs(z) < 1e-12 ? 0 : z };
}

// ---------- thirdPerson (open-world-3d T4/T5, D-820, PD-5) ----------

/**
 * Números de la cámara en tercera persona (mockup V6, `main.js`): inclinación del jugador 6 a 55° (17 al entrar), zoom
 * continuo en distancia logarítmica de 2,5 m al mapa entero (6 m al entrar), mirada por arrastre (grados por píxel) o con
 * Q y R (grados por segundo), recentrado a lo sumo a 90°/s tras 1,5 s sin mirar.
 */
export const THIRD_PERSON = {
  defaultPitchDeg: 17,
  minPitchDeg: 6,
  maxPitchDeg: 55,
  /** Distancia más cercana (t = 0) y la de entrada, en metros. */
  minDistance: 2.5,
  defaultDistance: 6,
  /** Inclinación efectiva con el mapa entero (t = 1). */
  overviewPitchDeg: 82,
  /** Arrastre: grados de giro y de inclinación por píxel (derecha gira a la derecha, abajo levanta la cámara). */
  yawDegPerPx: 0.25,
  pitchDegPerPx: 0.18,
  /** Q y R mantenidas. */
  keyLookDegPerS: 95,
  /** Fracción del rango logarítmico de zoom por tecla, botón o muesca de rueda. */
  zoomStep: 0.07,
  /** Con t por debajo de esto, V va al mapa entero; si no, vuelve a la distancia anterior. */
  overviewToggleT: 0.9,
  /** Recentrado: segundos sin mirar, grados por segundo y t máximo en el que actúa. */
  recenterIdleS: 1.5,
  recenterDegPerS: 90,
  recenterMaxT: 0.4,
} as const;

/** Yaw en [0, 360). */
export function normalizeYaw(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const y = deg % 360;
  return y < 0 ? y + 360 : y === 360 ? 0 : y;
}

/** Inclinación del jugador acotada a [6, 55]. */
export function clampPitch(deg: number): number {
  if (!Number.isFinite(deg)) return THIRD_PERSON.defaultPitchDeg;
  return Math.min(THIRD_PERSON.maxPitchDeg, Math.max(THIRD_PERSON.minPitchDeg, deg));
}

/** Arrastre o Q/R en píxeles → yaw e inclinación nuevos (yaw normalizado, inclinación acotada). */
export function applyLook(yawDeg: number, pitchDeg: number, dx: number, dy: number): { yawDeg: number; pitchDeg: number } {
  return {
    yawDeg: normalizeYaw(yawDeg - (Number.isFinite(dx) ? dx : 0) * THIRD_PERSON.yawDegPerPx),
    pitchDeg: clampPitch(pitchDeg + (Number.isFinite(dy) ? dy : 0) * THIRD_PERSON.pitchDegPerPx),
  };
}

/** Píxeles de mirada por paso de simulación con Q o R mantenida (95°/s a 30 Hz). */
export const KEY_LOOK_PX_PER_STEP = THIRD_PERSON.keyLookDegPerS / THIRD_PERSON.yawDegPerPx / 30;

/**
 * t de zoom en [0, 1] para una distancia: log-lineal de 2,5 m (t = 0) a `fit` (t = 1, el mapa entero). La misma regla
 * vive en world/camera/zoom.ts (world/ no importa el núcleo en tiempo de ejecución); un test compara las dos.
 */
export function zoomTAt(distance: number, fit: number): number {
  const lo = Math.log(THIRD_PERSON.minDistance);
  const hi = Math.log(Math.max(fit, THIRD_PERSON.minDistance * 1.01));
  return Math.min(1, Math.max(0, (Math.log(Math.max(distance, THIRD_PERSON.minDistance)) - lo) / (hi - lo)));
}

/** Distancia (m) en un t de zoom, inversa de `zoomTAt`. */
export function zoomDistanceAt(t: number, fit: number): number {
  const f = Math.max(fit, THIRD_PERSON.minDistance * 1.01);
  return THIRD_PERSON.minDistance * Math.pow(f / THIRD_PERSON.minDistance, Math.min(1, Math.max(0, t)));
}

/** Un paso de zoom: +1 acerca, -1 aleja, `zoomStep` del rango logarítmico, acotado a [2,5 m, fit]. */
export function stepZoomDistance(distance: number, fit: number, direction: 1 | -1): number {
  const t = zoomTAt(distance, fit) - direction * THIRD_PERSON.zoomStep;
  return zoomDistanceAt(t, fit);
}

/** Diferencia de ángulo más corta (grados), en (-180, 180]. */
export function yawDelta(from: number, to: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Yaw de la cámara que pone `velocity` adelante (arriba en pantalla): inversa de `screenDirToWorld({0, 1}, yaw)`. */
export function headingYaw(vx: number, vz: number): number {
  return normalizeYaw((Math.atan2(-vx, -vz) * 180) / Math.PI);
}

export interface RecenterInput {
  yawDeg: number;
  /** Yaw que pondría la dirección de marcha adelante (`headingYaw`). */
  headingDeg: number;
  /** Segundos desde la última mirada (arrastre, Q o R). */
  sinceLookS: number;
  dt: number;
  /** Camina hacia adelante o hacia un punto elegido (un desplazamiento lateral no recentra). */
  forward: boolean;
  reduceMotion: boolean;
  /** t de zoom: de lejos (t > 0,4) no se recentra. */
  t?: number;
}

/**
 * Recentrado de la cámara detrás del personaje (D-820): solo caminando hacia adelante o hacia un clic, desde 1,5 s
 * después de la última mirada, a lo sumo 90°/s. Con "reducir movimiento" no hay recentrado (la cámara no se mueve sola).
 */
export function recenterYaw(r: RecenterInput): number {
  if (r.reduceMotion || !r.forward || r.sinceLookS < THIRD_PERSON.recenterIdleS || (r.t ?? 0) > THIRD_PERSON.recenterMaxT) return r.yawDeg;
  const max = THIRD_PERSON.recenterDegPerS * Math.max(0, r.dt);
  const d = yawDelta(r.yawDeg, r.headingDeg);
  return normalizeYaw(r.yawDeg + Math.min(max, Math.max(-max, d)));
}
