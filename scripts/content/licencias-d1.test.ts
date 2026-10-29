// open-world-3d T2(c) (AC7, D-831): la política D1 de libre uso en el esquema. La lista cerrada exacta; cada licencia
// libre y su grafía normalizada pasan; no comercial, sin derivadas, compartir igual, GPL/LGPL/AGPL, uso personal,
// "free" y vacío fallan; las reglas de atribución, de archivo de licencia y de filas generadas; el esquema hermano de
// código; y todo el registro real (campesino y m7) sigue validando.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";
import {
  ArchivoRegistroAssets, ArchivoRegistroCodigo, compilarContenido, formatearHallazgo, LICENCIA_EZ_TREE, LICENCIAS_PERMITIDAS, licenciaPermitida,
  PackAssets, RegistroAsset, RegistroCodigo,
} from "@lg/content-schema";
import type { ArchivoFuente } from "@lg/content-schema";
import { leerContenido, leerPublicos } from "./build.ts";

/** Copia sin un campo (para probar filas a las que les falta). */
const sinCampo = (o: object, campo: string): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([k]) => k !== campo));

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REAL = leerContenido(ROOT);
const REG = "content/assets-registry.yaml";

/** Una fila de asset válida (la del gallinero, sin campos de pipeline) para variar de a un campo. */
const base = {
  id: "quaternius-farm-buildings/gallinero",
  archivo: "apps/web/public/models/quaternius-farm-buildings/gallinero.glb",
  pack: "quaternius-farm-buildings",
  autor: "Quaternius",
  licencia: "CC0-1.0",
  url_origen: "https://poly.pizza/m/DM0F8siLam",
  fecha_descarga: "2026-10-13",
  sha256_original: "138f37ba14648259e8fa841d3501ebc05ad7b997babadc6cd5572785de9e158a",
  modificaciones: "optimize.ts",
  atribucion_requerida: false,
};
const generada = {
  id: "ez-tree/pino-a", archivo: "apps/web/public/models/generated/trees/pino-a.glb", pack: "ez-tree", autor: "Mundo Rush (bake-trees.ts)",
  licencia: "MIT", archivo_licencia: LICENCIA_EZ_TREE, modificaciones: "bake-trees.ts", atribucion_requerida: false,
  procedencia: "generated", sha256: "a".repeat(64),
  generador: { archivo: "scripts/assets/bake-trees.ts", sha256: "b".repeat(64), preset: "pineA", semilla: 7 },
};
const filaCodigo = {
  id: "ez-tree/src/tree.js", archivo: "tooling/vendor/ez-tree/src/tree.js", paquete: "@dgreenheck/ez-tree@1.1.0", autor: "Daniel Greenheck",
  licencia: "MIT", archivo_licencia: LICENCIA_EZ_TREE, url_origen: "https://unpkg.com/@dgreenheck/ez-tree@1.1.0/src/tree.js",
  fecha_descarga: "2026-10-28", sha256_original: "c".repeat(64), sha256: "d".repeat(64), procedencia: "edited", editado: true,
  parche: "tooling/vendor/ez-tree/src/tree.js.patch",
};

describe("AC7: la lista cerrada D1", () => {
  test("es exactamente la de T2(c)", () => {
    expect(LICENCIAS_PERMITIDAS).toEqual([
      "CC0-1.0", "CC-BY-3.0", "CC-BY-4.0", "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Zlib", "OFL-1.1",
    ]);
  });

  test("las libres pasan, con su grafía normalizada", () => {
    const ok: [string, string][] = [
      ["CC0-1.0", "CC0-1.0"], ["cc0 1.0", "CC0-1.0"], ["CC-BY-4.0", "CC-BY-4.0"], ["cc-by 4.0", "CC-BY-4.0"], ["MIT", "MIT"], ["mit", "MIT"],
      ["Apache-2.0", "Apache-2.0"], ["apache 2.0", "Apache-2.0"], ["BSD-3-Clause", "BSD-3-Clause"], ["bsd 3-clause", "BSD-3-Clause"],
      ["ISC", "ISC"], ["isc", "ISC"], ["0BSD", "0BSD"], ["0bsd", "0BSD"], ["Zlib", "Zlib"], ["ZLIB", "Zlib"], ["OFL-1.1", "OFL-1.1"], ["ofl_1.1", "OFL-1.1"],
    ];
    for (const [texto, esperada] of ok) expect(licenciaPermitida(texto), texto).toBe(esperada);
  });

  test("no comercial, sin derivadas, compartir igual, GPL, LGPL, AGPL, uso personal, free y vacío fallan", () => {
    for (const mal of ["CC-BY-NC-4.0", "CC-BY-ND-4.0", "CC-BY-SA-4.0", "GPL-3.0", "LGPL-2.1", "AGPL-3.0", "uso personal", "personal use", "free", ""]) {
      expect(licenciaPermitida(mal), mal).toBeNull();
    }
  });
});

