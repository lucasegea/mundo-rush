// F2 A1: A*, circle-cell collision and kinematic controller, without a browser (03 §2.4).
import { describe, expect, test } from "vitest";
import {
  buildWalkGrid, cellAt, cellCenter, circleBlocked, DEFAULT_MOVEMENT, facingFrom, findPath, fixedSteps, gridFromRows,
  IDLE, isWalkable, MAX_STEPS_PER_FRAME, moveCircle, nearbyInteractables, nearestWalkable, planPath, pointInPolygon,
  sameIds, segmentClear, SIM_DT, smoothPath, stepBody, type Body, type Cell, type MoveIntent, type WalkGrid,
} from "../src/index";

// 1 m cells in the drawings to read them easily (the rule does not depend on cell size).
const grid = (rows: string[]): WalkGrid => gridFromRows(rows, 1);
const isDiagonal = (a: Cell, b: Cell): boolean => a[0] !== b[0] && a[1] !== b[1];

describe("grilla", () => {
  test("celdas de 0,5 m sobre los límites; afuera es bloqueado", () => {
    const g = buildWalkGrid({ bounds: { minX: -2, maxX: 2, minZ: -1, maxZ: 1 } });
    expect([g.cols, g.rows, g.cellSize]).toEqual([8, 4, 0.5]);
    expect(cellAt(g, -2, -1)).toEqual([0, 0]);
    expect(cellAt(g, 1.99, 0.99)).toEqual([7, 3]);
    expect(cellCenter(g, 0, 0)).toEqual({ x: -1.75, z: -0.75 });
    expect(isWalkable(g, -1, 0)).toBe(false);
    expect(isWalkable(g, 8, 0)).toBe(false);
    expect(isWalkable(g, 7, 3)).toBe(true);
  });

  test("polígonos bloquean por el centro de la celda; huellas por superposición", () => {
    const g = buildWalkGrid({
      bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 },
      polygons: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
      rects: [{ minX: 2.9, maxX: 3.1, minZ: 2.9, maxZ: 3.1 }],
    });
    expect(isWalkable(g, 0, 0)).toBe(false); // center (0.25; 0.25) inside the polygon
    expect(isWalkable(g, 2, 0)).toBe(true);
    // The small footprint touches 4 cells (the ones around the point (3, 3)).
    expect([isWalkable(g, 5, 5), isWalkable(g, 6, 5), isWalkable(g, 5, 6), isWalkable(g, 6, 6)]).toEqual([false, false, false, false]);
    expect(isWalkable(g, 4, 4)).toBe(true);
  });

  test("pointInPolygon (par-impar) y nearestWalkable", () => {
    const sq = [[0, 0], [2, 0], [2, 2], [0, 2]] as const;
    expect(pointInPolygon(1, 1, sq)).toBe(true);
    expect(pointInPolygon(3, 1, sq)).toBe(false);
    const g = grid(["...", ".#.", "..."]);
    expect(nearestWalkable(g, [1, 1])).not.toBeNull();
    expect(nearestWalkable(g, [0, 0])).toEqual([0, 0]);
    expect(nearestWalkable(grid(["###", "###", "###"]), [1, 1], 1)).toBeNull();
  });
});

