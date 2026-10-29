// Plan estetica-c M2 (03 §6.4.2, D-153): teeth del registro de licencias en validate:content. Un .glb servido sin
// registro, una licencia no comercial, una atribución obligatoria ausente de los créditos y un `modelo/*` de diorama sin
// registro hacen fallar la compilación; el contenido real con los archivos reales compila.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { compilarContenido, formatearHallazgo, LICENCIAS_PERMITIDAS, licenciaPermitida } from "@lg/content-schema";
import type { ArchivoFuente, Hallazgo } from "@lg/content-schema";
import { construir, leerContenido, leerPublicos } from "./build.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REAL = leerContenido(ROOT);
const PUBLICOS = leerPublicos(ROOT);
const REG = "content/assets-registry.yaml";
const GALLINERO = "apps/web/public/models/quaternius-farm-buildings/gallinero.glb";

const mut = (ruta: string, viejo: string, nuevo: string): ArchivoFuente[] => {
  const f = REAL.find((a) => a.ruta === ruta);
  if (!f) throw new Error(`no existe ${ruta}`);
  if (!f.texto.includes(viejo)) throw new Error(`"${viejo}" no está en ${ruta}`);
  return REAL.map((a) => (a.ruta === ruta ? { ruta, texto: a.texto.replace(viejo, nuevo) } : a));
};
const errores = (archivos: readonly ArchivoFuente[], publicos: readonly string[] = PUBLICOS): Hallazgo[] =>
  compilarContenido(archivos, "dev", publicos).errores;
const conError = (hs: readonly Hallazgo[], archivo: string, fragmento: string): void => {
  const hit = hs.some((h) => h.archivo === archivo && h.regla === "registro-assets" && h.mensaje.includes(fragmento));
  expect(hit, `se esperaba registro-assets en ${archivo} con "${fragmento}"; hubo:\n${hs.map(formatearHallazgo).join("\n")}`).toBe(true);
};

const temporales: string[] = [];
afterAll(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });

describe("registro de assets: contenido y archivos reales", () => {
  test("compila sin errores, mide algo y los props modelo/* del diorama de prueba tienen registro", () => {
    expect(PUBLICOS).toContain(GALLINERO);
    expect(PUBLICOS.filter((p) => p.endsWith(".glb")).length).toBeGreaterThanOrEqual(2);
    const r = compilarContenido(REAL, "dev", PUBLICOS);
    expect(r.errores.map(formatearHallazgo)).toEqual([]);
    expect(r.conjunto.registroAssets?.data.assets.length).toBeGreaterThanOrEqual(2);
    const test = r.conjunto.dioramas.find((d) => d.data.id === "test");
    expect((test?.data.props ?? []).filter((p) => p.asset.startsWith("modelo/")).length).toBeGreaterThanOrEqual(2);
    expect(r.salida?.cliente["creditos.json"]).toEqual({ atribuciones: [] });
  });

  test("V1 a V5 cerradas: cada pack evaluado tiene estado y razón, y hay descartados con su porqué", () => {
    const packs = compilarContenido(REAL).conjunto.registroAssets?.data.packs ?? [];
    for (const v of ["V1", "V2", "V3", "V4", "V5"]) expect(packs.some((p) => p.verificacion.includes(v as never)), v).toBe(true);
    const descartados = packs.filter((p) => p.estado === "descartado").map((p) => p.id).sort();
    expect(descartados).toEqual(["mixamo", "quaternius-medieval-village-megakit", "quaternius-stylized-nature-megakit"]);
    expect(packs.find((p) => p.id === "synty-polygon")?.estado).toBe("diferido");
  });
});

