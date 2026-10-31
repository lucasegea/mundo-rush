// world/budget/estimate.ts — static estimator of draw calls and triangles (plan estetica-c M1 A15, architecture review 2026-10-12):
// a pure sum over what the builders return, with no new "scene description" layer. One call per
// visible mesh, one per InstancedMesh (triangles × instances) and one per Sprite. It does not count shadow or
// post passes: since M6 the validate:content estimator adds the `high` shadow pass (one call and the body per
// character) and the real thing each frame, post included, is measured by renderer.info in the director-mode snapshot.
import { InstancedMesh, Mesh, Sprite, type Material, type Object3D } from "three";

export interface BudgetEstimate {
  drawCalls: number;
  triangles: number;
}

export interface BudgetLimits {
  maxDrawCalls: number;
  maxTriangles: number;
}

const visibleMaterial = (m: Material | Material[]): boolean => (Array.isArray(m) ? m.some((x) => x.visible) : m.visible);

/** Sum of what the graph draws (visible objects with visible material only). */
export function estimateBudget(roots: readonly Object3D[]): BudgetEstimate {
  let drawCalls = 0;
  let triangles = 0;
  const visit = (o: Object3D): void => {
    if (!o.visible) return;
    if (o instanceof Sprite) {
      drawCalls += 1;
      triangles += 2;
    } else if (o instanceof Mesh && visibleMaterial(o.material)) {
      const g = o.geometry;
      const tris = (g.index ? g.index.count : g.getAttribute("position").count) / 3;
      const n = o instanceof InstancedMesh ? o.count : 1;
      if (n > 0) {
        drawCalls += 1;
        triangles += tris * n;
      }
    }
    for (const c of o.children) visit(c);
  };
  for (const r of roots) visit(r);
  return { drawCalls, triangles: Math.round(triangles) };
}

export const withinBudget = (e: BudgetEstimate, l: BudgetLimits): boolean => e.drawCalls <= l.maxDrawCalls && e.triangles <= l.maxTriangles;
