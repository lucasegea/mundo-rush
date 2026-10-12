// world/budget/estimate.ts — estimador estático de draw calls y triángulos (plan estetica-c M1 A15, revisión de arquitectura 2026-10-12):
// una suma pura sobre lo que devuelven los constructores, sin capa nueva de "descripción de escena". Una llamada por
// malla visible, una por InstancedMesh (triángulos × instancias) y una por Sprite. No cuenta las pasadas de sombra ni de
// post (en `medium` no hay sombra proyectada; las de `high` y los tiers se miden en M6 con renderer.info).
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

/** Suma de lo que dibuja el grafo (solo objetos visibles con material visible). */
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
