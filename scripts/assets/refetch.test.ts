// open-world-3d T2(e) (AC11): the pure parts of scripts/assets/refetch.ts, without network (the real run goes over the network, outside verify).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { BASISU } from "./ktx2.ts";
import { leerRegistro } from "./optimize.ts";
import { leerRegistroCodigo, refetchAsset, refetchCodigo, resumen, urlDescarga, type Bajar, type Linea } from "./refetch.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const temporales: string[] = [];
afterAll(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });
const scratch = (): string => {
  const d = mkdtempSync(join(tmpdir(), "lg-refetch-test-"));
  temporales.push(d);
  return d;
};

const desde = (bytes: Uint8Array): Bajar => () => Promise.resolve(bytes);

describe("refetch: urls de descarga", () => {
  test("GitHub /blob/ pasa a /raw/", async () => {
    const url = "https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/main/a/Knight.glb";
    expect(await urlDescarga(url, desde(new Uint8Array()))).toBe("https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/raw/main/a/Knight.glb");
  });

  test("una página de poly.pizza da su único static .glb; cero o dos es un error", async () => {
    const html = (s: string): Bajar => desde(new TextEncoder().encode(s));
    const glb = "https://static.poly.pizza/3f01eddc-5941-42f5-acb7-363f9db61fd8.glb";
    expect(await urlDescarga("https://poly.pizza/m/DM0F8siLam", html(`<a href="${glb}">x</a><meta content="${glb}">`))).toBe(glb);
    await expect(urlDescarga("https://poly.pizza/m/DM0F8siLam", html("<html></html>"))).rejects.toThrow("nombra 0");
    await expect(urlDescarga("https://poly.pizza/m/DM0F8siLam", html(`${glb} https://static.poly.pizza/aaaa.glb`))).rejects.toThrow("nombra 2");
  });

  test("otra url queda igual", async () => {
    expect(await urlDescarga("https://unpkg.com/three@0.186.1/x.js", desde(new Uint8Array()))).toBe("https://unpkg.com/three@0.186.1/x.js");
  });
});

describe("refetch: filas de código", () => {
  const fila = leerRegistroCodigo(ROOT).find((f) => f.archivo === "apps/web/public/decoders/meshopt_decoder.module.js");
  if (!fila) throw new Error("falta la fila del decodificador meshopt en content/code-registry.yaml");
  const meshopt = fila;

  test("el decodificador meshopt con los bytes upstream (la copia de three en node_modules) da MATCH", async () => {
    const upstream = new Uint8Array(readFileSync(join(ROOT, "node_modules/three/examples/jsm/libs/meshopt_decoder.module.js")));
    const l = await refetchCodigo(meshopt, scratch(), desde(upstream), ROOT);
    expect(l.estado).toBe("MATCH");
  });

  test("bytes upstream que no son los del registro dan SOURCE-MISMATCH", async () => {
    const l = await refetchCodigo(meshopt, scratch(), desde(new TextEncoder().encode("otra cosa")), ROOT);
    expect(l.estado).toBe("SOURCE-MISMATCH");
  });

  test("una descarga que falla da ERROR, no MATCH", async () => {
    const l = await refetchCodigo(meshopt, scratch(), () => Promise.reject(new Error("sin red")), ROOT);
    expect(l).toMatchObject({ estado: "ERROR", detalle: "sin red" });
  });
});

describe("refetch: resumen", () => {
  const l = (estado: Linea["estado"]): Linea => ({ estado, archivo: "x", detalle: "" });
  test("ENCODER-MISMATCH se cuenta aparte y no falla; DIFF, SOURCE-MISMATCH y ERROR fallan", () => {
    expect(resumen([l("MATCH"), l("ENCODER-MISMATCH")])).toEqual({ ok: true, cuenta: { "MATCH": 1, "DIFF": 0, "SOURCE-MISMATCH": 0, "ENCODER-MISMATCH": 1, "ERROR": 0 } });
    for (const mal of ["DIFF", "SOURCE-MISMATCH", "ERROR"] as const) expect(resumen([l("MATCH"), l(mal)]).ok, mal).toBe(false);
  });
});

// Open-world-3d T6 (PD-4, D-832): the ground's .ktx2 files are re-encoded with the pinned basisu. The originals and the .wasm
// live in assets-src/ (gitignored): without them (another machine, no network in the test) the MATCH case is skipped.
describe("refetch: filas .ktx2 (basisu fijado)", () => {
  const filas = leerRegistro(ROOT).assets;
  const fila = filas.find((f) => f.archivo === "apps/web/public/textures/sparse-grass-nor.ktx2");
  if (!fila?.fuente) throw new Error("falta la fila de sparse-grass-nor.ktx2 en content/assets-registry.yaml");
  const conCache = existsSync(join(ROOT, fila.fuente)) && existsSync(join(ROOT, BASISU.cache));

  test.skipIf(!conCache)("con el original y el codificador fijado, la re-codificación es idéntica byte a byte (MATCH)", async () => {
    const original = new Uint8Array(readFileSync(join(ROOT, fila.fuente as string)));
    const l = await refetchAsset(fila, undefined, scratch(), desde(original), ROOT);
    expect(l.estado, l.detalle).toBe("MATCH");
    expect(l.detalle).toContain("basisu 2.50.0");
  }, 120_000);

  test.skipIf(!conCache)("un codificador local que no es el fijado da ENCODER-MISMATCH, nunca MATCH ni DIFF", async () => {
    const otraRaiz = scratch();
    mkdirSync(dirname(join(otraRaiz, BASISU.cache)), { recursive: true });
    writeFileSync(join(otraRaiz, BASISU.cache), new TextEncoder().encode("otro basisu"));
    const original = new Uint8Array(readFileSync(join(ROOT, fila.fuente as string)));
    const l = await refetchAsset(fila, undefined, scratch(), desde(original), otraRaiz);
    expect(l.estado).toBe("ENCODER-MISMATCH");
    expect(l.detalle).toContain("2.50.0");
  });

  test("un original que no es el del registro da SOURCE-MISMATCH antes de codificar", async () => {
    const l = await refetchAsset(fila, undefined, scratch(), desde(new TextEncoder().encode("otro jpg")), ROOT);
    expect(l.estado).toBe("SOURCE-MISMATCH");
  });
});
