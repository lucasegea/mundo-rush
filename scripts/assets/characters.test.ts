// Plan estetica-c M3: el pipeline de personajes (scripts/assets/characters.ts) sobre un glTF con esqueleto de fixture
// generado en el test (textura de paleta, varias mallas con piel, clips y un nodo de arma), el decodificador PNG mínimo,
// y los archivos de personaje servidos (byte a byte iguales a la salida del pipeline cuando la fuente está a mano).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { Document, NodeIO, type Node } from "@gltf-transform/core";
import { dequantize } from "@gltf-transform/functions";
import { describe, expect, test } from "vitest";
import { tokenRgb, withinPaint, type PaletteToken } from "@lg/art";
import { ATRIBUTO_ROPA, optimizarClips, optimizarCuerpo, PersonajeRechazado, ROPA, type ReglaPintura } from "./characters.ts";
import { crearIO, leerRegistro, optimizarPersonajeGlb, sha256 } from "./optimize.ts";
import { codificarPng, decodificarPng, muestrear } from "./png.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Esfera UV con piel: todos sus vértices van al joint `joint` y muestrean la textura en `u`. */
function esfera(doc: Document, nombre: string, cy: number, joint: number, u: number, seg = 10, anillos = 6): Node {
  const buffer = doc.getRoot().listBuffers()[0];
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= anillos; i++) {
    const phi = (i / anillos) * Math.PI;
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(th);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(th);
      pos.push(0.3 * x, cy + 0.3 * y, 0.3 * z);
      nor.push(x, y, z);
    }
  }
  for (let i = 0; i < anillos; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const n = pos.length / 3;
  const acc = (type: "VEC2" | "VEC3" | "VEC4" | "SCALAR", array: Float32Array | Uint8Array | Uint16Array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer ?? null);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", acc("VEC3", new Float32Array(pos)))
    .setAttribute("NORMAL", acc("VEC3", new Float32Array(nor)))
    .setAttribute("TEXCOORD_0", acc("VEC2", new Float32Array(Array.from({ length: n }, () => [u, 0.5]).flat())))
    .setAttribute("JOINTS_0", acc("VEC4", new Uint8Array(Array.from({ length: n }, () => [joint, 0, 0, 0]).flat())))
    .setAttribute("WEIGHTS_0", acc("VEC4", new Float32Array(Array.from({ length: n }, () => [1, 0, 0, 0]).flat())))
    .setIndices(acc("SCALAR", new Uint16Array(idx)))
    .setMaterial(doc.getRoot().listMaterials()[0] ?? null);
  return doc.createNode(nombre).setMesh(doc.createMesh(nombre).addPrimitive(prim));
}

/**
 * Un personaje de fixture: esqueleto root → hips → (hand.r → Sword, upperleg.l); textura de 2 × 1 (rojo a la izquierda,
 * azul a la derecha); mallas Body (hips, rojo), Hand (hand.r, azul), Legs (upperleg.l, rojo), Head (hips, azul) y Prisma
 * (hips, rojo, de 3 lados: aristas duras); clips Idle, Wave (que mueve también el arma) y Extra.
 */
async function personajeFixture(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const png = codificarPng({ ancho: 2, alto: 1, rgba: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]) });
  const tex = doc.createTexture("paleta").setImage(png).setMimeType("image/png");
  doc.createMaterial("atlas").setBaseColorTexture(tex);
  const root = doc.createNode("root");
  const hips = doc.createNode("hips").setTranslation([0, 1, 0]);
  const hand = doc.createNode("hand.r").setTranslation([-0.5, 0.4, 0]);
  const leg = doc.createNode("upperleg.l").setTranslation([0.2, -0.3, 0]);
  const sword = doc.createNode("Sword").setTranslation([0, -0.2, 0]);
  root.addChild(hips);
  hips.addChild(hand).addChild(leg);
  hand.addChild(sword);
  const ibm = new Float32Array(16 * 4);
  for (let k = 0; k < 4; k++) ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], k * 16);
  const skin = doc.createSkin("rig").addJoint(root).addJoint(hips).addJoint(hand).addJoint(leg)
    .setInverseBindMatrices(doc.createAccessor().setType("MAT4").setArray(ibm).setBuffer(buffer));
  const scene = doc.createScene().addChild(root);
  for (const [nombre, cy, joint, u] of [["Body", 1, 1, 0.25], ["Hand", 1.4, 2, 0.75], ["Legs", 0.5, 3, 0.25], ["Head", 1.8, 1, 0.75]] as const) {
    scene.addChild(esfera(doc, nombre, cy, joint, u).setSkin(skin));
  }
  scene.addChild(esfera(doc, "Prisma", 1, 1, 0.25, 3, 2).setSkin(skin));
  const clip = (nombre: string, nodos: Node[]) => {
    const a = doc.createAnimation(nombre);
    for (const n of nodos) {
      const s = doc.createAnimationSampler()
        .setInput(doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0, 1])).setBuffer(buffer))
        .setOutput(doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 0, 0.1, 0])).setBuffer(buffer))
        .setInterpolation("LINEAR");
      a.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(n).setTargetPath("translation").setSampler(s));
    }
    return a;
  };
  clip("Idle", [hips]);
  clip("Wave", [hand, sword]);
  clip("Extra", [leg]);
  return new NodeIO().writeBinary(doc);
}

