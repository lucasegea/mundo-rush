// Open-world-3d T7 (AC43): los árboles horneados con ez-tree. Hornear dos veces en memoria da los mismos bytes, que son
// los versionados y los del registro (sha256, triángulos, generador con su sha256, preset y semilla); cada .glb tiene
// solo POSITION, NORMAL, TEXCOORD_0 y COLOR_0, sin materiales, texturas ni imágenes; el liviano tiene a lo sumo el 35 %
// de los triángulos del completo; ningún script usa GLTFExporter ni define FileReader; nada de apps/ ni packages/
// importa ez-tree, y el build del cliente no lo contiene.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { LIGHT_TREE_MAX_SHARE, TREE_SPECIES } from "@lg/art";
import { BAKE_SCRIPT, bakeAll, sha256 } from "./bake-trees.ts";
import { readGlbChunks } from "./glb-write.ts";
import { medirPieza } from "./inspect-budgets.ts";
import { leerRegistro } from "./optimize.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const walk = (dir: string, keep: (rel: string) => boolean, skip = /(^|\/)(node_modules|dist|public|\.vitest|coverage)(\/|$)/): string[] => {
  const out: string[] = [];
  const go = (abs: string): void => {
    for (const name of readdirSync(abs)) {
      const p = join(abs, name);
      const rel = relative(ROOT, p).replace(/\\/g, "/");
      if (skip.test(rel)) continue;
      if (statSync(p).isDirectory()) go(p);
      else if (keep(rel)) out.push(rel);
    }
  };
  if (existsSync(dir)) go(dir);
  return out;
};

describe("bake-trees (AC43)", async () => {
  const first = await bakeAll(ROOT);
  const second = await bakeAll(ROOT);
  const { assets } = leerRegistro(ROOT);
  const porArchivo = new Map(assets.map((a) => [a.archivo, a]));
  const generador = sha256(new Uint8Array(readFileSync(join(ROOT, BAKE_SCRIPT))));

  test("dos horneados dan los mismos bytes, que son los versionados y los del registro", () => {
    expect(first).toHaveLength(TREE_SPECIES.length * 2);
    first.forEach((t, i) => {
      expect(sha256(t.glb), t.file).toBe(sha256((second[i] as typeof t).glb));
      expect(sha256(t.glb), t.file).toBe(sha256(new Uint8Array(readFileSync(join(ROOT, t.file)))));
      const fila = porArchivo.get(t.file);
      expect(fila, t.file).toBeDefined();
      expect(fila?.procedencia).toBe("generated");
      expect(fila?.sha256).toBe(sha256(t.glb));
      expect(fila?.generador).toEqual({ archivo: BAKE_SCRIPT, sha256: generador, preset: t.preset, semilla: t.seed });
      expect(fila?.triangulos).toBe(t.triangles);
      expect(fila?.primitivas).toBe(1);
      expect(fila?.licencia).toBe("MIT");
    });
  });

  test("cada .glb tiene solo los cuatro atributos del pipeline y nada de material, textura o imagen", async () => {
    for (const t of first) {
      const { json } = readGlbChunks(t.glb);
      expect(json["materials"], t.file).toBeUndefined();
      expect(json["textures"], t.file).toBeUndefined();
      expect(json["images"], t.file).toBeUndefined();
      const meshes = json["meshes"] as { primitives: { attributes: Record<string, number>; material?: number }[] }[];
      for (const m of meshes) for (const p of m.primitives) {
        expect(Object.keys(p.attributes), t.file).toEqual(["POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0"]);
        expect(p.material, t.file).toBeUndefined();
      }
      const medida = await medirPieza(t.file, t.glb);
      expect(medida).toMatchObject({ triangulos: t.triangles, primitivas: 1, materiales: 0, texturas: 0, conColor: true });
    }
  });

  test("el liviano de cada especie tiene a lo sumo el 35 % de los triángulos del completo", () => {
    for (const sp of TREE_SPECIES) {
      const full = first.find((t) => t.species === sp && !t.light);
      const light = first.find((t) => t.species === sp && t.light);
      expect(full && light, sp.name).toBeTruthy();
      // AC43 ("the light build has at most 35 percent of the full build's triangles"), fix 1 de QA: el tope es el
      // literal del plan, no la constante que el código podría aflojar.
      expect((light?.triangles ?? Infinity) / (full?.triangles ?? 1), sp.name).toBeLessThanOrEqual(0.35);
    }
    expect(LIGHT_TREE_MAX_SHARE).toBe(0.35);
  });

  test("ningún script usa GLTFExporter ni define FileReader", () => {
    const scripts = walk(join(ROOT, "scripts"), (rel) => /\.(ts|js|mjs)$/.test(rel) && !rel.endsWith(".test.ts"));
    expect(scripts.length).toBeGreaterThan(20);
    const malos = scripts.filter((rel) => /import[^;]*\bGLTFExporter\b|\b(class|function|const|let|var)\s+FileReader\b|globalThis\.FileReader\s*=/.test(readFileSync(join(ROOT, rel), "utf8")));
    expect(malos).toEqual([]);
  });

  test("nada de apps/ ni packages/ importa ez-tree, y el build del cliente no lo contiene", () => {
    const fuentes = [...walk(join(ROOT, "apps"), (rel) => /\.(ts|tsx|js|mjs)$/.test(rel)), ...walk(join(ROOT, "packages"), (rel) => /\.(ts|tsx|js|mjs)$/.test(rel))];
    expect(fuentes.length).toBeGreaterThan(50);
    expect(fuentes.filter((rel) => /(\bfrom\s*|\bimport\s*\(?\s*)["'][^"']*(tooling\/vendor\/ez-tree|@dgreenheck\/ez-tree)/.test(readFileSync(join(ROOT, rel), "utf8")))).toEqual([]);
    const dist = walk(join(ROOT, "apps/web/dist"), () => true, /(^|\/)node_modules(\/|$)/);
    expect(dist.filter((rel) => /ez-tree|loadFromJson/.test(readFileSync(join(ROOT, rel), "latin1")))).toEqual([]);
  });
});