describe("A1: A*", () => {
  test("camino recto en campo abierto, de punta a punta", () => {
    const g = grid(["....."]);
    expect(findPath(g, [0, 0], [4, 0])).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
    expect(findPath(g, [2, 0], [2, 0])).toEqual([[2, 0]]);
  });

  test("objetivo inalcanzable (otra región) → null; inicio u objetivo bloqueados → null", () => {
    const g = grid([
      "..#..",
      "..#..",
      "..#..",
    ]);
    expect(findPath(g, [0, 0], [4, 2])).toBeNull();
    expect(findPath(g, [0, 0], [2, 1])).toBeNull();
    expect(findPath(g, [2, 1], [0, 0])).toBeNull();
    expect(planPath(g, { x: 0.5, z: 0.5 }, { x: 4.5, z: 2.5 }, { ...DEFAULT_MOVEMENT, radius: 0.3 })).toBeNull();
  });

  test("esquinas: rodea un obstáculo sin cortar la esquina en diagonal", () => {
    const g = grid([
      ".....",
      ".##..",
      ".....",
    ]);
    const path = findPath(g, [0, 0], [3, 2]) as Cell[];
    expect(path).not.toBeNull();
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1] as Cell;
      const b = path[i] as Cell;
      if (isDiagonal(a, b)) {
        // A diagonal only if the two orthogonals it grazes are free.
        expect(isWalkable(g, b[0], a[1]) && isWalkable(g, a[0], b[1]), `${a} → ${b}`).toBe(true);
      }
      expect(isWalkable(g, b[0], b[1])).toBe(true);
    }
  });

  test("apretón diagonal entre dos celdas bloqueadas que se tocan en la esquina: no pasa", () => {
    const g = grid([
      ".#",
      "#.",
    ]);
    // The only free cells touch only at the corner: there is no path.
    expect(findPath(g, [0, 0], [1, 1])).toBeNull();
    // With a detour possible, it takes it instead of squeezing through.
    const g2 = grid([
      "...",
      ".#.",
      "#..",
    ]);
    const p = findPath(g2, [0, 1], [1, 2]) as Cell[];
    expect(p).not.toBeNull();
    expect(p.some((c, i) => i > 0 && isDiagonal(p[i - 1] as Cell, c) && !isWalkable(g2, c[0], (p[i - 1] as Cell)[1]))).toBe(false);
  });

  test("determinístico: el mismo pedido devuelve el mismo camino", () => {
    const g = grid(["........", "..#..#..", "..#..#..", "........"]);
    const a = findPath(g, [0, 0], [7, 3]);
    for (let i = 0; i < 5; i++) expect(findPath(g, [0, 0], [7, 3])).toEqual(a);
  });

  test("suavizado por línea de visión: en campo abierto queda un solo tramo", () => {
    const g = grid(["......", "......", "......"]);
    const cells = findPath(g, [0, 0], [5, 2]) as Cell[];
    const pts = smoothPath(g, { x: 0.5, z: 0.5 }, cells, 0.3);
    expect(pts).toEqual([{ x: 5.5, z: 2.5 }]);
  });

  test("planPath sobre un obstáculo camina hasta la celda libre más cercana; en libre, al punto exacto", () => {
    const g = buildWalkGrid({ bounds: { minX: 0, maxX: 6, minZ: 0, maxZ: 6 }, rects: [{ minX: 3, maxX: 4, minZ: 3, maxZ: 4 }] });
    const exact = planPath(g, { x: 0.75, z: 0.75 }, { x: 5.1, z: 1.3 }) as { x: number; z: number }[];
    expect(exact.at(-1)).toEqual({ x: 5.1, z: 1.3 });
    const onBox = planPath(g, { x: 0.75, z: 0.75 }, { x: 3.5, z: 3.5 }) as { x: number; z: number }[];
    const last = onBox.at(-1) as { x: number; z: number };
    expect(circleBlocked(g, last.x, last.z, 0.2)).toBe(false);
  });
});

describe("A1: colisión círculo vs. celdas", () => {
  const g = grid([
    "....",
    "..#.",
    "....",
  ]);

  test("el círculo se detiene contra una celda bloqueada y no la atraviesa", () => {
    const p = moveCircle(g, { x: 0.5, z: 1.5 }, 3, 0, 0.3);
    expect(p.x).toBeLessThanOrEqual(2 - 0.3 + 1e-6);
    expect(p.x).toBeGreaterThan(2 - 0.3 - 0.01);
    expect(p.z).toBe(1.5);
  });

  test("se desliza sobre la pared al moverse en diagonal contra ella", () => {
    const p = moveCircle(g, { x: 1.5, z: 1.5 }, 1, -0.2, 0.3);
    expect(p.x).toBeLessThanOrEqual(1.7 + 1e-6); // x hits cell (2,1)
    expect(p.x).toBeGreaterThan(1.69);
    expect(p.z).toBeCloseTo(1.3, 9); // z stays free: it slides
  });

  test("no sale de la grilla (el borde es pared)", () => {
    const p = moveCircle(g, { x: 0.5, z: 0.5 }, -5, -5, 0.3);
    expect(p.x).toBeGreaterThanOrEqual(0.3 - 1e-6);
    expect(p.z).toBeGreaterThanOrEqual(0.3 - 1e-6);
  });

  test("apretón diagonal: el círculo no pasa entre dos celdas que se tocan en la esquina", () => {
    const d = grid([
      "...",
      ".#.",
      "..#",
      "...",
    ]);
    // From cell (2,1) toward (1,2): the gap between (1,1) and (2,2) is a point.
    const start = { x: 2.5, z: 1.5 };
    const p = moveCircle(d, start, -1.5, 1.5, 0.3);
    expect(circleBlocked(d, p.x, p.z, 0.3)).toBe(false);
    expect(p.x > 2 - 0.3 && p.z < 2 + 0.3).toBe(true); // stays on the same side
    expect(segmentClear(d, start, { x: 1.5, z: 2.5 }, 0.3)).toBe(false);
  });

  test("un punto de partida ya bloqueado no se mueve (dato malo, sin explotar)", () => {
    expect(moveCircle(g, { x: 2.5, z: 1.5 }, 1, 0, 0.3)).toEqual({ x: 2.5, z: 1.5 });
  });
});

