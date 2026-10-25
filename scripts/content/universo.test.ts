// book-mode slice-1 M1 (D-804/D-805): namespacing de universos en el reader y el build.
// Prueba que el lector con --universe normaliza a rutas canónicas, que el lector legacy no se contamina con
// content/universes/, y que un universo con solo cabeza compila como scaffold (AC2).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { construir, leerContenido } from "./build.ts";

const REPO = fileURLToPath(new URL("../..", import.meta.url));

const temporales: string[] = [];
afterAll(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });

/** root temporal con un universo: content/universes/<id>/manifiesto.yaml (+ archivos extra opcionales). */
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
    // El repo real ya tiene content/universes/U-GALEANO/manifiesto.yaml; no debe aparecer en el árbol campesino.
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

  // El repo real: la cabeza U-GALEANO versionada sale 0 como scaffold. Scaffold NO escribe salida, así que
  // esto no toca los stores reales del operador (lección 2026-10-08: los checks no escriben a stores reales).
  test("el repo real con --universe=U-GALEANO compila la cabeza versionada (exit 0, sin escribir)", () => {
    expect(construir({ root: REPO, modo: "dev", universe: "U-GALEANO", log })).toBe(0);
  });
});
