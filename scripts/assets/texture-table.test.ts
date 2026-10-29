// open-world-3d AC74, fix 1 de QA (hallazgo 6): la fila del paso elegido de PD-4 es lo que sirve @lg/art. Antes el
// recorte "normales de 1024 a 512" bajaba también el atlas 2 × 2 de las rocas, la fila decía 19,9 / 23,9 MB contra
// 20,9 / 24,9 del inventario, y el paso 1 parecía entrar mientras el código fijaba el 2 (D-832).
import { OPEN_WORLD_TEXTURES, WORLD_TIERS } from "@lg/art";
import { describe, expect, test } from "vitest";
import { loadBudgets } from "../budgets/bundle-size.ts";
import { evaluate, otherDownloads, totals } from "./texture-table.ts";

describe("texture-table (AC74)", () => {
  test("el paso elegido es el 2 y su fila coincide con el inventario versionado", () => {
    const capMb = loadBudgets().assets_muelle_mb;
    const others = otherDownloads();
    const { rows, chosen } = evaluate(others, capMb);
    expect(chosen).toBe(2);
    const row = rows.find((r) => r.step === chosen)?.t;
    const inv = totals(OPEN_WORLD_TEXTURES, others, capMb);
    for (const tier of WORLD_TIERS) expect(row?.gpuMb[tier], tier).toBeCloseTo(inv.gpuMb[tier], 6);
    expect(row?.downloadMb).toBeCloseTo(inv.downloadMb, 6);
    expect(inv.fits).toBe(true);
  });
});
