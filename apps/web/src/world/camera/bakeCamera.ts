// world/camera/bakeCamera.ts — the impostor baking cameras (open-world-3d T7, AC44; R11: cameras live in
// world/camera/). Port of the V6 mockup (`world.js` impostor): each tree is drawn once from the side and once from above
// into a 512 × 256 texture (the side view in the left half, the canopy in the right). The framing is pure (testable
// without GPU); world/nature/impostor.ts asks for the cameras here and builds none.
import { OrthographicCamera } from "three";

/** The baked tree's box (geometry with the base at y = 0 and the trunk at the origin). */
export interface BakeBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
}

/**
 * The impostor framing: `E` half-side of the side view (square, centered at mid-height `ymid`), `Et` half
 * side of the canopy seen from above (centered on the trunk). A 4 % margin, like the mockup.
 */
export function impostorFraming(b: BakeBox): { E: number; ymid: number; Et: number } {
  const E = Math.max(b.maxY / 2, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2) * 1.04;
  const Et = Math.max(-b.minX, b.maxX, -b.minZ, b.maxZ) * 1.04;
  return { E, ymid: b.maxY / 2, Et };
}

/** The two orthographic baking cameras: from the side (from +z) and from above (with +z pointing down in the image). */
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