const REGLAS: ReglaPintura[] = [
  { huesos: ["hand.r"], token: "piel" },
  { huesos: ["upperleg.l"], ropa: "pantalon" },
  { color: "#ff0000", ropa: "remera" },
];

async function leer(bytes: Uint8Array): Promise<Document> {
  return (await crearIO()).readBinary(bytes);
}

describe("characters: cuerpo con esqueleto", () => {
  test("las mallas pedidas quedan en una primitiva con piel, pintada por reglas, sin texturas, materiales ni clips", async () => {
    const doc = await leer(await personajeFixture());
    const r = await optimizarCuerpo(doc, { id: "fixture/cuerpo", nodos: ["Body", "Hand", "Legs"], pintura: REGLAS, bisel: "aceptado" });
    expect(r.huesos).toEqual(["root", "hips", "hand.r", "upperleg.l"]);
    expect(r.texturasDescartadas).toBe(1);
    expect(r.animacionesDescartadas).toBe(3);
    const out = await leer(await (await crearIO()).writeBinary(doc));
    const root = out.getRoot();
    expect(root.listTextures()).toHaveLength(0);
    expect(root.listMaterials()).toHaveLength(0);
    expect(root.listAnimations()).toHaveLength(0);
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listMeshes()).toHaveLength(1);
    expect(root.listNodes().find((n) => n.getMesh())?.getName()).toBe("cuerpo");
    await out.transform(dequantize());
    const prim = root.listMeshes()[0]?.listPrimitives()[0];
    expect(root.listMeshes()[0]?.listPrimitives()).toHaveLength(1);
    const color = prim?.getAttribute("COLOR_0");
    const ropa = prim?.getAttribute(ATRIBUTO_ROPA);
    const joints = prim?.getAttribute("JOINTS_0");
    expect(color && ropa && joints).toBeTruthy();
    const nombres = root.listSkins()[0]?.listJoints().map((j) => j.getName()) ?? [];
    const cuenta = { remera: 0, pantalon: 0, piel: 0 };
    for (let i = 0; i < (color?.getCount() ?? 0); i++) {
      const hueso = nombres[Number((joints?.getElement(i, []) ?? [])[0])];
      const slot = (ropa?.getElement(i, []) ?? [])[0];
      const c = color?.getElement(i, []) ?? [];
      const esperado: { token: PaletteToken; slot: number; k: keyof typeof cuenta } =
        hueso === "hand.r" ? { token: "piel", slot: ROPA.fija, k: "piel" }
          : hueso === "upperleg.l" ? { token: "pantalon", slot: ROPA.pantalon, k: "pantalon" }
            : { token: "casa-1", slot: ROPA.remera, k: "remera" };
      expect(slot, `vértice ${i} (${hueso})`).toBe(esperado.slot);
      expect(withinPaint(c, tokenRgb(esperado.token)), `vértice ${i} (${hueso})`).toBe(true);
      cuenta[esperado.k] += 1;
    }
    expect(cuenta.remera).toBeGreaterThan(0);
    expect(cuenta.pantalon).toBeGreaterThan(0);
    expect(cuenta.piel).toBeGreaterThan(0);
    expect(r.ropa).toEqual({ remera: cuenta.remera, pantalon: cuenta.pantalon });
  });

  test("un color que ninguna regla toma falla nombrando el hex y el hueso", async () => {
    const doc = await leer(await personajeFixture());
    await expect(optimizarCuerpo(doc, { id: "fixture/cuerpo", nodos: ["Body", "Hand"], pintura: REGLAS.slice(1), bisel: "aceptado" }))
      .rejects.toThrow(/fixture\/cuerpo: ninguna regla de pintura toma el color #0000ff del hueso "hand.r"/);
  });

  test("una malla que no está o no tiene esqueleto falla nombrándola; un token fuera de la paleta también", async () => {
    await expect(optimizarCuerpo(await leer(await personajeFixture()), { id: "f", nodos: ["Cola"], pintura: REGLAS }))
      .rejects.toThrow(/no hay una malla "Cola"/);
    const doc = await leer(await personajeFixture());
    doc.getRoot().listNodes().find((n) => n.getName() === "Legs")?.setSkin(null);
    await expect(optimizarCuerpo(doc, { id: "f", nodos: ["Body", "Legs"], pintura: REGLAS })).rejects.toThrow(/la malla "Legs" no tiene esqueleto/);
    await expect(optimizarCuerpo(await leer(await personajeFixture()), { id: "f", nodos: ["Body"], pintura: [{ token: "violeta" }], bisel: "aceptado" }))
      .rejects.toThrow(/"violeta", que no es un token de la paleta/);
  });

  test("teeth: sin bisel registrado, una arista dura rechaza el cuerpo; las esferas suaves pasan sin bisel", async () => {
    await expect(optimizarCuerpo(await leer(await personajeFixture()), { id: "f", nodos: ["Body", "Prisma"], pintura: REGLAS }))
      .rejects.toThrow(/arista dura de .*registrala con bisel/);
    const r = await optimizarCuerpo(await leer(await personajeFixture()), { id: "f", nodos: ["Body"], pintura: REGLAS });
    expect(r.diedroMax).toBeLessThan(80);
  });
});

