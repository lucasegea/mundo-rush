// A* over the walkability grid (03 §2.4 #3): 8 neighbors, no corner cutting (a diagonal is only valid if
// the two orthogonal cells it grazes are free), octile heuristic and fixed tie-breaking, so the same request
// always returns the same path. Then, line-of-sight smoothing with the character's radius.
import { segmentClear } from "./collision";
import { cellCenter, isWalkable, type Cell, type Point, type WalkGrid } from "./grid";

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const octile = (dc: number, dr: number): number => {
  const a = Math.abs(dc);
  const b = Math.abs(dr);
  return Math.max(a, b) + (SQRT2 - 1) * Math.min(a, b);
};

/** Minimal binary heap by (f, h, index): the tie-break by index makes the result deterministic. */
class OpenSet {
  private readonly items: { i: number; f: number; h: number }[] = [];
  get size(): number { return this.items.length; }
  private less(a: number, b: number): boolean {
    const x = this.items[a] as { i: number; f: number; h: number };
    const y = this.items[b] as { i: number; f: number; h: number };
    return x.f !== y.f ? x.f < y.f : x.h !== y.h ? x.h < y.h : x.i < y.i;
  }
  private swap(a: number, b: number): void {
    const t = this.items[a] as { i: number; f: number; h: number };
    this.items[a] = this.items[b] as { i: number; f: number; h: number };
    this.items[b] = t;
  }
  push(item: { i: number; f: number; h: number }): void {
    this.items.push(item);
    let k = this.items.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (!this.less(k, parent)) break;
      this.swap(k, parent);
      k = parent;
    }
  }
  pop(): { i: number; f: number; h: number } | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < this.items.length && this.less(l, m)) m = l;
        if (r < this.items.length && this.less(r, m)) m = r;
        if (m === k) break;
        this.swap(k, m);
        k = m;
      }
    }
    return top;
  }
}

/**
 * Cell path from `start` to `goal`, both included. null if either is blocked or if the goal is not
 * reachable (another region of the grid).
 */
export function findPath(g: WalkGrid, start: Cell, goal: Cell): Cell[] | null {
  if (!isWalkable(g, start[0], start[1]) || !isWalkable(g, goal[0], goal[1])) return null;
  const idx = (c: number, r: number): number => r * g.cols + c;
  const startI = idx(start[0], start[1]);
  const goalI = idx(goal[0], goal[1]);
  const gScore = new Float64Array(g.cols * g.rows).fill(Infinity);
  const cameFrom = new Int32Array(g.cols * g.rows).fill(-1);
  const closed = new Uint8Array(g.cols * g.rows);
  const open = new OpenSet();
  gScore[startI] = 0;
  const h0 = octile(goal[0] - start[0], goal[1] - start[1]);
  open.push({ i: startI, f: h0, h: h0 });

  while (open.size > 0) {
    const cur = open.pop() as { i: number; f: number; h: number };
    if (closed[cur.i] === 1) continue;
    if (cur.i === goalI) break;
    closed[cur.i] = 1;
    const c = cur.i % g.cols;
    const r = (cur.i - c) / g.cols;
    for (const [dc, dr] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!isWalkable(g, nc, nr)) continue;
      // No corner cutting: the diagonal requires both orthogonals free (it also avoids the diagonal "squeeze").
      if (dc !== 0 && dr !== 0 && (!isWalkable(g, c + dc, r) || !isWalkable(g, c, r + dr))) continue;
      const ni = idx(nc, nr);
      if (closed[ni] === 1) continue;
      const tentative = (gScore[cur.i] as number) + (dc !== 0 && dr !== 0 ? SQRT2 : 1);
      if (tentative < (gScore[ni] as number) - 1e-12) {
        gScore[ni] = tentative;
        cameFrom[ni] = cur.i;
        const h = octile(goal[0] - nc, goal[1] - nr);
        open.push({ i: ni, f: tentative + h, h });
      }
    }
  }

  if (startI !== goalI && cameFrom[goalI] === -1) return null;
  const path: Cell[] = [];
  for (let i = goalI; i !== -1; i = i === startI ? -1 : (cameFrom[i] as number)) {
    const c = i % g.cols;
    path.push([c, (i - c) / g.cols]);
  }
  return path.reverse();
}

/**
 * Line-of-sight smoothing: from each anchor it jumps to the farthest cell of the path that can be seen without
 * colliding (circle of radius r). Returns waypoints in meters, without the starting point.
 */
export function smoothPath(g: WalkGrid, from: Point, cells: readonly Cell[], r: number): Point[] {
  const points = cells.map(([c, row]) => cellCenter(g, c, row));
  const out: Point[] = [];
  let anchor = from;
  let i = 0;
  while (i < points.length) {
    let j = points.length - 1;
    while (j > i && !segmentClear(g, anchor, points[j] as Point, r)) j--;
    const next = points[j] as Point;
    out.push(next);
    anchor = next;
    i = j + 1;
  }
  return out;
}
