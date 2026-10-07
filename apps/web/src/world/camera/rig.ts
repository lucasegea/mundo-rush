// Matemática pura de CameraRig (R11, D-053, D-154, D-197): offset por pitch/yaw, frustum ortográfico, ancho
// de vista con escala entera de píxel por paso de zoom, snap a la grilla de píxel, suavizado y "corte" para
// "reducir movimiento". Portado del spike F0.2 (medido) y extendido con el zoom de D-197.
import { TILE_PX } from "../tiles/buildTileChunk";

/** ~15 tiles de ancho en el paso medio (D-053, D-154). */
export const TARGET_TILES_WIDE = 15;
export const CAMERA_DISTANCE = 40;

type Vec3 = [number, number, number];

/** Offset del objetivo a la cámara: elevada por pitch, rotada en Y por yaw (yaw 0 = cámara del lado +z). */
export function cameraOffset(pitchDeg: number, yawDeg: number, distance = CAMERA_DISTANCE): Vec3 {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  const flat = Math.cos(p) * distance;
  return [Math.sin(y) * flat, Math.sin(p) * distance, Math.cos(y) * flat];
}

export function orthoFrustum(widthM: number, aspect: number) {
  const halfW = widthM / 2;
  const halfH = halfW / Math.max(aspect, 1e-6);
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}

/**
 * Píxeles de pantalla por texel en cada paso de zoom (D-197): siempre un entero. El paso medio es el entero más
 * cercano a ~15 tiles de ancho; los otros dos, uno menos (más lejos) y uno más (más cerca). Con pantallas chicas
 * el medio es al menos 2, así el paso lejano nunca baja de 1.
 */
export function zoomPixelScales(canvasPx: number, targetTiles = TARGET_TILES_WIDE): [number, number, number] {
  const mid = Math.max(2, Math.round(canvasPx / (targetTiles * TILE_PX)));
  return [mid - 1, mid, mid + 1];
}

/** Ancho de vista (m) para un paso de zoom: canvasPx / (escala entera × 32 px por tile). */
export function zoomViewWidth(canvasPx: number, step: number): number {
  const scales = zoomPixelScales(canvasPx);
  const scale = scales[Math.min(2, Math.max(0, Math.round(step)))] as number;
  return canvasPx / (scale * TILE_PX);
}

/**
 * Snap de la posición de la cámara a la grilla de píxel de pantalla: sus componentes sobre los ejes derecha y
 * arriba de la cámara pasan a múltiplos del tamaño de un píxel. Los texels quietos caen en los mismos píxeles
 * cuadro a cuadro (sin temblor). right/up tienen que ser unitarios.
 */
export function snapToPixelGrid(pos: Vec3, right: Vec3, up: Vec3, worldPerPx: number): Vec3 {
  if (!(worldPerPx > 0)) return pos;
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const r = dot(pos, right) / worldPerPx;
  const u = dot(pos, up) / worldPerPx;
  const dr = (Math.round(r) - r) * worldPerPx;
  const du = (Math.round(u) - u) * worldPerPx;
  return [pos[0] + dr * right[0] + du * up[0], pos[1] + dr * right[1] + du * up[1], pos[2] + dr * right[2] + du * up[2]];
}

/** Factor de suavizado exponencial independiente del framerate. */
export function followAlpha(dtSec: number, rate = 6): number {
  return 1 - Math.exp(-rate * Math.max(0, dtSec));
}

/**
 * "Reducir movimiento" (D-053, F2 A7): la cámara no sigue al jugador de forma continua. Se queda quieta y, cuando
 * el jugador sale del centro de la vista (más de `margin` de la media vista en algún eje), corta de golpe a él.
 */
export function cutFollow(
  current: { x: number; z: number },
  target: { x: number; z: number },
  halfWidth: number,
  halfDepth: number,
  margin = 0.6,
): { x: number; z: number } {
  const out = Math.abs(target.x - current.x) > halfWidth * margin || Math.abs(target.z - current.z) > halfDepth * margin;
  return out ? { x: target.x, z: target.z } : current;
}
