// Plan estetica-c M1 (D-207), core parts: A1 (long-lens angles), A9 (player positioning for the
// chat, with free line of sight over the grid) and A11 (the player camera is only perspective3D).
import { describe, expect, test } from "vitest";
import {
  applySettingsPatch, CAMERA_PRESETS, cellAt, circleBlocked, clearLine, DEFAULT_SETTINGS, isWalkable, presetAngles,
  STANDOFF_DISTANCE, standoffPoint, type SettingsPatch, type WalkGrid,
} from "../src/index";

/** 20 × 20 m grid (0.5 m cells, origin -10) with the cells blocked that `blocked(x, z)` says (center). */
function field(blocked: (x: number, z: number) => boolean = () => false): WalkGrid {
  const cols = 40;
  const walkable = new Uint8Array(cols * cols);
  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) walkable[row * cols + col] = blocked(-10 + (col + 0.5) * 0.5, -10 + (row + 0.5) * 0.5) ? 0 : 1;
  }
  return { originX: -10, originZ: -10, cols, rows: cols, cellSize: 0.5, walkable };
}
const NPC = { x: 0, z: 0 };
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const free = (g: WalkGrid, p: { x: number; z: number }) => {
  const [c, r] = cellAt(g, p.x, p.z);
  return isWalkable(g, c, r) && !circleBlocked(g, p.x, p.z, 0.24);
};

describe("A1 (núcleo): perspective3D es el lente largo de 50° / 45°", () => {
  test("presetAngles", () => {
    expect(presetAngles("perspective3D")).toEqual({ pitchDeg: 50, yawDeg: 45 });
    expect(presetAngles("dialogueFrame").pitchDeg).toBe(20);
  });
});

// Recorded change (open-world-3d T5, PD-5 amends D-208 for the default view, AC27): CAMERA_PRESETS used to be
// exactly ["perspective3D"] and that was the default; now `thirdPerson` is the default and `perspective3D` is still selectable.
describe("A11 ajustes: thirdPerson por defecto, perspective3D elegible; un valor viejo cae al default", () => {
  test("CAMERA_PRESETS es exactamente ['thirdPerson', 'perspective3D'] y thirdPerson es el default", () => {
    expect([...CAMERA_PRESETS]).toEqual(["thirdPerson", "perspective3D"]);
    expect(DEFAULT_SETTINGS.camera).toBe("thirdPerson");
  });
  test.each(["topdownOrtho", "isoOrtho"])("un ajuste guardado con camera: %s carga como thirdPerson", (old) => {
    const s = applySettingsPatch(DEFAULT_SETTINGS, { camera: old } as unknown as SettingsPatch);
    expect(s.camera).toBe("thirdPerson");
  });
});

describe("A9 standoffPoint: 2,6 m del NPC, de su lado, caminable y con línea libre", () => {
  test("campo abierto: a 2,6 m (±0,25), del lado desde el que llegó, en un lugar libre", () => {
    const g = field();
    for (const from of [{ x: 1.2, z: 0 }, { x: -0.8, z: 0.9 }, { x: 0.3, z: -1.4 }]) {
      const p = standoffPoint(from, NPC, g);
      expect(Math.abs(dist(p, NPC) - STANDOFF_DISTANCE)).toBeLessThanOrEqual(0.25);
      expect(free(g, p)).toBe(true);
      // Same side: the angle between (from - NPC) and (point - NPC) is under 90°.
      expect((from.x - NPC.x) * (p.x - NPC.x) + (from.z - NPC.z) * (p.z - NPC.z)).toBeGreaterThan(0);
    }
  });

  test("sin lugar a 2,6 m cae al rango de 1,8 a 3,2 m", () => {
    const g = field((x, z) => { const d = Math.hypot(x, z); return d > 2.2 && d < 3.0; });
    const p = standoffPoint({ x: 1.2, z: 0 }, NPC, g);
    const d = dist(p, NPC);
    expect(d).toBeGreaterThanOrEqual(1.8 - 1e-9);
    expect(d).toBeLessThanOrEqual(3.2 + 1e-9);
    expect(Math.abs(d - STANDOFF_DISTANCE)).toBeGreaterThan(0.25);
    expect(free(g, p)).toBe(true);
  });

  test("con todo bloqueado alrededor devuelve la posición actual", () => {
    const from = { x: 1.25, z: 0.25 };
    const g = field((x, z) => Math.hypot(x - from.x, z - from.z) > 0.6);
    expect(standoffPoint(from, NPC, g)).toBe(from);
  });

  test("un punto libre detrás de un cerco (sin línea libre) no se elige", () => {
    // Fence at x ∈ [1.5, 2] end to end: at 2.6 m along the x axis there is free room, but on the other side.
    const g = field((x) => x > 1.5 && x < 2);
    const from = { x: 1.0, z: 0 };
    expect(free(g, { x: 2.6, z: 0 })).toBe(true); // without the free line of sight, this would be the first one picked
    expect(clearLine(g, from, { x: 2.6, z: 0 })).toBe(false);
    const p = standoffPoint(from, NPC, g);
    expect(p.x).toBeLessThan(1.5);
    expect(clearLine(g, from, p)).toBe(true);
    expect(Math.abs(dist(p, NPC) - STANDOFF_DISTANCE)).toBeLessThanOrEqual(0.25);
  });

  test("determinístico", () => {
    const g = field((x, z) => x > 1 && z > 1 && x < 2 && z < 2);
    expect(standoffPoint({ x: 1.1, z: 0.4 }, NPC, g)).toEqual(standoffPoint({ x: 1.1, z: 0.4 }, NPC, g));
  });
});
