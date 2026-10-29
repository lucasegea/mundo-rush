// Plan estetica-c M2: scripts/assets/optimize.ts sobre glTF de fixture generados en el test (con textura y materiales
// de origen), la regla del bisel con su excepción del registro, la tabla de pintura, y las piezas reales servidas.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, type Node } from "@gltf-transform/core";
import { dequantize } from "@gltf-transform/functions";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import { ArchivoRegistroAssets } from "@lg/content-schema";
import { tokenRgb, withinPaint, type PaletteToken } from "@lg/art";
import { natureJob } from "./nature.ts";
import { crearIO, leerRegistro, optimizarGlb, PiezaRechazada, sha256 } from "./optimize.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** PNG de 1 × 1: la textura de origen que el pipeline tiene que tirar. */
const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

/** Esfera UV (sin aristas duras: el diedro entre caras vecinas es chico). */
function uvSphere(r: number, cx: number, cy: number, cz: number, seg = 16, rings = 10) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const phi = v * Math.PI;
    for (let j = 0; j <= seg; j++) {
      const u = j / seg;
      const th = u * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(th);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(th);
      pos.push(cx + r * x, cy + r * y, cz + r * z);
      nor.push(x, y, z);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
}

/** Cubo sin bisel (aristas de 90°). */
function cube(cx: number) {
  const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map(([x, y, z]) => [(x as number) + cx, y as number, z as number]);
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
  const pos = new Float32Array(faces.flat().flatMap((i) => v[i] as number[]));
  return { pos, idx: null };
}

interface Parte { nombre: string; material: string; geo: { pos: Float32Array; nor?: Float32Array; uv?: Float32Array; idx: Uint16Array | null }; textura?: boolean }

/** Un .glb de fixture: una malla por parte, cada una con su material de origen (y una textura si se pide). */
async function fixture(partes: readonly Parte[]): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("escena");
  const textura = doc.createTexture("colormap").setImage(PNG).setMimeType("image/png");
  for (const p of partes) {
    const mat = doc.createMaterial(p.material).setBaseColorFactor([0.8, 0.2, 0.2, 1]);
    if (p.textura) mat.setBaseColorTexture(textura);
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(p.geo.pos).setBuffer(buffer));
    if (p.geo.nor) prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(p.geo.nor).setBuffer(buffer));
    if (p.geo.uv) prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(p.geo.uv).setBuffer(buffer));
    if (p.geo.idx) prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(p.geo.idx).setBuffer(buffer));
    scene.addChild(doc.createNode(p.nombre).setMesh(doc.createMesh(p.nombre).addPrimitive(prim)));
  }
  return (await crearIO()).writeBinary(doc);
}

const PINTURA = { Rojo: "techo", Azul: "agua" } as const;
const ESFERAS: Parte[] = [
  { nombre: "izquierda", material: "Rojo", geo: uvSphere(1, -3, 1, 0), textura: true },
  { nombre: "derecha", material: "Azul", geo: uvSphere(1, 3, 1, 0), textura: true },
];

/** Posiciones (en el mundo) y colores de cada vértice de la salida, ya decuantizados. */
async function leerSalida(glb: Uint8Array) {
  const doc = await (await crearIO()).readBinary(glb);
  await doc.transform(dequantize());
  const vertices: { x: number; color: number[] }[] = [];
  for (const node of doc.getRoot().listNodes() as Node[]) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const col = prim.getAttribute("COLOR_0");
      if (!pos || !col) throw new Error("salida sin POSITION o COLOR_0");
      for (let i = 0; i < pos.getCount(); i++) {
        const [x = 0, y = 0, z = 0] = pos.getElement(i, []);
        vertices.push({ x: m[0] * x + m[4] * y + m[8] * z + m[12], color: col.getElement(i, []) });
      }
    }
  }
  return { doc, vertices };
}

