// world/props/bevel.ts — la regla del bisel como función pura (propuesta C §7, plan estetica-c M1 A5): el mayor ángulo
// diedro entre triángulos vecinos de una malla (el ángulo entre sus normales; 0 = coplanares, 90 = arista de caja).
// Los vértices se sueldan por posición (las costuras de UV duplican vértices) y los triángulos degenerados se saltean.
// En M2 lo usa también el script de assets para rechazar piezas con aristas duras.

/** Mayor ángulo diedro (grados) entre triángulos que comparten una arista. `index` opcional (malla indexada). */
export function maxDihedralDeg(positions: ArrayLike<number>, index?: ArrayLike<number> | null): number {
  const vertexCount = Math.floor(positions.length / 3);
  const triCount = index ? Math.floor(index.length / 3) : Math.floor(vertexCount / 3);
  const vid = (k: number): number => (index ? (index[k] as number) : k);
  // Soldadura por posición cuantizada.
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

/** Ángulo máximo permitido por la regla del bisel. */
export const MAX_DIHEDRAL_DEG = 80;
