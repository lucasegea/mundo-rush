// Open-world-3d T9 (AC53, AC56 in the pure part): the minimap model (up is forward, 60 m, edge ring), the
// pending markers and the turn that cuts out with "reduce motion".
import { describe, expect, test } from "vitest";
import { MINIMAP, minimapModel, pendingNpcs, screenDirToWorld, stepMinimapYaw } from "../src";

const ahead = (yawDeg: number, m: number): { x: number; z: number } => {
  const f = screenDirToWorld({ x: 0, y: 1 }, yawDeg);
  return { x: f.x * m, z: f.z * m };
};

describe("AC53 minimapModel: jugador en (0,0), yaw 90, un NPC a 30 m adelante y otro a 100 m", () => {
  const near = { id: "NPC-A", name: "A", ...ahead(90, 30) };
  const far = { id: "NPC-B", name: "B", x: 70, z: -71.4 }; // ~100 m, to the right and behind
  const m = minimapModel({ player: { x: 0, z: 0 }, yawDeg: 90, npcs: [near, far], sizePx: 160 });

  test("adelante con yaw 90 es -x (la misma regla de pantalla que la cámara)", () => {
    expect(near.x).toBeCloseTo(-30, 9);
    expect(near.z).toBeCloseTo(0, 9);
  });

  test("el primero queda 30/60 del radio derecho hacia arriba (0,5 px a 160 px), sin borde", () => {
    const [a] = m.markers;
    expect(m.center).toBe(80);
    expect(m.radiusPx).toBe(80);
    expect(Math.abs((a?.x ?? 0) - 80)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((a?.y ?? 0) - (80 - (30 / 60) * 80))).toBeLessThanOrEqual(0.5);
    expect(a?.edge).toBe(false);
    expect(a?.distanceM).toBeCloseTo(30, 9);
    expect(a?.bearingDeg).toBeCloseTo(0, 6);
  });

  test("el segundo se clava en el anillo con edge: true, en su dirección", () => {
    const b = m.markers[1];
    expect(b?.edge).toBe(true);
    expect(Math.hypot((b?.x ?? 0) - m.center, (b?.y ?? 0) - m.center)).toBeCloseTo(m.ringPx, 6);
    expect(m.ringPx).toBeCloseTo(80 * MINIMAP.ringFraction, 9);
    expect(b?.distanceM).toBeCloseTo(Math.hypot(70, 71.4), 6);
    // With yaw 90 the camera's right is -z: (70, -71.4) is to the right (x > center) and behind (y > center).
    expect(b?.x ?? 0).toBeGreaterThan(m.center);
    expect(b?.y ?? 0).toBeGreaterThan(m.center);
    expect(b?.bearingDeg ?? 0).toBeGreaterThan(90);
    expect(b?.bearingDeg ?? 0).toBeLessThan(180);
  });

  test("el jugador es el centro; 60 m llegan justo al borde; a 112 px la escala acompaña", () => {
    expect(m.player).toEqual({ x: 0, z: 0 });
    expect(m.pxPerM).toBeCloseTo(80 / MINIMAP.radiusM, 9);
    const small = minimapModel({ player: { x: 5, z: 5 }, yawDeg: 0, npcs: [{ id: "N", name: "N", x: 5, z: 5 - 30 }], sizePx: 112 });
    expect(small.markers[0]?.x).toBeCloseTo(56, 6);
    expect(small.markers[0]?.y).toBeCloseTo(56 - 28, 6);
    // An NPC at the same spot as the player ends up at the center, with no bearing.
    const same = minimapModel({ player: { x: 1, z: 1 }, yawDeg: 33, npcs: [{ id: "N", name: "N", x: 1, z: 1 }], sizePx: 160 });
    expect([same.markers[0]?.x, same.markers[0]?.y, same.markers[0]?.bearingDeg]).toEqual([80, 80, 0]);
  });

  test("caminos, ríos y agua se proyectan igual; lo que está lejos no entra; los límites son 4 esquinas", () => {
    const ground = {
      paths: [{ width: 3, surface: "camino" as const, points: [], line: [ahead(90, 10), ahead(90, 20)] }, { width: 3, surface: "camino" as const, points: [], line: [{ x: 900, z: 900 }] }],
      rivers: [{ width: 6, line: [ahead(90, 30)] }],
      ponds: [[[-30, 0], [-31, 1], [-31, -1]] as [number, number][], [[800, 800], [801, 800], [800, 801]] as [number, number][]],
    };
    const g = minimapModel({ player: { x: 0, z: 0 }, yawDeg: 90, npcs: [], sizePx: 160, ground, bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } });
    expect(g.roads).toHaveLength(1);
    expect(g.roads[0]?.widthPx).toBeCloseTo(3 * g.pxPerM, 9);
    expect(g.roads[0]?.points[1]?.[0]).toBeCloseTo(80, 6);
    expect(g.roads[0]?.points[1]?.[1]).toBeCloseTo(80 - 20 * g.pxPerM, 6);
    expect(g.rivers).toHaveLength(1);
    expect(g.ponds).toHaveLength(1);
    expect(g.ponds[0]?.[0]?.[1]).toBeCloseTo(40, 6);
    expect(g.bounds).toHaveLength(4);
    expect(minimapModel({ player: { x: 0, z: 0 }, yawDeg: 0, npcs: [], sizePx: 160 }).bounds).toBeNull();
  });
});

describe("pendingNpcs: los del diorama que no están completados, en el orden del layout", () => {
  const npcs = [{ id: "NPC-MITAYO" }, { id: "NPC-CERRO" }, { id: "NPC-FACTOR" }];
  test("completar uno lo saca; un completado ajeno al diorama no cambia nada", () => {
    expect(pendingNpcs(npcs, []).map((n) => n.id)).toEqual(["NPC-MITAYO", "NPC-CERRO", "NPC-FACTOR"]);
    expect(pendingNpcs(npcs, ["NPC-MITAYO"]).map((n) => n.id)).toEqual(["NPC-CERRO", "NPC-FACTOR"]);
    expect(pendingNpcs(npcs, ["NPC-NELL"]).map((n) => n.id)).toEqual(["NPC-MITAYO", "NPC-CERRO", "NPC-FACTOR"]);
    expect(pendingNpcs(npcs, ["NPC-FACTOR", "NPC-CERRO", "NPC-MITAYO"])).toEqual([]);
  });
});

describe("AC56 stepMinimapYaw: suavizado, y corte con reducir movimiento", () => {
  test("reducir movimiento corta al yaw pedido en un redibujo; sin giro previo también", () => {
    expect(stepMinimapYaw(0, 90, 0.1, true)).toBe(90);
    expect(stepMinimapYaw(null, 450, 0.1, false)).toBe(90);
  });
  test("sin reducir movimiento avanza una parte por el camino corto y termina llegando", () => {
    const one = stepMinimapYaw(0, 90, MINIMAP.redrawMs / 1000, false);
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(90);
    expect(one).toBeCloseTo(90 * (1 - Math.exp(-MINIMAP.yawEasePerS * 0.1)), 9);
    // 350 -> 10 crosses 0 (20°), it does not take the long way around.
    const wrap = stepMinimapYaw(350, 10, 0.1, false);
    expect(wrap > 350 || wrap < 10).toBe(true);
    let y = 0;
    for (let i = 0; i < 30; i++) y = stepMinimapYaw(y, 90, 0.1, false);
    expect(y).toBe(90);
  });
});
