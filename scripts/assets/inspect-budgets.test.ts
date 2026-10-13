// Plan estetica-c M2: inspect-budgets mide piezas y dioramas y check:budgets lo usa contra assets_muelle_mb y
// assets_muelle_plaza_mb (03 §2.7.3). Con dientes: un muelle sintético pesado y una pieza con textura fallan.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loadBudgets } from "../budgets/bundle-size.ts";
import { chequearDescarga, listarModelos, medirDioramas, medirPieza, run, type PiezaMedida } from "./inspect-budgets.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const B = loadBudgets();
const pieza = (archivo: string, bytes: number, extra: Partial<PiezaMedida> = {}): PiezaMedida =>
  ({ archivo, bytes, triangulos: 1000, primitivas: 1, materiales: 0, texturas: 0, conColor: true, ...extra });
const modelo = (n: string) => `modelo/pack/${n}`;
const archivo = (n: string) => `apps/web/public/models/pack/${n}.glb`;

describe("inspect-budgets sobre el árbol real", () => {
  test("mide las piezas servidas y pasa (exit 0)", async () => {
    const modelos = listarModelos(ROOT);
    expect(modelos.length).toBeGreaterThanOrEqual(2);
    const conMalla = modelos.find((m) => !m.endsWith("/animaciones.glb")) as string; // el archivo de clips no tiene mallas
    const p = await medirPieza(conMalla, new Uint8Array(readFileSync(join(ROOT, conMalla))));
    expect(p.triangulos).toBeGreaterThan(0);
    expect(p.texturas).toBe(0);
    expect(p.conColor).toBe(true);
    const lineas: string[] = [];
    expect(await run(ROOT, (l) => lineas.push(l))).toBe(0);
    // Plan estetica-c M3: el diorama de prueba baja sus 2 modelos más los 4 archivos de personaje, dentro del tope de muelle.
    expect(lineas.join("\n")).toMatch(/info diorama test: 6 modelo\(s\)/);
    expect(lineas.join("\n")).toMatch(/ref {2}diorama test contra assets_muelle_mb/);
  });
});

describe("presupuestos de descarga (03 §2.7.3)", () => {
  const piezas = [pieza(archivo("a"), 4_000_000), pieza(archivo("b"), 3_000_000), pieza(archivo("c"), 9_000_000)];
  const mapa = new Map(piezas.map((p) => [p.archivo, p]));

  test("los archivos de personaje entran en la descarga de cada diorama (una vez, aunque un prop repita el archivo)", () => {
    const [d] = medirDioramas([{ id: "muelle", props: [{ asset: modelo("a") }] }], mapa, [archivo("b"), archivo("a")]);
    expect(d?.modelos).toEqual([archivo("a"), archivo("b")]);
    expect(d?.bytes).toBe(7_000_000);
    // 7 MB pasan el tope de 6 MB de muelle: los personajes cuentan contra el presupuesto.
    expect(chequearDescarga(piezas, [d as NonNullable<typeof d>], B).ok).toBe(7 <= B.assets_muelle_mb);
  });

  test("un modelo repetido se cuenta una vez en bytes y por cada aparición en triángulos", () => {
    const [d] = medirDioramas([{ id: "muelle", props: [{ asset: modelo("a") }, { asset: modelo("a") }, { asset: "codigo/caja" }] }], mapa);
    expect(d?.modelos).toEqual([archivo("a")]);
    expect(d?.bytes).toBe(4_000_000);
    expect(d?.triangulos).toBe(2000);
  });

  test("teeth: un muelle de más de assets_muelle_mb falla", () => {
    const dioramas = medirDioramas([{ id: "muelle", props: [{ asset: modelo("a") }, { asset: modelo("b") }] }], mapa);
    const r = chequearDescarga(piezas, dioramas, B);
    expect(r.ok).toBe(false);
    expect(r.lineas.join("\n")).toContain("FAIL assets del primer diorama: 7.000 MB de modelos (tope 6 MB, assets_muelle_mb)");
  });

  test("teeth: muelle + plaza de más de assets_muelle_plaza_mb falla, aunque cada uno entre solo", () => {
    const dioramas = medirDioramas([
      { id: "muelle", props: [{ asset: modelo("a") }] },
      { id: "plaza", props: [{ asset: modelo("b") }, { asset: modelo("c") }] },
    ], mapa);
    const r = chequearDescarga(piezas, dioramas, B);
    expect(r.ok).toBe(false);
    expect(r.lineas.join("\n")).toContain("OK   assets del primer diorama");
    expect(r.lineas.join("\n")).toContain("FAIL descarga inicial del vertical slice: 16.000 MB");
  });

  test("un diorama sin tope en la tabla se informa y no falla", () => {
    const r = chequearDescarga(piezas, medirDioramas([{ id: "test", props: [{ asset: modelo("c") }] }], mapa), B);
    expect(r.ok).toBe(true);
    expect(r.lineas.join("\n")).toMatch(/n\/a  assets del primer diorama: muelle todavía no existe/);
  });

  test("teeth: una pieza con textura o sin color por vértice no salió del pipeline", () => {
    expect(chequearDescarga([pieza(archivo("t"), 10, { texturas: 1 })], [], B).ok).toBe(false);
    expect(chequearDescarga([pieza(archivo("s"), 10, { conColor: false })], [], B).ok).toBe(false);
    expect(chequearDescarga([pieza(archivo("m"), 10, { materiales: 2 })], [], B).ok).toBe(false);
    expect(chequearDescarga([pieza(archivo("ok"), 10)], [], B).ok).toBe(true);
  });
});
