// world/camera/bakeCamera.ts — las cámaras del horneado de impostores (open-world-3d T7, AC44; R11: las cámaras viven en
// world/camera/). Port del mockup V6 (`world.js` impostor): cada árbol se dibuja una vez de costado y una desde arriba
// en una textura de 512 × 256 (el costado en la mitad izquierda, la copa en la derecha). El encuadre es puro (testeable
// sin GPU); world/nature/impostor.ts pide las cámaras acá y no construye ninguna.
import { OrthographicCamera } from "three";

/** La caja del árbol horneado (geometría con la base en y = 0 y el tronco en el origen). */
export interface BakeBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
}

/**
 * El encuadre del impostor: `E` medio lado de la vista de costado (cuadrada, centrada a media altura `ymid`), `Et` medio
 * lado de la copa vista desde arriba (centrada en el tronco). Un 4 % de margen, como el mockup.
 */
export function impostorFraming(b: BakeBox): { E: number; ymid: number; Et: number } {
  const E = Math.max(b.maxY / 2, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2) * 1.04;
  const Et = Math.max(-b.minX, b.maxX, -b.minZ, b.maxZ) * 1.04;
  return { E, ymid: b.maxY / 2, Et };
}

/** Las dos cámaras ortográficas del horneado: de costado (desde +z) y desde arriba (con +z hacia abajo en la imagen). */
export function impostorBakeCameras(b: BakeBox): { side: OrthographicCamera; top: OrthographicCamera } {
  const { E, ymid, Et } = impostorFraming(b);
  const side = new OrthographicCamera(-E, E, ymid + E, ymid - E, 0.1, 100);
  side.position.set(0, 0, 40);
  side.lookAt(0, 0, 0);
  const top = new OrthographicCamera(-Et, Et, Et, -Et, 0.1, 200);
  top.up.set(0, 0, -1);
  top.position.set(0, 80, 0);
  top.lookAt(0, 0, 0);
  side.updateMatrixWorld();
  top.updateMatrixWorld();
  return { side, top };
}