describe("AC7: reglas del registro de assets", () => {
  test("la fila base valida", () => {
    expect(RegistroAsset.safeParse(base).success).toBe(true);
  });

  test("una fila MIT sin archivo_licencia falla; con él pasa", () => {
    expect(RegistroAsset.safeParse({ ...base, licencia: "MIT" }).success).toBe(false);
    expect(RegistroAsset.safeParse({ ...base, licencia: "MIT", archivo_licencia: "docs/licencias/x.txt" }).success).toBe(true);
  });

  test("una fila generated sin url_origen, fecha_descarga ni sha256_original pasa con generador, MIT y el LICENSE de ez-tree", () => {
    expect(RegistroAsset.safeParse(generada).success).toBe(true);
  });

  test("una generated sin generador, o no MIT, o con otro archivo_licencia, falla", () => {
    const sinGenerador = sinCampo(generada, "generador");
    expect(RegistroAsset.safeParse(sinGenerador).success).toBe(false);
    expect(RegistroAsset.safeParse({ ...generada, licencia: "CC0-1.0" }).success).toBe(false);
    expect(RegistroAsset.safeParse({ ...generada, archivo_licencia: "docs/licencias/otra.txt" }).success).toBe(false);
  });

  test("una fila no generated sin url_origen falla (y sin fecha o sin sha256_original también)", () => {
    for (const campo of ["url_origen", "fecha_descarga", "sha256_original"] as const) {
      const sin = sinCampo(base, campo);
      expect(RegistroAsset.safeParse(sin).success, campo).toBe(false);
    }
  });

  test("un CC-BY sin atribucion_requerida: true y su línea en los créditos falla al compilar", () => {
    const mut = (viejo: string, nuevo: string): ArchivoFuente[] => REAL.map((a) => (a.ruta === REG ? { ruta: REG, texto: a.texto.replace(viejo, nuevo) } : a));
    const licencia = "    licencia: CC0-1.0\n    url_origen: https://poly.pizza/m/DM0F8siLam";
    expect(REAL.find((a) => a.ruta === REG)?.texto).toContain(licencia);
    const sinAtribucion = compilarContenido(mut(licencia, "    licencia: CC-BY-4.0\n    url_origen: https://poly.pizza/m/DM0F8siLam"), "dev", leerPublicos(ROOT));
    expect(sinAtribucion.errores.map(formatearHallazgo).join("\n")).toContain("lleva atribucion_requerida: true");
  });

  test("PackAssets acepta verificacion D1", () => {
    const pack = { id: "ez-tree", nombre: "ez-tree", autor: "Daniel Greenheck", licencia: "MIT", url: "https://github.com/dgreenheck/ez-tree",
      fecha_acceso: "2026-10-28", verificacion: ["D1"], estado: "usado", razon: "árboles horneados", fuente_investigacion: "D-830" };
    expect(PackAssets.safeParse(pack).success).toBe(true);
  });
});

describe("AC7: el esquema hermano de código", () => {
  test("una fila de tooling/vendor/ez-tree/src/tree.js valida como RegistroCodigo y falla como RegistroAsset", () => {
    expect(RegistroCodigo.safeParse(filaCodigo).success).toBe(true);
    expect(RegistroAsset.safeParse(filaCodigo).success).toBe(false);
  });

  test("un archivo editado sin parche falla; uno sin editar con parche también", () => {
    const sinParche = sinCampo(filaCodigo, "parche");
    expect(RegistroCodigo.safeParse(sinParche).success).toBe(false);
    expect(RegistroCodigo.safeParse({ ...filaCodigo, editado: false }).success).toBe(false);
  });

  test("una fila de asset no entra en el registro de código", () => {
    expect(RegistroCodigo.safeParse(base).success).toBe(false);
  });
});

describe("AC7: el registro real", () => {
  test("toda fila de campesino y de m7 valida, y el registro de código también", () => {
    const assets = ArchivoRegistroAssets.safeParse(parse(readFileSync(`${ROOT}/content/assets-registry.yaml`, "utf8")));
    expect(assets.success, JSON.stringify(assets.error?.issues)).toBe(true);
    expect(assets.data?.assets.length).toBeGreaterThanOrEqual(9);
    const codigo = ArchivoRegistroCodigo.safeParse(parse(readFileSync(`${ROOT}/content/code-registry.yaml`, "utf8")));
    expect(codigo.success, JSON.stringify(codigo.error?.issues)).toBe(true);
    expect(compilarContenido(REAL, "dev", leerPublicos(ROOT)).errores.map(formatearHallazgo)).toEqual([]);
  });
});
