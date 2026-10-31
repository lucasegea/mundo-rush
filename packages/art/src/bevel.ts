// @lg/art bevel.ts: the bevel rule as a pure function (proposal C §7, plan estetica-c M1 A5): the largest
// dihedral angle between neighboring triangles of a mesh (the angle between their normals; 0 = coplanar, 90 = box edge).
// Vertices are welded by position (UV seams duplicate vertices) and degenerate triangles are skipped.
// Moved from world/props/ in M2 as is: used by the code-prop tests and scripts/assets/optimize.ts
// to reject pieces with hard edges.

/** Largest dihedral angle (degrees) between triangles that share an edge. `index` optional (indexed mesh). */
export function maxDihedralDeg(positions: ArrayLike<number>, index?: ArrayLike<number> | null): number {
  const vertexCount = Math.floor(positions.length / 3);
  const triCount = index ? Math.floor(index.length / 3) : Math.floor(vertexCount / 3);
  const vid = (k: number): number => (index ? (index[k] as number) : k);
  // Weld by quantized position.
  const weld = new Map<string, number>();
  const welded = new Int32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const key = `${Math.round((positions[v * 3] as number) * 1e4)},${Math.round((positions[v * 3 + 1] as number) * 1e4)},${Math.round((positions[v * 3 + 2] as number) * 1e4)}`;
    let id = weld.get(key);
    if (id === undefined) { id = weld.size; weld.set(key, id); }
    welded[v] = id;
  }
  const normals = new Float64Array(triCount * 3);
  const valid = new Uint8Array(triCount);
  const edges = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    const a = vid(t * 3);
    const b = vid(t * 3 + 1);
    const c = vid(t * 3 + 2);
    const ids = [welded[a] as number, welded[b] as number, welded[c] as number];
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
    const p = (v: number, k: number) => positions[v * 3 + k] as number;
    const ux = p(b, 0) - p(a, 0), uy = p(b, 1) - p(a, 1), uz = p(b, 2) - p(a, 2);
    const vx = p(c, 0) - p(a, 0), vy = p(c, 1) - p(a, 1), vz = p(c, 2) - p(a, 2);
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-10) continue;
    normals.set([nx / len, ny / len, nz / len], t * 3);
    valid[t] = 1;
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
      const lo = Math.min(ids[i] as number, ids[j] as number);
      const hi = Math.max(ids[i] as number, ids[j] as number);
      const key = `${lo}_${hi}`;
      const list = edges.get(key);
      if (list) list.push(t);
      else edges.set(key, [t]);
    }
  }
  let worst = 0;
  for (const tris of edges.values()) {
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        const a = (tris[i] as number) * 3;
        const b = (tris[j] as number) * 3;
        if (!valid[a / 3] || !valid[b / 3]) continue;
        const dot = (normals[a] as number) * (normals[b] as number) + (normals[a + 1] as number) * (normals[b + 1] as number) + (normals[a + 2] as number) * (normals[b + 2] as number);
        const deg = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
        if (deg > worst) worst = deg;
      }
    }
  }
  return worst;
}

/** Maximum angle allowed by the bevel rule. */
export const MAX_DIHEDRAL_DEG = 80;
