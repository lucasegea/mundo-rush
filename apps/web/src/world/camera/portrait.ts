// world/camera/portrait.ts — la cámara de los retratos de solo-diálogo (plan estetica-c M3, D-030; R11: las cámaras viven
// en world/camera/). El encuadre es puro: un busto de frente, un poco desde arriba, con la cabeza (y el sombrero) adentro
// y los hombros abajo. La fábrica arma la PerspectiveCamera que usa el estudio de retratos (world/portraits/studio.ts).
import { PerspectiveCamera } from "three";

export interface PortraitFraming {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fovDeg: number;
}

/** Retrato cuadrado: campo de visión vertical y cuánto del busto entra (en radios de cabeza). */
export const PORTRAIT_FOV_DEG = 24;
const BUST_RADII = 3.4;

/**
 * Encuadre de busto para una cabeza de centro `head` (metros del mundo, el personaje mirando a +z) y radio `radius`:
 * la cámara al frente y apenas arriba; mira un poco debajo del centro para que entren los hombros.
 */
export function portraitFraming(head: readonly [number, number, number], radius: number): PortraitFraming {
  const halfFov = (PORTRAIT_FOV_DEG * Math.PI) / 360;
  const distance = (BUST_RADII * radius) / Math.tan(halfFov);
  const target: [number, number, number] = [head[0], head[1] - 0.35 * radius, head[2]];
  return { position: [head[0], target[1] + distance * 0.12, head[2] + distance], target, fovDeg: PORTRAIT_FOV_DEG };
}

export function createPortraitCamera(f: PortraitFraming): PerspectiveCamera {
  const cam = new PerspectiveCamera(f.fovDeg, 1, 0.05, 50);
  cam.position.set(...f.position);
  cam.lookAt(...f.target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}
