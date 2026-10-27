// book-mode slice-1 M6.1 (AC1, AC2): los dioramas compilados de U-GALEANO son mapas reales (tiles, props, NPCs) y
// son recorribles. Se compila en memoria desde content/universes/U-GALEANO/ (la salida en disco está fuera de git).
import { compilarContenido } from "@lg/content-schema";
import { cellAt, findPath, isWalkable, nearestWalkable, prepareDiorama, type DioramaLayout } from "@lg/core";
import { describe, expect, test } from "vitest";
import { leerContenido } from "../../../scripts/content/build.ts";
import { must, REPO_ROOT } from "./helpers.ts";

const resultado = compilarContenido(leerContenido(REPO_ROOT, "U-GALEANO"), "dev");
if (!resultado.salida) throw new Error(`U-GALEANO no compila: ${JSON.stringify(resultado.errores.slice(0, 5))}`);
const dioramas = resultado.salida.cliente["dioramas.json"] as DioramaLayout[];
const layout = (id: string): DioramaLayout => must(dioramas.find((d) => d.id === id), id);

describe("AC1: muelle y plaza compilan con atlas y capas del tamaño de sus límites", () => {
  test("muelle es un mapa de tiles con al menos 4 ids distintos", () => {
    const l = layout("muelle");
    expect(l.atlas_tiles).toBeTruthy();
    const ancho = l.bounds.maxX - l.bounds.minX;
    const alto = l.bounds.maxZ - l.bounds.minZ;
    const suelo = must(l.tiles?.find((t) => t.capa === "suelo"), "capa suelo");
    expect(suelo.filas).toHaveLength(alto);
    for (const fila of suelo.filas) expect(fila.trim().split(/\s+/)).toHaveLength(ancho);
    const ids = new Set((l.tiles ?? []).flatMap((t) => t.filas.flatMap((f) => f.trim().split(/\s+/))).filter((c) => c !== "0"));
    expect(ids.size).toBeGreaterThanOrEqual(4);
    for (const id of ids) expect(Number(id)).toBeLessThanOrEqual(8);
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
