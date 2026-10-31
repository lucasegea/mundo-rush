// world/nature/impostor.ts — the impostor baking (open-world-3d T7, AC44), port of the V6 mockup (`world.js:1319`
// impostor): each pine and broadleaf species is drawn once from the side and once from above into a
// 512 × 256 texture (IMPOSTOR_PX), the second view without clearing the first (autoClear off). The cameras come from
// world/camera/bakeCamera.ts (R11). The renderer state (target, background color, autoClear) goes back as it was.
// Open-world-3d T7b (D-838): the bake lights belong to the look (`WorldLook.light.impostor`).
import {
  Color, DirectionalLight, HemisphereLight, LinearMipmapLinearFilter, Mesh, Scene, WebGLRenderTarget,
  type BufferGeometry, type Material, type WebGLRenderer,
} from "three";
import { IMPOSTOR_PX, type WorldLook } from "@lg/art";
import { impostorBakeCameras, type BakeBox } from "../camera/bakeCamera";

/** The bake background: black with alpha 0 (core: it is not a look color, it is the texture void). */
const TRANSPARENT = new Color(0, 0, 0);

/** The bake box of a tree geometry (base at y = 0, trunk at the origin). */
export function bakeBox(geo: BufferGeometry): BakeBox {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  if (!b) throw new Error("impostor: geometría sin caja");
  return { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, maxY: b.max.y };
}

/** Bakes a species into its texture (side on the left, canopy on the right). The caller frees the target. */
export function bakeImpostor(renderer: WebGLRenderer, geo: BufferGeometry, material: Material, light: WorldLook["light"]["impostor"]): WebGLRenderTarget {
  const [w, h] = IMPOSTOR_PX;
  const rt = new WebGLRenderTarget(w, h, { generateMipmaps: true, minFilter: LinearMipmapLinearFilter, samples: 0 });
  const scene = new Scene();
  // The mockup bake lights: sky and ground, and a sun from the front and above (the card looks right from any side).
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
    renderer.autoClear = false; // the second view does not clear the first
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
