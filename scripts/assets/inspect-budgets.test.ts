// Plan estetica-c M2: inspect-budgets mide piezas y dioramas y check:budgets lo usa contra assets_muelle_mb y
// assets_muelle_plaza_mb (03 §2.7.3). Con dientes: un muelle sintético pesado y una pieza con textura fallan.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loadBudgets } from "../budgets/bundle-size.ts";
import {
  cargaMundoAbierto, chequearCargaRegistrada, chequearDescarga, chequearMedidasRegistro, DECODIFICADOR_BASIS, listarModelos, medirDioramas, medirPieza, run,
  type PiezaMedida,
} from "./inspect-budgets.ts";

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
    // Plan estetica-c M3: el diorama de prueba baja sus 2 modelos más los archivos de personaje, dentro del tope de muelle.
    // M6: 3 cuerpos, 3 cuerpos reducidos de `low` y el de clips (cota de arriba: un tier baja unos u otros).
    // Cambio registrado (open-world-3d T7, AC47): la cota de arriba suma el personaje de Quaternius del mundo abierto
    // (cuerpo, -bajo y clips): 2 modelos + 10 archivos de personaje. Antes, 9.
    expect(lineas.join("\n")).toMatch(/info diorama test: 12 modelo\(s\)/);
    expect(lineas.join("\n")).toMatch(/OK {3}diorama test contra assets_muelle_mb/);
    // Plan estetica-c M5: cada fila del registro con pieza servida trae la medida que usa el estimador, y coincide.
    expect(lineas.filter((l) => /^OK {3}registro /.test(l)).length).toBe(modelos.length);
    expect(lineas.filter((l) => /^FAIL registro /.test(l))).toEqual([]);
  });
});

describe("medidas del registro (plan estetica-c M5): el estimador de validate:content cuenta con ellas", () => {
  const p = pieza(archivo("a"), 10, { triangulos: 948, primitivas: 1 });
  test("coinciden: pasa", () => {
    expect(chequearMedidasRegistro([p], [{ id: "pack/a", archivo: archivo("a"), triangulos: 948, primitivas: 1 }]).ok).toBe(true);
  });
  test("teeth: una fila sin medida o con otra medida falla nombrando la fila", () => {
    const sin = chequearMedidasRegistro([p], [{ id: "pack/a", archivo: archivo("a") }]);
    expect(sin.ok).toBe(false);
    expect(sin.lineas.join("\n")).toContain("FAIL registro pack/a: sin triangulos/primitivas; medido 948 triángulos");
    const otra = chequearMedidasRegistro([p], [{ id: "pack/a", archivo: archivo("a"), triangulos: 900, primitivas: 1 }]);
    expect(otra.ok).toBe(false);
    expect(otra.lineas.join("\n")).toContain("FAIL registro pack/a: dice 900 triángulos");
  });
  test("una fila sin pieza servida no se mide acá (la cubre el registro de licencias)", () => {
    expect(chequearMedidasRegistro([], [{ id: "pack/z", archivo: archivo("z") }])).toEqual({ ok: true, lineas: [] });
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
    const r = chequearDescarga(piezas, medirDioramas([{ id: "granja", props: [{ asset: modelo("c") }] }], mapa), B);
    expect(r.ok).toBe(true);
    expect(r.lineas.join("\n")).toMatch(/n\/a  assets del primer diorama: muelle todavía no existe/);
    expect(r.lineas.join("\n")).toMatch(/info diorama granja: 1 modelo\(s\), 9\.000 MB/);
  });

  test("teeth (M4, nota de QA M3): el diorama de prueba por encima de assets_muelle_mb falla el chequeo, no solo avisa", () => {
    expect(9).toBeGreaterThan(B.assets_muelle_mb);
    const pesado = chequearDescarga(piezas, medirDioramas([{ id: "test", props: [{ asset: modelo("c") }] }], mapa), B);
    expect(pesado.ok).toBe(false);
    expect(pesado.lineas.join("\n")).toContain(`FAIL diorama test contra assets_muelle_mb: 9.000 de ${B.assets_muelle_mb} MB`);
    const liviano = chequearDescarga(piezas, medirDioramas([{ id: "test", props: [{ asset: modelo("b") }] }], mapa), B);
    expect(liviano.ok).toBe(true);
    expect(liviano.lineas.join("\n")).toContain(`OK   diorama test contra assets_muelle_mb: 3.000 de ${B.assets_muelle_mb} MB`);
  });

  test("teeth (M4): run() sale con 1 si el diorama de prueba real se pasa del tope (check:budgets frena el build)", async () => {
    const lineas: string[] = [];
    expect(await run(ROOT, (l) => lineas.push(l), { ...B, assets_muelle_mb: 0.001 })).toBe(1);
    expect(lineas.join("\n")).toMatch(/FAIL diorama test contra assets_muelle_mb/);
  });

  test("teeth: una pieza con textura o sin color por vértice no salió del pipeline", () => {
    expect(chequearDescarga([pieza(archivo("t"), 10, { texturas: 1 })], [], B).ok).toBe(false);
    expect(chequearDescarga([pieza(archivo("s"), 10, { conColor: false })], [], B).ok).toBe(false);
    expect(chequearDescarga([pieza(archivo("m"), 10, { materiales: 2 })], [], B).ok).toBe(false);
    expect(chequearDescarga([pieza(archivo("ok"), 10)], [], B).ok).toBe(true);
  });
});

