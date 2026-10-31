// book-mode slice-1 M6.1 (AC1, AC2): the compiled dioramas of U-GALEANO are real maps (props, NPCs) and are
// walkable. Compiled in memory from content/universes/U-GALEANO/ (the on-disk output is outside git).
//
// Recorded change (open-world-3d T3, AC13; D-818 and the estetica-c plan M7, D-207, which retires `tiles` and `atlas_tiles`):
// the test "muelle es un mapa de tiles con al menos 4 ids distintos" asserted `atlas_tiles` and a `suelo` layer the size
// of the bounds; it now asserts the diorama format (`terreno`, at least one path, no `tiles` or `atlas_tiles`).
// The A* to each NPC now also checks that the arrival cell is within 3 m of the NPC.
// Recorded change (open-world-3d T6, AC34, D-819): "28x20 como antes" becomes "at least 140x100 m": the dock is the
// open world of mockup V6 (relief, NPCs at 53-67 m, organic non-walkable ring). AC34 and AC35 are added below.
import { compilarContenido } from "@lg/content-schema";
import { cellAt, cellCenter, findPath, isWalkable, nearestWalkable, prepareDiorama, type DioramaLayout } from "@lg/core";
import { describe, expect, test } from "vitest";
import { leerContenido } from "../../../scripts/content/build.ts";
import { must, REPO_ROOT } from "./helpers.ts";

const resultado = compilarContenido(leerContenido(REPO_ROOT, "U-GALEANO"), "dev");
if (!resultado.salida) throw new Error(`U-GALEANO no compila: ${JSON.stringify(resultado.errores.slice(0, 5))}`);
const dioramas = resultado.salida.cliente["dioramas.json"] as DioramaLayout[];
const layout = (id: string): DioramaLayout => must(dioramas.find((d) => d.id === id), id);

describe("AC13: muelle y plaza en el formato de la maqueta", () => {
  test("muelle tiene terreno y al menos un camino, sin tiles ni atlas_tiles; al menos 140x100 m (T6)", () => {
    const l = layout("muelle") as DioramaLayout & Record<string, unknown>;
    expect(l["terreno"]).toBeTruthy();
    expect((l["caminos"] as unknown[] | undefined)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect("tiles" in l).toBe(false);
    expect("atlas_tiles" in l).toBe(false);
    expect(l.bounds.maxX - l.bounds.minX).toBeGreaterThanOrEqual(140);
    expect(l.bounds.maxZ - l.bounds.minZ).toBeGreaterThanOrEqual(100);
  });

  test("plaza compila, también sin tiles", () => {
    const l = layout("plaza") as DioramaLayout & Record<string, unknown>;
    expect("tiles" in l).toBe(false);
    expect("atlas_tiles" in l).toBe(false);
  });
});

describe("AC2: NPCs en el mapa y alcanzables desde el spawn", () => {
  test("muelle lista MITAYO, CERRO y FACTOR; plaza ninguno (D-811)", () => {
    expect(prepareDiorama(layout("muelle")).npcs.map((n) => n.id).sort()).toEqual(["NPC-CERRO", "NPC-FACTOR", "NPC-MITAYO"]);
    expect(prepareDiorama(layout("plaza")).npcs).toEqual([]);
  });

  test("desde el spawn el planificador A* llega junto a cada NPC", () => {
    const run = prepareDiorama(layout("muelle"));
    const start = must(nearestWalkable(run.grid, cellAt(run.grid, run.spawn.x, run.spawn.z)), "spawn caminable");
    for (const npc of run.npcs) {
      const goal = nearestWalkable(run.grid, cellAt(run.grid, npc.x, npc.z), 3);
      expect(goal, `${npc.id} sin celda libre cerca`).not.toBeNull();
      const [col, row] = must(goal, npc.id);
      const llegada = cellCenter(run.grid, col, row);
      expect(Math.hypot(llegada.x - npc.x, llegada.z - npc.z), `${npc.id}: llegada a más de 3 m`).toBeLessThanOrEqual(3);
      expect(findPath(run.grid, start, must(goal, npc.id)), `${npc.id} inalcanzable`).not.toBeNull();
    }
  });

  test("ningún NPC cae sobre una celda bloqueada por props o no_caminable", () => {
    const l = layout("muelle");
    const sinNpcs = prepareDiorama({ ...l, npcs: [] });
    for (const n of l.npcs ?? []) {
      const c = cellAt(sinNpcs.grid, n.spawn[0], n.spawn[2]);
      expect(isWalkable(sinNpcs.grid, c[0], c[1]), n.id).toBe(true);
    }
  });
});

/** Length (m) of a cell path: sum of steps between centers (1 or the root of 2 cells). */
const pathLength = (cells: readonly (readonly [number, number])[], cell: number): number =>
  cells.slice(1).reduce((n, c, i) => {
    const [px, pz] = must(cells[i], "celda previa");
    return n + Math.hypot(c[0] - px, c[1] - pz) * cell;
  }, 0);

describe("open-world-3d T6: el mundo abierto del muelle (AC34, AC35)", () => {
  const run = prepareDiorama(layout("muelle"));

  test("AC34: NPCs a 30 m o más entre sí; A* de la aparición al NPC más lejano de 70 m o más; todos alcanzables", () => {
    const npcs = run.npcs;
    expect(npcs.length).toBe(3);
    for (let i = 0; i < npcs.length; i++) {
      for (let j = i + 1; j < npcs.length; j++) {
        const a = must(npcs[i], "npc");
        const b = must(npcs[j], "npc");
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id}-${b.id}`).toBeGreaterThanOrEqual(30);
      }
    }
    const start = must(nearestWalkable(run.grid, cellAt(run.grid, run.spawn.x, run.spawn.z)), "spawn caminable");
    const lengths = npcs.map((n) => {
      const goal = must(nearestWalkable(run.grid, cellAt(run.grid, n.x, n.z), 3), n.id);
      const path = must(findPath(run.grid, start, goal), `${n.id} inalcanzable`);
      return { id: n.id, d: Math.hypot(n.x - run.spawn.x, n.z - run.spawn.z), len: pathLength(path, run.grid.cellSize) };
    });
    const farthest = lengths.reduce((a, b) => (b.d > a.d ? b : a));
    expect(farthest.len).toBeGreaterThanOrEqual(70);
  });

  test("AC35: el anillo no_caminable tiene 12 vértices o más y 40 % o más de aristas no alineadas a los ejes", () => {
    const ring = must(layout("muelle").no_caminable?.[0], "anillo").poligono;
    expect(ring.length).toBeGreaterThanOrEqual(12);
    const edges = ring.map((p, i) => [p, must(ring[(i + 1) % ring.length], "vértice")] as const);
    const diagonal = edges.filter(([a, b]) => Math.abs(b[0] - a[0]) > 0.5 && Math.abs(b[1] - a[1]) > 0.5).length;
    expect(diagonal / edges.length).toBeGreaterThanOrEqual(0.4);
    // The ring cuts neither the spawn nor the NPCs (the relief's plains stay walkable).
    const sinNpcs = prepareDiorama({ ...layout("muelle"), npcs: [] });
    for (const p of [run.spawn, ...run.npcs]) {
      const c = cellAt(sinNpcs.grid, p.x, p.z);
      expect(isWalkable(sinNpcs.grid, c[0], c[1])).toBe(true);
    }
  });
});