describe("A1: controlador cinemático", () => {
  const open = gridFromRows(Array.from({ length: 40 }, () => ".".repeat(40)), 0.5);
  const at = (x: number, z: number): Body => ({ x, z, vx: 0, vz: 0 });
  const run = (g: WalkGrid, body: Body, intent: MoveIntent, steps: number) => {
    let b = body;
    let i = intent;
    for (let k = 0; k < steps; k++) ({ body: b, intent: i } = stepBody(g, b, i));
    return { body: b, intent: i };
  };

  test("acelera hasta la velocidad configurada y se queda ahí (dirección mantenida)", () => {
    const { body } = run(open, at(2, 10), { kind: "dir", x: 1, z: 0 }, 10);
    expect(body.vx).toBeCloseTo(DEFAULT_MOVEMENT.speed, 6);
    expect(body.vz).toBe(0);
    const first = stepBody(open, at(2, 10), { kind: "dir", x: 1, z: 0 }).body;
    expect(first.vx).toBeCloseTo(DEFAULT_MOVEMENT.accel * SIM_DT, 6); // the acceleration is the config's
  });

  test("al soltar frena con la misma aceleración y queda quieto", () => {
    const moving = run(open, at(2, 10), { kind: "dir", x: 1, z: 0 }, 10).body;
    const { body, intent } = run(open, moving, IDLE, 10);
    expect(body.vx).toBe(0);
    expect(intent).toEqual(IDLE);
  });

  test("camino: llega al punto pedido (dentro del radio de llegada) y la intención vuelve a idle", () => {
    const path = planPath(open, { x: 1, z: 1 }, { x: 15.2, z: 12.4 });
    const { body, intent } = run(open, at(1, 1), { kind: "path", waypoints: path ?? [] }, 300);
    expect(Math.hypot(body.x - 15.2, body.z - 12.4)).toBeLessThanOrEqual(DEFAULT_MOVEMENT.arriveRadius);
    expect(intent.kind).toBe("idle");
  });

  test("rodea una esquina siguiendo el camino sin quedar dentro de una celda bloqueada", () => {
    const g = gridFromRows([
      "..........",
      "..........",
      "....##....",
      "....##....",
      "....##....",
      "..........",
    ], 0.5);
    const path = planPath(g, { x: 0.75, z: 1.75 }, { x: 4.25, z: 1.75 }) ?? [];
    let b = at(0.75, 1.75);
    let i: MoveIntent = { kind: "path", waypoints: path };
    for (let k = 0; k < 200; k++) {
      ({ body: b, intent: i } = stepBody(g, b, i));
      expect(circleBlocked(g, b.x, b.z, DEFAULT_MOVEMENT.radius)).toBe(false);
    }
    expect(Math.hypot(b.x - 4.25, b.z - 1.75)).toBeLessThanOrEqual(DEFAULT_MOVEMENT.arriveRadius);
  });

  test("determinístico: la misma secuencia de pasos da el mismo resultado, bit a bit", () => {
    const seq: MoveIntent[] = [{ kind: "dir", x: 1, z: 0.3 }, { kind: "dir", x: -0.2, z: 1 }, IDLE];
    const play = () => {
      let b = at(5, 5);
      for (const intent of seq) b = run(open, b, intent, 17).body;
      return b;
    };
    expect(play()).toEqual(play());
  });

  test("un camino bloqueado por algo nuevo se abandona en vez de empujar", () => {
    const g = gridFromRows(["....#"], 1);
    const { intent } = run(g, at(3.5, 0.5), { kind: "path", waypoints: [{ x: 4.5, z: 0.5 }] }, 20);
    expect(intent).toEqual(IDLE);
  });

  test("orientación por la componente dominante; quieto conserva la anterior", () => {
    expect(facingFrom(1, 0.2, "s")).toBe("e");
    expect(facingFrom(-1, 0.2, "s")).toBe("w");
    expect(facingFrom(0.1, -1, "s")).toBe("n");
    expect(facingFrom(0, 1, "n")).toBe("s");
    expect(facingFrom(0, 0, "w")).toBe("w");
  });

  test("paso fijo: los pasos no dependen del framerate y el acumulador no se dispara", () => {
    let acc = 0;
    let total = 0;
    for (let k = 0; k < 60; k++) { // 60 frames of 1/60 s = 1 s
      const r = fixedSteps(acc, 1 / 60);
      acc = r.accumulator;
      total += r.steps;
    }
    expect(total).toBe(30);
    expect(fixedSteps(0, 10)).toEqual({ steps: MAX_STEPS_PER_FRAME, accumulator: 0 });
    expect(fixedSteps(0, -1)).toEqual({ steps: 0, accumulator: 0 });
  });
});

describe("interactuables cercanos (03 §2.4 #5)", () => {
  const items = [
    { id: "NPC-B", kind: "npc" as const, x: 1, z: 0, radius: 1.5 },
    { id: "NPC-A", kind: "npc" as const, x: -1, z: 0, radius: 1.5 },
    { id: "NPC-C", kind: "npc" as const, x: 5, z: 0, radius: 1.5 },
  ];
  test("dentro del radio, del más cercano al más lejano, desempate por id", () => {
    expect(nearbyInteractables({ x: 0, z: 0 }, items)).toEqual(["NPC-A", "NPC-B"]);
    expect(nearbyInteractables({ x: 0.5, z: 0 }, items)).toEqual(["NPC-B", "NPC-A"]);
    expect(nearbyInteractables({ x: 10, z: 0 }, items)).toEqual([]);
  });
  test("sameIds", () => {
    expect(sameIds(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
    expect(sameIds(["b", "a"], ["a", "b"])).toBe(false);
  });
});
