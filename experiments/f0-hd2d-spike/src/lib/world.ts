import type { TileLayer } from "./tileChunk";

/** Spike-only farm valley: ~48x32 tiles, two layers, ~40 volumes, 8 walking loops. Deterministic. */
export const MAP_W = 48;
export const MAP_H = 32;

/** Tile ids (atlas cell = id - 1). Ground uses 1-7, details 9-12 (transparent background). */
export const T = {
  grass: 1,
  grassDark: 2,
  dirt: 3,
  soil: 4,
  water: 5,
  stone: 6,
  sand: 7,
  flower: 9,
  tuft: 10,
  rock: 11,
  sprout: 12,
} as const;

/** Small integer hash so the layout is stable without Math.random. */
export function hash2(x: number, z: number): number {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const inRect = (x: number, z: number, x0: number, z0: number, x1: number, z1: number) =>
  x >= x0 && x <= x1 && z >= z0 && z <= z1;

function groundAt(x: number, z: number): number {
  const pond = ((x - 10) / 5.5) ** 2 + ((z - 24) / 3.5) ** 2;
  if (pond <= 1) return T.water;
  if (pond <= 1.45) return T.sand;
  if (inRect(x, z, 20, 13, 27, 18)) return T.stone; // El Cruce
  if (z === 15 || z === 16 || x === 23 || x === 24) return T.dirt;
  if (inRect(x, z, 4, 3, 18, 10) || inRect(x, z, 30, 21, 44, 28)) return T.soil;
  return hash2(x, z) < 0.25 ? T.grassDark : T.grass;
}

function detailAt(x: number, z: number, ground: number): number {
  if (ground === T.soil) return z % 2 === 0 ? T.sprout : 0;
  if (ground !== T.grass && ground !== T.grassDark) return 0;
  const r = hash2(x + 101, z + 37);
  if (r < 0.06) return T.flower;
  if (r < 0.14) return T.tuft;
  if (r < 0.16) return T.rock;
  return 0;
}

export function buildTilemap(): { ground: TileLayer; details: TileLayer } {
  const ground = new Uint8Array(MAP_W * MAP_H);
  const details = new Uint8Array(MAP_W * MAP_H);
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const g = groundAt(x, z);
      ground[z * MAP_W + x] = g;
      details[z * MAP_W + x] = detailAt(x, z, g);
    }
  }
  return {
    ground: { width: MAP_W, height: MAP_H, tiles: ground },
    details: { width: MAP_W, height: MAP_H, tiles: details },
  };
}

export type VolumeKind = "house" | "shed" | "tank" | "lamp" | "fencePost" | "hay";
export interface Volume {
  readonly kind: VolumeKind;
  /** Centre of the footprint in world metres. */
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly color: string;
}

const HOUSE_COLORS = ["#c9a37a", "#b8c4cf", "#d8c08a", "#a8b88a", "#c99a8a", "#d4d0c0"];

export function buildVolumes(): Volume[] {
  const v: Volume[] = [];
  const houses: Array<[number, number]> = [[31, 5], [37, 5], [43, 5], [31, 10], [37, 10], [43, 10]];
  houses.forEach(([x, z], i) =>
    v.push({ kind: "house", x, z, w: 4, d: 3, h: 2.2, color: HOUSE_COLORS[i % HOUSE_COLORS.length]! }),
  );
  const sheds: Array<[number, number]> = [[20, 4], [26.5, 25], [37, 25], [20, 23]];
  sheds.forEach(([x, z]) => v.push({ kind: "shed", x, z, w: 3, d: 4, h: 2.6, color: "#8a5a44" }));
  v.push({ kind: "tank", x: 20.5, z: 8.5, w: 2, d: 2, h: 3.5, color: "#9aa4ad" });
  for (let i = 0; i < 6; i++) {
    v.push({ kind: "lamp", x: 6 + i * 7.5, z: 14, w: 0.25, d: 0.25, h: 2.4, color: "#3a3a40" });
    v.push({ kind: "lamp", x: 22, z: 2 + i * 5.5, w: 0.25, d: 0.25, h: 2.4, color: "#3a3a40" });
  }
  for (let i = 0; i < 12; i++) {
    const top = i < 6;
    const x = top ? 4 + i * 2.8 : 30 + (i - 6) * 2.8;
    const z = top ? 11.5 : 29.1;
    v.push({ kind: "fencePost", x, z, w: 0.2, d: 0.2, h: 0.9, color: "#6b4a32" });
  }
  const hay: Array<[number, number]> = [[8, 13.3], [12, 13.3], [34, 19.5], [40, 19.5], [44, 19.5]];
  hay.forEach(([x, z]) => v.push({ kind: "hay", x, z, w: 1, d: 1, h: 0.8, color: "#d9b85c" }));
  return v;
}

/** A closed walking loop (polyline of tile-centre points, metres). */
export interface WalkPath {
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly speed: number;
  readonly startOffset: number;
}

const loop = (x0: number, z0: number, x1: number, z1: number): Array<[number, number]> => [
  [x0, z0], [x1, z0], [x1, z1], [x0, z1],
];

export function buildWalkPaths(): WalkPath[] {
  return [
    { points: loop(19.5, 12.5, 28.5, 19.5), speed: 1.6, startOffset: 0 }, // around El Cruce (camera follows this one)
    { points: [[2, 15.5], [46, 15.5]], speed: 1.4, startOffset: 5 },
    { points: [[23.5, 1], [23.5, 31]], speed: 1.3, startOffset: 3 },
    { points: loop(3, 1.5, 18, 12.5), speed: 1.1, startOffset: 7 },
    { points: loop(29, 20.5, 45, 30.5), speed: 1.2, startOffset: 2 },
    { points: loop(28, 2.5, 46.5, 13), speed: 1.5, startOffset: 9 },
    { points: loop(3, 19, 17, 29), speed: 1.0, startOffset: 4 },
    { points: [[24.5, 2], [24.5, 30]], speed: 1.7, startOffset: 11 },
  ];
}

/** Total length of a path; 2-point paths walk there and back (ping-pong). */
export function pathLength(points: ReadonlyArray<readonly [number, number]>): number {
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

/** Position and unit direction at distance `s` along the closed loop. */
export function samplePath(
  points: ReadonlyArray<readonly [number, number]>,
  s: number,
): { x: number; z: number; dx: number; dz: number } {
  const total = pathLength(points);
  let rest = ((s % total) + total) % total;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (rest <= seg && seg > 0) {
      const t = rest / seg;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
    }
    rest -= seg;
  }
  const p = points[0]!;
  return { x: p[0], z: p[1], dx: 0, dz: 0 };
}