describe("open-world-3d T6 (AC42, cambio registrado): la carga del muelle del mundo abierto", () => {
  test("el árbol real: el muelle de U-GALEANO cuenta modelos, .ktx2 del suelo y transcodificador, todos con fila", async () => {
    const lineas: string[] = [];
    expect(await run(ROOT, (l) => lineas.push(l))).toBe(0);
    const texto = lineas.join("\n");
    // T7 (cambio registrado): la carga suma los árboles horneados y las rocas; la cuenta sale de cargaMundoAbierto.
    expect(texto).toMatch(new RegExp(`OK {3}assets del primer diorama: [\\d.]+ MB \\([\\d.]+ de modelos y [\\d.]+ de ${cargaMundoAbierto().length} archivo\\(s\\) más`));
    for (const a of cargaMundoAbierto()) expect(texto).toContain(`OK   carga del muelle ${a}:`);
    expect(cargaMundoAbierto()).toEqual(expect.arrayContaining([...DECODIFICADOR_BASIS, "apps/web/public/textures/leafy-grass-diff.ktx2"]));
  });

  test("un diorama con relieve suma su carga; uno sin relieve no", () => {
    const carga = [{ archivo: "apps/web/public/textures/x.ktx2", bytes: 1_000_000 }];
    const [abierto, plano] = medirDioramas([
      { id: "muelle", props: [{ asset: modelo("b") }], terreno: { relieve: true } },
      { id: "plaza", props: [{ asset: modelo("b") }] },
    ], new Map([[archivo("b"), pieza(archivo("b"), 3_000_000)]]), [], carga);
    expect(abierto?.bytes).toBe(4_000_000);
    expect(plano?.bytes).toBe(3_000_000);
    expect(plano?.extras).toEqual([]);
  });

  test("teeth: un .ktx2 de 1 MB sin fila en la carga del muelle falla nombrando el archivo", () => {
    const sinFila = "apps/web/public/textures/sin-fila.ktx2";
    const r = chequearCargaRegistrada([{ archivo: "apps/web/public/textures/leafy-grass-diff.ktx2", bytes: 196_231 }, { archivo: sinFila, bytes: 1_000_000 }], new Set(["apps/web/public/textures/leafy-grass-diff.ktx2"]));
    expect(r.ok).toBe(false);
    expect(r.lineas.join("\n")).toContain(`FAIL carga del muelle ${sinFila}: 1000000 bytes; sin fila en content/assets-registry.yaml ni content/code-registry.yaml`);
    // Y un archivo de la carga que no está en disco también.
    expect(chequearCargaRegistrada([{ archivo: sinFila, bytes: null }], new Set([sinFila])).ok).toBe(false);
  });

  test("teeth: con la carga de 1 MB de más el muelle sigue contando cada byte contra assets_muelle_mb", () => {
    const pesado = [{ archivo: "apps/web/public/textures/x.ktx2", bytes: 3_500_000 }];
    const dioramas = medirDioramas([{ id: "muelle", props: [{ asset: modelo("b") }], terreno: { relieve: true } }], new Map([[archivo("b"), pieza(archivo("b"), 3_000_000)]]), [], pesado);
    const r = chequearDescarga([pieza(archivo("b"), 3_000_000)], dioramas, B);
    expect(r.ok).toBe(false);
    expect(r.lineas.join("\n")).toContain("FAIL assets del primer diorama: 6.500 MB (3.000 de modelos y 3.500 de 1 archivo(s) más");
  });
});
