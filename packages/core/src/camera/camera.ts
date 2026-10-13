// Reglas de cámara que no dependen del render (R11, D-053, D-154, D-197, D-208): ids de presets, ángulos, pasos de
// zoom y la dirección "arriba en pantalla" en el mundo. La cámara misma vive en apps/web/src/world/camera/.

/** Presets de R11. Los dos últimos están declarados para el futuro y no se implementan todavía. */
export const CAMERA_PRESET_IDS = ["topdownOrtho", "isoOrtho", "dialogueFrame", "perspective3D", "xrTabletop"] as const;
export type CameraPresetId = (typeof CAMERA_PRESET_IDS)[number];

/** Pitch de `topdownOrtho` (D-154: 55-60°; F0.2 propuso 57° y el operador cerró el spike sin cambiarlo). */
export const TOPDOWN_PITCH_DEG = 57;
/** Elevación isométrica real, atan(1/√2). */
export const ISO_PITCH_DEG = 35.264;

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
 * encuadre de a dos en world/camera/rig.ts). Los ortográficos quedan hasta M7 (el rig ya no los usa).
 */
export function presetAngles(preset: CameraPresetId): CameraAngles {
  if (preset === "perspective3D") return { pitchDeg: PERSPECTIVE_PITCH_DEG, yawDeg: PERSPECTIVE_YAW_DEG };
  if (preset === "dialogueFrame") return { pitchDeg: DIALOGUE_PITCH_DEG, yawDeg: PERSPECTIVE_YAW_DEG };
  if (preset === "isoOrtho") return { pitchDeg: ISO_PITCH_DEG, yawDeg: 45 };
  return { pitchDeg: TOPDOWN_PITCH_DEG, yawDeg: 0 };
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
