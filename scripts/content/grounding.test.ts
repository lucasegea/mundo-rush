// book-mode slice-1 M4 (D-807) — fact-grounding gate: AC8 (pasa en contenido correcto) + AC9 (teeth: una tesis
// presentada como hecho hace fallar el build; revertir lo vuelve verde). El gate es la mitigación del riesgo rector.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilarContenido } from "@lg/content-schema";
import type { Resultado } from "@lg/content-schema";
import { afterAll, describe, expect, test } from "vitest";
import { construir, leerContenido } from "./build.ts";
import { chequearGrounding } from "./grounding.ts";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
type Conjunto = Resultado["conjunto"];

const conjuntoGaleano = (): Conjunto => compilarContenido(leerContenido(REPO, "U-GALEANO"), "dev").conjunto;
const clon = (c: Conjunto): Conjunto => structuredClone(c);
const def = <T>(v: T | undefined | null): T => { if (v == null) throw new Error("fixture: valor esperado ausente"); return v; };

const temporales: string[] = [];
afterAll(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });

// La línea de la tesis vaca/leche, VOCEADA con atribución en el dataset correcto ("You say it plainly when asked…").
const LINEA_ATRIBUIDA = "You say it plainly when asked well: Spain had the cow, but others drank the milk.";
// Misma tesis, presentada como HECHO pelado (sin atribución): esto es el laundering que el gate debe cazar.
const LINEA_COMO_HECHO = "Spain had the cow, but others drank the milk.";

describe("M4 grounding gate — pura (AC8) y sus dientes por chequeo", () => {
  test("AC8: el dataset U-GALEANO correcto pasa el gate (cero errores)", () => {
    expect(chequearGrounding(conjuntoGaleano())).toEqual([]);
  });

  test("(a) un saber sin clasificacion falla", () => {
    const c = clon(conjuntoGaleano());
    delete (def(c.saberes[0]).data as { clasificacion?: unknown }).clasificacion;
    const h = chequearGrounding(c);
    expect(h.some((x) => x.clave === "clasificacion" && x.regla === "grounding")).toBe(true);
  });

  test("(b) un book_fact sin fuente real falla", () => {
    const c = clon(conjuntoGaleano());
    const fact = def(c.saberes.find((e) => e.data.clasificacion === "book_fact"));
    fact.data.fuente = null;
    expect(chequearGrounding(c).some((x) => x.clave === "fuente")).toBe(true);
  });

  test("(c) una deduccion_objetivo que no resuelve falla", () => {
    const c = clon(conjuntoGaleano());
    const conv = def(c.conversaciones.find((e) => e.data.deduccion_objetivo !== undefined));
    conv.data.deduccion_objetivo = "SAB-NO-EXISTE" as typeof conv.data.deduccion_objetivo;
    expect(chequearGrounding(c).some((x) => x.clave === "deduccion_objetivo")).toBe(true);
  });

  test("(d) una tesis voceada como hecho (sin atribución) falla; con atribución pasa", () => {
    const c = clon(conjuntoGaleano());
    const conv = def(c.conversaciones.find((e) => e.data.id === "CONV-POTOSI"));
    const hecho = def(conv.data.hechos.find((x) => x.valor_en.includes("cow")));
    hecho.valor_en = LINEA_COMO_HECHO;
    expect(chequearGrounding(c).some((x) => x.clave === "linea")).toBe(true);
    hecho.valor_en = LINEA_ATRIBUIDA;
    expect(chequearGrounding(c).some((x) => x.clave === "linea")).toBe(false);
  });

  test("scoping (D-807): la campesino sin flag NO lleva clasificacion; el gate la marcaría ⇒ debe estar scopeado", () => {
    const campesino = compilarContenido(leerContenido(REPO), "dev").conjunto;
    expect(campesino.saberes.length).toBeGreaterThan(0);
    expect(campesino.saberes.every((e) => e.data.clasificacion === undefined)).toBe(true);
    // Si el gate corriera sobre la campesino la fallaría — por eso build.ts solo lo invoca con --universe.
    expect(chequearGrounding(campesino).length).toBeGreaterThan(0);
  });
});

describe("M4 grounding gate — teeth end-to-end por el build (AC9)", () => {
  /** Copia el universo real a un root temporal (nunca se toca content/ real; lección 2026-10-12). */
  const copiaUniverso = (): { root: string; conv: string } => {
    const root = mkdtempSync(join(tmpdir(), "lg-grounding-"));
    temporales.push(root);
    cpSync(join(REPO, "content", "universes", "U-GALEANO"),
      join(root, "content", "universes", "U-GALEANO"), { recursive: true });
    // open-world-3d T3: el universo compila junto con el registro global (sus NPCs usan los cuerpos registrados), y el
    // registro exige que cada archivo nombrado exista: van también los modelos servidos.
    for (const f of ["assets-registry.yaml", "creditos.yaml"]) cpSync(join(REPO, "content", f), join(root, "content", f));
    cpSync(join(REPO, "apps", "web", "public", "models"), join(root, "apps", "web", "public", "models"), { recursive: true });
    // Open-world-3d T6: los .ktx2 del suelo también son servidos con fila en el registro.
    cpSync(join(REPO, "apps", "web", "public", "textures"), join(root, "apps", "web", "public", "textures"), { recursive: true });
    return { root, conv: join(root, "content", "universes", "U-GALEANO", "conversaciones", "CONV-POTOSI.yaml") };
  };
  const log = (): void => {};

  test("correcto ⇒ exit 0; tesis-como-hecho ⇒ exit 1; revertir ⇒ exit 0", () => {
    const { root, conv } = copiaUniverso();
    expect(construir({ root, modo: "dev", universe: "U-GALEANO", log })).toBe(0);

    const original = readFileSync(conv, "utf8");
    expect(original.includes("You say it plainly when asked")).toBe(true);
    // Despoja la atribución de la línea que vocea la tesis vaca/leche: queda como hecho pelado.
    const roto = original.replace(
      "You say it plainly when asked well: Spain had the cow, but others\n      drank the milk.",
      "Spain had the cow, but others drank the milk.");
    expect(roto).not.toBe(original);
    writeFileSync(conv, roto);
    expect(construir({ root, modo: "dev", universe: "U-GALEANO", log })).toBe(1);

    writeFileSync(conv, original);
    expect(construir({ root, modo: "dev", universe: "U-GALEANO", log })).toBe(0);
  });
});