describe("optimize: un glTF de fixture con textura y materiales de origen", () => {
  test("sale sin texturas ni materiales, con COLOR_0 dentro de los tokens asignados, con meshopt y más liviano", async () => {
    const entrada = await fixture(ESFERAS);
    const { glb, reporte } = await optimizarGlb(entrada, { id: "fixture/esferas", pintura: PINTURA });
    const { doc, vertices } = await leerSalida(glb);
    const root = doc.getRoot();
    expect(root.listTextures()).toHaveLength(0);
    expect(root.listMaterials()).toHaveLength(0);
    expect(root.listExtensionsUsed().map((e) => e.extensionName)).toContain("EXT_meshopt_compression");
    expect(glb.byteLength).toBeLessThan(entrada.byteLength);
    expect(reporte.texturasDescartadas).toBe(1);
    expect(reporte.materialesDescartados).toBe(2);
    expect(reporte.primitivas).toBe(1); // join: una llamada por pieza
    expect(reporte.tokens).toEqual({ Rojo: "techo", Azul: "agua" });
    // Cada vértice cae en la tolerancia del token de su parte (izquierda = techo, derecha = agua) y no en la del otro.
    expect(vertices.length).toBeGreaterThan(100);
    const lado = (x: number): PaletteToken => (x < 0 ? "techo" : "agua");
    const otro = (x: number): PaletteToken => (x < 0 ? "agua" : "techo");
    for (const v of vertices) {
      expect(withinPaint(v.color, tokenRgb(lado(v.x))), `x=${v.x.toFixed(2)} ${v.color.map((c) => c.toFixed(3)).join(",")}`).toBe(true);
      expect(withinPaint(v.color, tokenRgb(otro(v.x)))).toBe(false);
    }
  });

  test("es determinístico: la misma entrada da los mismos bytes", async () => {
    const entrada = await fixture(ESFERAS);
    const a = await optimizarGlb(entrada, { id: "fixture/esferas", pintura: PINTURA });
    const b = await optimizarGlb(entrada, { id: "fixture/esferas", pintura: PINTURA });
    expect(sha256(a.glb)).toBe(sha256(b.glb));
  });
});

describe("optimize: regla del bisel", () => {
  const conCubo: Parte[] = [ESFERAS[0] as Parte, { nombre: "cubo", material: "Azul", geo: cube(4) }];
  /** La fila del registro de la pieza, tal como la lee validate:content. */
  const fila = (bisel: string) => ArchivoRegistroAssets.parse(parse(`
packs:
  - { id: fixture, nombre: F, autor: A, licencia: CC0-1.0, url: https://x.example, fecha_acceso: 2026-10-13,
      verificacion: [V3], estado: usado, razon: r, fuente_investigacion: f, pintura: { Rojo: techo, Azul: agua } }
assets:
  - { id: fixture/cubo, archivo: apps/web/public/models/fixture/cubo.glb, pack: fixture, autor: A, licencia: CC0-1.0,
      url_origen: https://x.example/cubo, fecha_descarga: 2026-10-13, sha256_original: "${"a".repeat(64)}",
      modificaciones: m, atribucion_requerida: false${bisel} }
`)).assets[0];

  test("un cubo sin bisel se rechaza con un mensaje que nombra la pieza", async () => {
    const entrada = await fixture(conCubo);
    const sin = fila("");
    await expect(optimizarGlb(entrada, { id: sin?.id ?? "", pintura: PINTURA, bisel: sin?.bisel })).rejects.toThrow(PiezaRechazada);
    await expect(optimizarGlb(entrada, { id: sin?.id ?? "", pintura: PINTURA, bisel: sin?.bisel })).rejects.toThrow(/fixture\/cubo: arista dura de 90\.0°/);
  });

  test("con bisel: aceptado en el registro pasa (y el reporte lo dice)", async () => {
    const entrada = await fixture(conCubo);
    const ok = fila(", bisel: aceptado, bisel_razon: prueba");
    expect(ok?.bisel).toBe("aceptado");
    const { reporte } = await optimizarGlb(entrada, { id: ok?.id ?? "", pintura: PINTURA, bisel: ok?.bisel });
    expect(reporte.bisel).toBe("aceptado");
    expect(reporte.diedroMax).toBeGreaterThanOrEqual(80);
  });

  test("las esferas solas pasan sin excepción", async () => {
    const { reporte } = await optimizarGlb(await fixture(ESFERAS), { id: "fixture/esferas", pintura: PINTURA });
    expect(reporte.bisel).toBe("ok");
  });
});