describe("teeth del registro (validate:content falla)", () => {
  test("un .glb en public/models sin registro", () => {
    conError(errores(REAL, [...PUBLICOS, "apps/web/public/models/suelto/pieza.glb"]), "apps/web/public/models/suelto/pieza.glb", "sin registro");
  });

  test("una textura o un audio servidos sin registro también", () => {
    conError(errores(REAL, [...PUBLICOS, "apps/web/public/textures/x.png"]), "apps/web/public/textures/x.png", "sin registro");
    conError(errores(REAL, [...PUBLICOS, "apps/web/public/audio/sfx/x.ogg"]), "apps/web/public/audio/sfx/x.ogg", "sin registro");
  });

  // M3, nota N1 de QA en M2: lista cerrada. Cada grafía de "uso personal" y "no comercial" (con y sin tilde, en
  // cualquier caja) falla, igual que una licencia desconocida.
  const RECHAZADAS = [
    "sólo uso personal", "solo uso personal", "SÓLO USO PERSONAL", "Solo Uso Personal", "sólo_uso_personal", "uso personal",
    "Uso Personal", "USO PERSONAL", "no comercial", "No Comercial", "NO COMERCIAL", "no-comercial", "nó comercial",
    "CC-BY-NC-4.0", "non-commercial", "Personal use only", "Standard License (personal)", "comercial-con-modificacion", "",
  ];

  test("una licencia fuera de la lista cerrada (cada forma rechazada, en una fila de asset)", () => {
    const licencia = "    licencia: CC0-1.0\n    url_origen: https://poly.pizza/m/DM0F8siLam";
    for (const mal of RECHAZADAS.filter((m) => m !== "")) {
      conError(errores(mut(REG, licencia, `    licencia: "${mal}"\n    url_origen: https://poly.pizza/m/DM0F8siLam`)), REG, "fuera de la lista permitida");
    }
  });

  // Cambio registrado (open-world-3d T2(c), D-831): la aserción vieja era toEqual(["CC0-1.0", "CC-BY-4.0"]); la lista
  // cerrada pasa a la política D1 de libre uso. Las grafías rechazadas de abajo siguen rechazadas, sin excepción.
  test("la lista cerrada D1 (con su grafía normalizada)", () => {
    expect(LICENCIAS_PERMITIDAS).toEqual([
      "CC0-1.0", "CC-BY-3.0", "CC-BY-4.0", "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Zlib", "OFL-1.1",
    ]);
    for (const ok of ["CC0-1.0", "cc0 1.0", " CC0_1.0 ", "CC-BY-4.0", "cc-by 4.0"]) expect(licenciaPermitida(ok), ok).not.toBeNull();
    for (const mal of RECHAZADAS) expect(licenciaPermitida(mal), mal).toBeNull();
  });

  test("un pack usado con licencia fuera de la lista falla; uno descartado puede nombrarla (es el registro de la evaluación)", () => {
    const pack = "    licencia: CC0-1.0\n    url: https://quaternius.com/packs/farmbuildings.html";
    conError(errores(mut(REG, pack, "    licencia: sólo uso personal\n    url: https://quaternius.com/packs/farmbuildings.html")), REG, "fuera de la lista permitida");
    expect(errores(REAL).map(formatearHallazgo)).toEqual([]); // mixamo (descartado) no es CC0 y el registro real compila
  });

  test("CC-BY-4.0 exige atribucion_requerida: true", () => {
    const licencia = "    licencia: CC0-1.0\n    url_origen: https://poly.pizza/m/DM0F8siLam";
    conError(errores(mut(REG, licencia, "    licencia: CC-BY-4.0\n    url_origen: https://poly.pizza/m/DM0F8siLam")), REG, "lleva atribucion_requerida: true");
  });

  test("un registro con atribución obligatoria ausente de los créditos", () => {
    const viejo = "    atribucion_requerida: false\n    bisel: aceptado\n    bisel_razon: >-\n      Low-poly";
    conError(errores(mut(REG, viejo, viejo.replace("false", "true"))), REG, "no aparece en content/creditos.yaml");
    // con su entrada en los créditos, pasa
    const conCredito = mut(REG, viejo, viejo.replace("false", "true")).map((a) => (a.ruta === "content/creditos.yaml"
      ? { ruta: a.ruta, texto: a.texto.replace("atribuciones: []", "atribuciones:\n  - { pack: quaternius-farm-buildings, texto: Modelos de Quaternius }") }
      : a));
    expect(errores(conCredito).filter((h) => h.regla === "registro-assets").map(formatearHallazgo)).toEqual([]);
  });

  test("un registro que nombra un archivo que no está servido", () => {
    conError(errores(REAL, PUBLICOS.filter((p) => p !== GALLINERO)), REG, "que no existe");
  });

  test("un modelo/* de diorama sin registro, o sin tam", () => {
    const d = "content/dioramas/test.yaml";
    conError(errores(mut(d, "modelo/quaternius-farm-buildings/gallinero", "modelo/quaternius-farm-buildings/inexistente")), d, "\"modelo/quaternius-farm-buildings/inexistente\" no tiene registro");
    conError(errores(mut(d, "modelo/quaternius-farm-buildings/gallinero, pos: [-12.5, 0, 8], tam: [3, 2.3, 2.7]", "modelo/quaternius-farm-buildings/gallinero, pos: [-12.5, 0, 8]")), d, "necesita tam");
  });

  test("un pack descartado no se puede usar", () => {
    conError(errores(mut(REG, "    pack: quaternius-farm-buildings\n    autor: Quaternius\n    licencia: CC0-1.0\n    url_origen: https://poly.pizza/m/DM0F8siLam",
      "    pack: quaternius-medieval-village-megakit\n    autor: Quaternius\n    licencia: CC0-1.0\n    url_origen: https://poly.pizza/m/DM0F8siLam")), REG, "está descartado");
  });

  test("de punta a punta: validate:content sobre un árbol con un .glb suelto sale con 1 y no escribe nada", () => {
    const dir = mkdtempSync(join(tmpdir(), "lg-m2-"));
    temporales.push(dir);
    cpSync(join(ROOT, "content"), join(dir, "content"), { recursive: true });
    cpSync(join(ROOT, "apps/web/public/models"), join(dir, "apps/web/public/models"), { recursive: true });
    // Open-world-3d T6: los .ktx2 del suelo también son servidos con fila en el registro.
    cpSync(join(ROOT, "apps/web/public/textures"), join(dir, "apps/web/public/textures"), { recursive: true });
    const log: string[] = [];
    expect(construir({ root: dir, modo: "dev", log: (x) => log.push(x) })).toBe(0);
    mkdirSync(join(dir, "apps/web/public/models/suelto"), { recursive: true });
    writeFileSync(join(dir, "apps/web/public/models/suelto/pieza.glb"), "glTF");
    rmSync(join(dir, "apps/web/public/content"), { recursive: true, force: true });
    const log2: string[] = [];
    expect(construir({ root: dir, modo: "dev", log: (x) => log2.push(x) })).toBe(1);
    expect(log2.join("\n")).toContain("apps/web/public/models/suelto/pieza.glb [registro-assets] archivo servido sin registro");
  });
});
