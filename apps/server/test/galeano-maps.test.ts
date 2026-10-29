// book-mode slice-1 M6.1 (AC1, AC2): los dioramas compilados de U-GALEANO son mapas reales (props, NPCs) y son
// recorribles. Se compila en memoria desde content/universes/U-GALEANO/ (la salida en disco está fuera de git).
//
// Cambio registrado (open-world-3d T3, AC13; D-818 y el plan estetica-c M7, D-207, que retira `tiles` y `atlas_tiles`):
// el test "muelle es un mapa de tiles con al menos 4 ids distintos" afirmaba `atlas_tiles` y una capa `suelo` del tamaño
// de los límites; ahora afirma el formato de la maqueta (`terreno`, al menos un camino, sin `tiles` ni `atlas_tiles`).
// El A* hasta cada NPC ahora además comprueba que la celda de llegada queda a 3 m o menos del NPC.
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
  test("muelle tiene terreno y al menos un camino, sin tiles ni atlas_tiles; 28x20 como antes", () => {
    const l = layout("muelle") as DioramaLayout & Record<string, unknown>;
    expect(l["terreno"]).toBeTruthy();
    expect((l["caminos"] as unknown[] | undefined)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect("tiles" in l).toBe(false);
    expect("atlas_tiles" in l).toBe(false);
    expect([l.bounds.maxX - l.bounds.minX, l.bounds.maxZ - l.bounds.minZ]).toEqual([28, 20]);
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