describe("optimize: tabla de pintura del pack", () => {
  test("un material sin token falla nombrando pieza y material", async () => {
    await expect(optimizarGlb(await fixture(ESFERAS), { id: "fixture/esferas", pintura: { Rojo: "techo" } }))
      .rejects.toThrow(/fixture\/esferas: el material "Azul" no tiene token/);
  });
  test("un token que no es de la paleta falla", async () => {
    await expect(optimizarGlb(await fixture(ESFERAS), { id: "fixture/esferas", pintura: { Rojo: "techo", Azul: "violeta-chillon" } }))
      .rejects.toThrow(/"violeta-chillon", que no es un token de la paleta/);
  });
  test("el comodín * cubre los materiales no nombrados", async () => {
    const { reporte } = await optimizarGlb(await fixture(ESFERAS), { id: "fixture/esferas", pintura: { "*": "muro" } });
    expect(reporte.tokens).toEqual({ Rojo: "muro", Azul: "muro" });
  });
});

describe("piezas reales del registro", () => {
  const { packs, assets } = leerRegistro(ROOT);
  // Los archivos de personaje (bloque `personaje`, M3) tienen su propio test en characters.test.ts. Open-world-3d T7
  // (cambio registrado): los árboles horneados (generated, bake-trees.ts) y las rocas de scripts/assets/nature.ts no
  // salen de optimize y tienen los suyos (bake-trees.test.ts, nature.test.ts).
  const servidas = assets.filter((a) => a.archivo.endsWith(".glb") && !a.personaje && a.procedencia !== "generated" && !natureJob(a.archivo));

  test("hay al menos dos piezas CC0 servidas y cada una salió del pipeline", async () => {
    expect(servidas.length).toBeGreaterThanOrEqual(2);
    for (const a of servidas) {
      const doc = await (await crearIO()).read(join(ROOT, a.archivo));
      const root = doc.getRoot();
      expect(root.listTextures(), a.id).toHaveLength(0);
      expect(root.listMaterials(), a.id).toHaveLength(0);
      expect(root.listExtensionsUsed().map((e) => e.extensionName), a.id).toContain("EXT_meshopt_compression");
      await doc.transform(dequantize());
      const tokens = [...new Set(Object.values(packs.get(a.pack)?.pintura ?? {}))] as PaletteToken[];
      expect(tokens.length, a.id).toBeGreaterThan(0);
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          const col = prim.getAttribute("COLOR_0");
          expect(col, a.id).not.toBeNull();
          for (let i = 0; i < (col?.getCount() ?? 0); i++) {
            const c = col?.getElement(i, []) ?? [];
            expect(tokens.some((t) => withinPaint(c, tokenRgb(t))), `${a.id} vértice ${i}`).toBe(true);
          }
        }
      }
    }
  });

  // assets-src/ no se versiona (D-099): con la fuente a mano, la salida servida es exactamente la del pipeline.
  const conFuente = servidas.filter((a) => a.fuente && existsSync(join(ROOT, a.fuente)));
  test.skipIf(conFuente.length === 0)("con la fuente en assets-src/, la pieza servida es byte a byte la salida de optimize", async () => {
    for (const a of conFuente) {
      const entrada = new Uint8Array(readFileSync(join(ROOT, a.fuente as string)));
      expect(sha256(entrada), a.id).toBe(a.sha256_original);
      const { glb } = await optimizarGlb(entrada, { id: a.id, pintura: packs.get(a.pack)?.pintura ?? {}, bisel: a.bisel });
      expect(sha256(glb), a.id).toBe(sha256(new Uint8Array(readFileSync(join(ROOT, a.archivo)))));
    }
  });
});
