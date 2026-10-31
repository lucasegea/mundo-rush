// open-world-3d AC74, QA's fix 1 (finding 6): the chosen PD-4 step's row is what @lg/art serves. Before, the
// "normals from 1024 to 512" cut also lowered the rocks' 2 × 2 atlas, the row said 19.9 / 23.9 MB against
// the inventory's 20.9 / 24.9, and step 1 appeared to fit while the code fixed step 2 (D-832).
// Recorded change (open-world-3d T7b, D-841): OPEN_WORLD_TEXTURES became `worldTextures(look)`; the test runs over
// each look of the catalog (DEFAULT_LOOK included) with its own download, without changing any cap.
import { DEFAULT_LOOK, TIER_BUDGETS, WORLD_LOOKS, WORLD_TIERS, worldTextures } from "@lg/art";
import { describe, expect, test } from "vitest";
import { loadBudgets } from "../budgets/bundle-size.ts";
import { evaluate, otherDownloads, run, totals } from "./texture-table.ts";

describe("texture-table (AC74)", () => {
  test.each(Object.values(WORLD_LOOKS))("look $id: el paso elegido es el 2 y su fila coincide con el inventario versionado", (look) => {
    const capMb = loadBudgets().assets_muelle_mb;
    const others = otherDownloads(look);
    const invList = worldTextures(look);
    const { rows, chosen } = evaluate(others, capMb, invList);
    expect(chosen).toBe(2);
    const row = rows.find((r) => r.step === chosen)?.t;
    const inv = totals(invList, others, capMb);
    for (const tier of WORLD_TIERS) expect(row?.gpuMb[tier], tier).toBeCloseTo(inv.gpuMb[tier], 6);
    expect(row?.downloadMb).toBeCloseTo(inv.downloadMb, 6);
    expect(inv.fits).toBe(true);
    // LK4: each look fits alone in the usual caps (24 / 48 / 96 MB and the 6 MB download).
    for (const tier of WORLD_TIERS) expect(inv.gpuMb[tier], tier).toBeLessThanOrEqual(TIER_BUDGETS[tier].maxTextureMb);
    expect(inv.downloadMb).toBeLessThanOrEqual(capMb);
  });

  test("run() imprime la tabla de cada look del catálogo y sale con 0 (LK4)", () => {
    const lines: string[] = [];
    expect(run([], (l) => lines.push(l))).toBe(0);
    const text = lines.join("\n");
    for (const look of Object.values(WORLD_LOOKS)) {
      expect(text).toContain(`look \`${look.id}\``);
      expect(text).toContain(`Inventario versionado (@lg/art), look ${look.id}: `);
      expect(text).toMatch(new RegExp(`look ${look.id}: GPU [^\\n]*; entra\\.`));
    }
  });

  test("DEFAULT_LOOK da los números de 0034931 (T7: 14,6 / 20,9 / 24,9 MB, descarga 3,68 MB)", () => {
    const capMb = loadBudgets().assets_muelle_mb;
    const inv = totals(worldTextures(DEFAULT_LOOK), otherDownloads(DEFAULT_LOOK), capMb);
    expect(inv.gpuMb.low.toFixed(1)).toBe("14.6");
    expect(inv.gpuMb.medium.toFixed(1)).toBe("20.9");
    expect(inv.gpuMb.high.toFixed(1)).toBe("24.9");
    expect(inv.downloadMb.toFixed(2)).toBe("3.68");
  });
});
