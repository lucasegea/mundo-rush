// world/nature/impostor.ts — el horneado de los impostores (open-world-3d T7, AC44), port del mockup V6 (`world.js:1319`
// impostor): cada especie de pino y latifoliada se dibuja una vez de costado y una desde arriba en una textura de
// 512 × 256 (IMPOSTOR_PX), la segunda vista sin borrar la primera (autoClear apagado). Las cámaras salen de
// world/camera/bakeCamera.ts (R11). El estado del renderer (destino, color de fondo, autoClear) vuelve como estaba.
// Open-world-3d T7b (D-838): las luces del horneado son del look (`WorldLook.light.impostor`).
import {
  Color, DirectionalLight, HemisphereLight, LinearMipmapLinearFilter, Mesh, Scene, WebGLRenderTarget,
  type BufferGeometry, type Material, type WebGLRenderer,
} from "three";
import { IMPOSTOR_PX, type WorldLook } from "@lg/art";
import { impostorBakeCameras, type BakeBox } from "../camera/bakeCamera";

/** El fondo del horneado: negro con alfa 0 (núcleo: no es un color del look, es el vacío de la textura). */
const TRANSPARENT = new Color(0, 0, 0);

/** La caja de horneado de una geometría de árbol (base en y = 0, tronco en el origen). */
export function bakeBox(geo: BufferGeometry): BakeBox {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  if (!b) throw new Error("impostor: geometría sin caja");
  return { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, maxY: b.max.y };
}

/** Hornea una especie en su textura (costado a la izquierda, copa a la derecha). El que llama libera el destino. */
export function bakeImpostor(renderer: WebGLRenderer, geo: BufferGeometry, material: Material, light: WorldLook["light"]["impostor"]): WebGLRenderTarget {
  const [w, h] = IMPOSTOR_PX;
  const rt = new WebGLRenderTarget(w, h, { generateMipmaps: true, minFilter: LinearMipmapLinearFilter, samples: 0 });
  const scene = new Scene();
  // Las luces del horneado del mockup: cielo y suelo, y un sol de frente y arriba (la tarjeta se ve de cualquier lado).
  scene.add(new HemisphereLight(light.sky, light.ground, light.hemiIntensity));
  const sun = new DirectionalLight(light.sun, light.sunIntensity);
  sun.position.set(-0.4, 0.7, 0.8);
  scene.add(sun);
  scene.add(new Mesh(geo, material));
  const { side, top } = impostorBakeCameras(bakeBox(geo));
  const prevColor = renderer.getClearColor(new Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  const prevTarget = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(rt);
    renderer.setClearColor(TRANSPARENT, 0);
    renderer.clear();
    renderer.autoClear = false; // la segunda vista no borra la primera
    rt.viewport.set(0, 0, w / 2, h);
    renderer.setRenderTarget(rt);
    renderer.render(scene, side);
    rt.viewport.set(w / 2, 0, w / 2, h);
    renderer.setRenderTarget(rt);
    renderer.render(scene, top);
    rt.viewport.set(0, 0, w, h);
  } finally {
    renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    sun.dispose();
  }
  return rt;
}
