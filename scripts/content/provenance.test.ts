// open-world-3d T2(c) (AC8, D-831): provenance of every third-party byte, over the REAL tree. Each check is its
// own test, so a bad row lights up only its own (QA's teeth test plants one failure per check on
// the real tree and restores it byte for byte). This file and the blacklist one (AC10) are excluded by name there.
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  archivoLicenciaFaltante, atribucionFaltante, hashDistinto, leerArbol, licenciaAssetFuera, licenciaCodigoFuera, sinFila, sinProcedencia,
} from "./provenance.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const arbol = leerArbol(ROOT);

describe("AC8: procedencia de lo servido y lo vendorizado", () => {
  test("cubre algo: los assets de m7 y el decodificador meshopt están en disco y con fila", () => {
    expect(arbol.archivos.assets.length).toBeGreaterThanOrEqual(9);
    expect(arbol.archivos.codigo).toContain("apps/web/public/decoders/meshopt_decoder.module.js");
    expect(arbol.filas.filter((f) => f.registro === "codigo").map((f) => f.archivo)).toContain("apps/web/public/decoders/meshopt_decoder.module.js");
  });

  test("todo archivo servido o vendorizado tiene fila (y toda fila de código nombra un archivo que existe)", () => {
    expect(sinFila(arbol)).toEqual([]);
  });

  test("el sha256 de cada fila es el de los bytes en disco", () => {
    expect(hashDistinto(arbol)).toEqual([]);
  });

  test("toda fila que cubre un archivo tiene procedencia", () => {
    expect(sinProcedencia(arbol)).toEqual([]);
  });

  test("las licencias de los assets están en la lista D1", () => {
    expect(licenciaAssetFuera(arbol)).toEqual([]);
  });

  test("las licencias del código están en la lista D1", () => {
    expect(licenciaCodigoFuera(arbol)).toEqual([]);
  });

  test("CC-BY lleva atribución y su línea en los créditos", () => {
    expect(atribucionFaltante(arbol)).toEqual([]);
  });

  test("las licencias de software llevan su texto versionado (archivo_licencia que existe)", () => {
    expect(archivoLicenciaFaltante(arbol)).toEqual([]);
  });
});