describe("characters: archivo de clips", () => {
  test("quedan solo los clips pedidos, sin mallas ni esqueleto de malla, y sin los canales que mueven nodos fuera del esqueleto", async () => {
    const doc = await leer(await personajeFixture());
    const r = await optimizarClips(doc, { id: "fixture/clips", clips: ["Idle", "Wave"] });
    expect(r.clips.sort()).toEqual(["Idle", "Wave"]);
    expect(r.animacionesDescartadas).toBe(1);
    expect(r.canalesDescartados).toBe(1);
    expect(r.huesos).toEqual(["hand.r", "hips"]);
    const out = await leer(await (await crearIO()).writeBinary(doc));
    expect(out.getRoot().listMeshes()).toHaveLength(0);
    expect(out.getRoot().listNodes().map((n) => n.getName())).not.toContain("Sword");
    expect(out.getRoot().listAnimations().map((a) => a.getName()).sort()).toEqual(["Idle", "Wave"]);
  });

  test("un clip que falta falla nombrándolo", async () => {
    await expect(optimizarClips(await leer(await personajeFixture()), { id: "fixture/clips", clips: ["Idle", "Saludo"] }))
      .rejects.toThrow(PersonajeRechazado);
    await expect(optimizarClips(await leer(await personajeFixture()), { id: "fixture/clips", clips: ["Saludo"] }))
      .rejects.toThrow(/fixture\/clips: el archivo no trae los clips Saludo/);
  });
});

/** PNG de 8 bits con el tipo de color y el filtro por fila pedidos (para probar el decodificador). */
function png(ancho: number, alto: number, tipo: 0 | 2 | 3 | 4 | 6, crudo: number[], filtro: 0 | 1 | 2 | 3 | 4, paleta?: number[]): Uint8Array {
  const canales = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipo];
  const paso = ancho * canales;
  const salida: number[] = [];
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < alto; y++) {
    salida.push(filtro);
    for (let x = 0; x < paso; x++) {
      const v = crudo[y * paso + x] as number;
      const a = x >= canales ? (crudo[y * paso + x - canales] as number) : 0;
      const b = y > 0 ? (crudo[(y - 1) * paso + x] as number) : 0;
      const c = x >= canales && y > 0 ? (crudo[(y - 1) * paso + x - canales] as number) : 0;
      const pred = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filtro] as number;
      salida.push((v - pred + 256) & 255);
    }
  }
  const trozo = (nombre: string, d: Uint8Array): Buffer => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(d.length);
    return Buffer.concat([largo, Buffer.from(nombre, "latin1"), d, Buffer.alloc(4)]); // el decodificador no mira el CRC
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  ihdr[9] = tipo;
  return new Uint8Array(Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo("IHDR", ihdr),
    ...(paleta ? [trozo("PLTE", Uint8Array.from(paleta))] : []),
    trozo("IDAT", deflateSync(Uint8Array.from(salida))),
    trozo("IEND", new Uint8Array(0)),
  ]));
}

