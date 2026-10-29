// Open-world-3d T7 (AC42, D-829): las rocas, la hoja y la corteza de scripts/assets/nature.ts. Cada archivo tiene su fila
// (CC0, derived, el sha256 servido, los originales con su sha256 y url) y lo servido es lo que la fila dice; las rocas
// son .glb del pipeline (sin material ni textura, COLOR_0, meshopt, UV dentro de su cuarto del atlas) con los
// triángulos de la fila. Con los originales en assets-src/, rehacer las rocas da los mismos bytes (la codificación de
// los .ktx2 la prueba `node scripts/assets/nature.ts --check` y refetch.ts, que tardan más que el test).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dequantize } from "@gltf-transform/functions";
import { describe, expect, test } from "vitest";
import { ROCK_SCANS } from "@lg/art";
import { medirPieza } from "./inspect-budgets.ts";
import { NATURE_CACHE, NATURE_JOBS, rockCell, sha256 } from "./nature.ts";
import { crearIO, leerRegistro } from "./optimize.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("nature.ts (AC42)", () => {
  const { assets } = leerRegistro(ROOT);
  const porArchivo = new Map(assets.map((a) => [a.archivo, a]));

  test("cada archivo tiene su fila CC0 derived con el sha256 servido y todos sus originales", () => {
    expect(NATURE_JOBS).toHaveLength(4 + ROCK_SCANS.length * 2);
    for (const job of NATURE_JOBS) {
      const fila = porArchivo.get(job.file);
      expect(fila, job.file).toBeDefined();
      expect(fila).toMatchObject({ pack: "polyhaven", licencia: "CC0-1.0", procedencia: "derived", atribucion_requerida: false });
      expect(fila?.sha256, job.file).toBe(sha256(new Uint8Array(readFileSync(join(ROOT, job.file)))));
      const urls = [fila?.url_origen, ...(fila?.fuentes_extra ?? []).map((f) => f.url)];
      expect(urls, job.file).toEqual(job.sources.map((s) => s.url));
      expect(fila?.modificaciones, job.file).toMatch(/scripts\/assets\/nature\.ts/);
    }
  });

  test("las rocas: sin material ni textura, COLOR_0, meshopt, UV en su cuarto del atlas, triángulos de la fila", async () => {
    const io = await crearIO();
    for (const job of NATURE_JOBS.filter((j) => j.file.endsWith(".glb"))) {
      const bytes = new Uint8Array(readFileSync(join(ROOT, job.file)));
      const fila = porArchivo.get(job.file);
      const m = await medirPieza(job.file, bytes);
      expect(m, job.file).toMatchObject({ materiales: 0, texturas: 0, conColor: true, triangulos: fila?.triangulos, primitivas: fila?.primitivas });
      const doc = await io.readBinary(bytes);
      expect(doc.getRoot().listExtensionsUsed().map((e) => e.extensionName), job.file).toContain("EXT_meshopt_compression");
      await doc.transform(dequantize());
      const i = ROCK_SCANS.findIndex((r) => job.file.includes(r.scan.replace(/_/g, "-")));
      const [cx, cy] = rockCell(i);
      for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
        const uv = p.getAttribute("TEXCOORD_0");
        const [u0, v0] = uv?.getMin([]) ?? [];
        const [u1, v1] = uv?.getMax([]) ?? [];
        expect(u0, job.file).toBeGreaterThanOrEqual(cx / 2);
        expect(u1, job.file).toBeLessThanOrEqual((cx + 1) / 2);
        expect(v0, job.file).toBeGreaterThanOrEqual(cy / 2);
        expect(v1, job.file).toBeLessThanOrEqual((cy + 1) / 2);
      }
    }
  });

  const rocas = NATURE_JOBS.filter((j) => j.file.endsWith(".glb"));
  const conOriginales = rocas.every((j) => j.sources.every((s) => existsSync(join(ROOT, NATURE_CACHE, s.file))));
  test.skipIf(!conOriginales)("con los originales en assets-src/, rehacer cada roca da los bytes servidos", async () => {
    for (const job of rocas) {
      const { bytes } = await job.make(ROOT, new Uint8Array());
      expect(sha256(bytes), job.file).toBe(sha256(new Uint8Array(readFileSync(join(ROOT, job.file)))));
    }
  });
});
