// Reglas de cámara que no dependen del render (R11, D-053, D-154, D-197): ids de presets, ángulos, pasos de
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

/** Ángulos de los presets implementados. `dialogueFrame` encuadra con la misma vista que `topdownOrtho`. */
export function presetAngles(preset: CameraPresetId): CameraAngles {
  if (preset === "isoOrtho") return { pitchDeg: ISO_PITCH_DEG, yawDeg: 45 };
  return { pitchDeg: TOPDOWN_PITCH_DEG, yawDeg: 0 };
}

/** 3 pasos de zoom (D-053, D-197): 0 = más lejos, 2 = más cerca; 1 = ~15 tiles de ancho. */
export const ZOOM_STEPS = 3;
export type ZoomStep = 0 | 1 | 2;
export const DEFAULT_ZOOM_STEP: ZoomStep = 1;

/** Un paso más cerca (+1) o más lejos (-1), sin salir de los 3 pasos. */
export function stepZoom(current: ZoomStep, direction: 1 | -1): ZoomStep {
  return Math.min(ZOOM_STEPS - 1, Math.max(0, current + direction)) as ZoomStep;
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