describe("png: decodificador mínimo", () => {
  const RGB = [10, 20, 30, 200, 150, 100, 0, 255, 128, 50, 60, 70, 90, 80, 70, 255, 0, 0];

  test("RGB con los cinco filtros da los mismos píxeles", () => {
    for (const f of [0, 1, 2, 3, 4] as const) {
      const img = decodificarPng(png(3, 2, 2, RGB, f));
      expect(img.ancho).toBe(3);
      expect(img.alto).toBe(2);
      expect([...img.rgba.subarray(0, 4)], `filtro ${f}`).toEqual([10, 20, 30, 255]);
      expect([...img.rgba.subarray(20, 24)], `filtro ${f}`).toEqual([255, 0, 0, 255]);
    }
  });

  test("gris, gris con alfa, paleta y RGBA; ida y vuelta con codificarPng; muestreo por UV", () => {
    expect([...decodificarPng(png(1, 1, 0, [77], 0)).rgba]).toEqual([77, 77, 77, 255]);
    expect([...decodificarPng(png(1, 1, 4, [77, 9], 0)).rgba]).toEqual([77, 77, 77, 9]);
    expect([...decodificarPng(png(2, 1, 3, [1, 0], 0, [0, 0, 0, 9, 8, 7])).rgba]).toEqual([9, 8, 7, 255, 0, 0, 0, 255]);
    const rgba = Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]);
    const img = decodificarPng(codificarPng({ ancho: 2, alto: 1, rgba }));
    expect([...img.rgba]).toEqual([...rgba]);
    expect(muestrear(img, 0.25, 0.5)).toEqual([1, 0, 0]);
    expect(muestrear(img, 0.75, 0.5)).toEqual([0, 0, 1]);
    expect(muestrear(img, 1.25, 0.5)).toEqual([1, 0, 0]); // la UV se envuelve
  });

  test("lo que no es PNG o no está cubierto falla nombrando el formato", () => {
    expect(() => decodificarPng(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/no es un PNG/);
    const dieciseis = png(1, 1, 0, [1], 0);
    dieciseis[8 + 8 + 8] = 16; // bits por canal en el IHDR
    expect(() => decodificarPng(dieciseis)).toThrow(/formato no soportado \(bits 16/);
  });
});

describe("personajes reales del registro", () => {
  const { assets } = leerRegistro(ROOT);
  const personajes = assets.filter((a) => a.personaje);

  test("hay tres cuerpos y un archivo de clips servidos, CC0, y cada uno salió del pipeline", async () => {
    expect(personajes.filter((a) => a.personaje?.tipo === "cuerpo")).toHaveLength(3);
    expect(personajes.filter((a) => a.personaje?.tipo === "animaciones")).toHaveLength(1);
    for (const a of personajes) {
      expect(a.licencia, a.id).toBe("CC0-1.0");
      const doc = await (await crearIO()).read(join(ROOT, a.archivo));
      const root = doc.getRoot();
      expect(root.listTextures(), a.id).toHaveLength(0);
      expect(root.listMaterials(), a.id).toHaveLength(0);
      if (a.personaje?.tipo === "cuerpo") {
        expect(root.listMeshes(), a.id).toHaveLength(1);
        expect(root.listSkins(), a.id).toHaveLength(1);
        expect(root.listAnimations(), a.id).toHaveLength(0);
        const prim = root.listMeshes()[0]?.listPrimitives()[0];
        expect(prim?.getAttribute("COLOR_0"), a.id).not.toBeNull();
        expect(prim?.getAttribute(ATRIBUTO_ROPA), a.id).not.toBeNull();
      } else {
        expect(root.listMeshes(), a.id).toHaveLength(0);
        expect(root.listAnimations().map((x) => x.getName()).sort(), a.id).toEqual([...(a.personaje?.clips ?? [])].sort());
      }
    }
  });

  // assets-src/ no se versiona (D-099): con la fuente a mano, lo servido es exactamente la salida del pipeline.
  const conFuente = personajes.filter((a) => a.fuente && existsSync(join(ROOT, a.fuente)));
  test.skipIf(conFuente.length === 0)("con la fuente en assets-src/, cada archivo de personaje es byte a byte la salida de optimize", async () => {
    for (const a of conFuente) {
      const entrada = new Uint8Array(readFileSync(join(ROOT, a.fuente as string)));
      expect(sha256(entrada), a.id).toBe(a.sha256_original);
      const pieza = a.personaje;
      if (!pieza) throw new Error(a.id);
      const { glb } = await optimizarPersonajeGlb(entrada, a.id, pieza, a.bisel);
      expect(sha256(glb), a.id).toBe(sha256(new Uint8Array(readFileSync(join(ROOT, a.archivo)))));
    }
  });
});
