// book-mode slice-1 M1 (D-804/D-805): universe namespacing in the reader and the build.
// Proves that the reader with --universe normalizes to canonical paths, that the legacy reader is not contaminated with
// content/universes/, and that a head-only universe compiles as a scaffold (AC2).
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilarContenido } from "@lg/content-schema";
import { afterAll, describe, expect, test } from "vitest";
import { construir, leerContenido, vaciarSalida } from "./build.ts";

const REPO = fileURLToPath(new URL("../..", import.meta.url));

const temporales: string[] = [];
afterAll(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });

/** temporary root with a universe: content/universes/<id>/manifiesto.yaml (+ optional extra files). */
const rootConUniverso = (id: string, manifiesto: string, extra: Record<string, string> = {}): string => {
  const root = mkdtempSync(join(tmpdir(), "lg-univ-"));
  temporales.push(root);
  const dir = join(root, "content", "universes", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifiesto.yaml"), manifiesto);
  for (const [rel, texto] of Object.entries(extra)) {
    const p = join(dir, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, texto);
  }
  return root;
};

const MANIFIESTO_OK = [
  "id: U-GALEANO",
  'titulo: "Mundo Rush — Las venas abiertas (Potosí)"',
  'libro_fuente: "Eduardo Galeano, Las venas abiertas de América Latina (1971)"',
  "par_idioma:",
  "  l1: es-AR",
  "  l2: en",
  "",
].join("\n");

describe("M1 reader: namespacing de universos", () => {
  test("con --universe normaliza content/universes/<id>/<sub> a content/<sub> (RUTAS matchea sin cambios)", () => {
    const root = rootConUniverso("U-GALEANO", MANIFIESTO_OK, { "npcs/NPC-POTOSI.yaml": "id: NPC-POTOSI\n" });
    const rutas = leerContenido(root, "U-GALEANO").map((a) => a.ruta).sort();
    expect(rutas).toEqual(["content/manifiesto.yaml", "content/npcs/NPC-POTOSI.yaml"]);
  });

  test("el lector legacy (sin universo) NO desciende a content/universes/ (AC1/C-B)", () => {
    // The real repo already has content/universes/U-GALEANO/manifiesto.yaml; it must not appear in the farmer tree.
    const rutas = leerContenido(REPO).map((a) => a.ruta);
    expect(rutas.some((r) => r.startsWith("content/universes/"))).toBe(false);
    expect(rutas.some((r) => r === "content/manifiesto.yaml")).toBe(false);
  });
});

describe("M1 build: scaffold de un universo con solo cabeza (AC2)", () => {
  const log = (): void => {};

  test("manifiesto válido y sin dataset ⇒ exit 0 (scaffold)", () => {
    const root = rootConUniverso("U-GALEANO", MANIFIESTO_OK);
    expect(construir({ root, modo: "dev", universe: "U-GALEANO", log })).toBe(0);
  });

  test("manifiesto inválido ⇒ exit 1", () => {
    const root = rootConUniverso("U-GALEANO", "id: galeano-mal\ntitulo: x\n");
    expect(construir({ root, modo: "dev", universe: "U-GALEANO", log })).toBe(1);
  });

  test("universo sin manifiesto ⇒ exit 1", () => {
    const root = mkdtempSync(join(tmpdir(), "lg-univ-"));
    temporales.push(root);
    mkdirSync(join(root, "content", "universes", "U-GALEANO"), { recursive: true });
    writeFileSync(join(root, "content", "universes", "U-GALEANO", "npcs.yaml"), "id: x\n");
    expect(construir({ root, modo: "dev", universe: "U-GALEANO", log })).toBe(1);
  });

  // M3 (AC6): the real repo already has the complete Galeano R1 dataset, so --universe=U-GALEANO routes to the
  // full compiler (not to M1's scaffold). It is verified with the PURE compiler (compilarContenido), which does not
  // write output, so as not to touch the operator's real stores (lesson 2026-10-08). `construir` would write.
  test("el repo real con --universe=U-GALEANO compila el dataset completo (AC6, sin escribir)", () => {
    const r = compilarContenido(leerContenido(REPO, "U-GALEANO"), "dev");
    expect(r.errores).toEqual([]);
    expect(r.conjunto.universo?.id).toBe("U-GALEANO");
  });
});

describe("J-1: the default build keeps the other universes' output", () => {
  const salida = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "lg-salida-"));
    temporales.push(dir);
    writeFileSync(join(dir, "misiones.json"), "[]");
    mkdirSync(join(dir, "viejo"));
    mkdirSync(join(dir, "U-GALEANO"));
    writeFileSync(join(dir, "U-GALEANO", "dioramas.json"), "[]");
    return dir;
  };

  test("without universe: removes its own files and keeps U-* folders", () => {
    const dir = salida();
    vaciarSalida(dir);
    expect(readdirSync(dir)).toEqual(["U-GALEANO"]);
    expect(readdirSync(join(dir, "U-GALEANO"))).toEqual(["dioramas.json"]);
  });

  test("with universe: empties only that universe's folder", () => {
    const dir = salida();
    vaciarSalida(join(dir, "U-GALEANO"), "U-GALEANO");
    expect(readdirSync(join(dir, "U-GALEANO"))).toEqual([]);
    expect(readdirSync(dir).sort()).toEqual(["U-GALEANO", "misiones.json", "viejo"]);
  });
});
