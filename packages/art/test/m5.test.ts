// Plan estetica-c M5: the pure parts of @lg/art shared by world/ and validate:content. Appearances (vocabulary, reading without
// zod), estimator cost table, terrain lines, cobblestones and 2D shapes. That the cost table gives the same as
// the three constructors is tested by apps/web/test/maqueta.test.ts (there is no three here).
import { describe, expect, test } from "vitest";
import {
  addEstimates, codePropTriangles, fencePosts, FENCE, headTriangles, HEAD_TRIANGLES, insidePolygon, isCodeProp, isPaletteToken,
  isTreeProp, lookFromApariencia, parseApariencia, pavingStoneCount, PLAYER_LOOK, polygonEdgeDistance, polylineDistance,
  silhouetteKey, terrainExtent, terrainLines, terrainTriangles, TERRAIN_SKIRT, TIER_BUDGETS, type Apariencia,
} from "../src/index";

const APARIENCIA: Apariencia = {
  cuerpo: "saco", remera: "casa-3", pantalon: "pantalon", piel: "piel", pelo: "pelo", peinado: "rodete", sombrero: null, cuello: "panuelo", escala: 0.9,
};

describe("apariencias", () => {
  test("lookFromApariencia traduce las claves en castellano y parseApariencia acepta una válida", () => {
    const look = lookFromApariencia(APARIENCIA);
    expect(look).toEqual({ body: "saco", shirt: "casa-3", pants: "pantalon", skin: "piel", hair: "pelo", hairStyle: "rodete", hat: null, scarf: "panuelo", scale: 0.9 });
    expect(parseApariencia(APARIENCIA)).toEqual({ ok: true, look });
    expect(silhouetteKey(look)).toBe("saco|rodete|-|panuelo|0.9");
  });

  test.each([
    ["no es objeto", [], /objeto/],
    ["cuerpo", { ...APARIENCIA, cuerpo: "gigante" }, /cuerpo "gigante"/],
    ["remera fuera de casa-1..6", { ...APARIENCIA, remera: "pasto" }, /remera "pasto"/],
    ["tinte que no es token", { ...APARIENCIA, pelo: "#ff0000" }, /pelo "#ff0000" no es un token/],
    ["peinado", { ...APARIENCIA, peinado: "mohicano" }, /peinado/],
    ["sombrero", { ...APARIENCIA, sombrero: "copa" }, /sombrero "copa"/],
    ["cuello", { ...APARIENCIA, cuello: "corbata" }, /cuello "corbata"/],
    ["escala", { ...APARIENCIA, escala: 2 }, /escala fuera/],
  ])("teeth: %s falla nombrando el campo", (_, v, re) => {
    const r = parseApariencia(v);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(re);
  });

  test("isPaletteToken: solo las claves de PALETTE (no hex ni heredados del prototipo)", () => {
    expect(isPaletteToken("ámbar")).toBe(true);
    expect(isPaletteToken("#F2A93B")).toBe(false);
    expect(isPaletteToken("toString")).toBe(false);
    expect(isPaletteToken(3)).toBe(false);
  });

  test("el jugador sigue en código (M5 SEAM) con su gorra", () => {
    expect(PLAYER_LOOK.hat).toBe("gorra");
    expect(PLAYER_LOOK.body).toBe("tunica");
  });
});

describe("tabla de costos", () => {
  test("props por código: los seis conocidos; los árboles son dos de ellos", () => {
    expect(isCodeProp("codigo/casa")).toBe(true);
    expect(isCodeProp("codigo/molino")).toBe(false);
    expect(isTreeProp("codigo/pino")).toBe(true);
    expect(isTreeProp("codigo/caja")).toBe(false);
  });

  test("cerco: un poste cada 1,6 m (mínimo 2) y dos travesaños", () => {
    expect(fencePosts(0.5)).toBe(2);
    expect(fencePosts(1.6)).toBe(2);
    expect(fencePosts(1.7)).toBe(3);
    expect(fencePosts(9)).toBe(7);
    expect(codePropTriangles("codigo/cerco", { w: 9, h: 1, d: 0.2 })).toBe(7 * FENCE.postTriangles + 2 * FENCE.railTriangles);
    // The length is the larger of width and depth (a fence rotated by size).
    expect(codePropTriangles("codigo/cerco", { w: 0.2, h: 1, d: 9 })).toBe(codePropTriangles("codigo/cerco", { w: 9, h: 1, d: 0.2 }));
  });

  test("cabeza: base más peinado, sombrero y cuello; el pañuelo con pelo corto suma el casquete que tapa", () => {
    expect(headTriangles({ hairStyle: "casquete", hat: null, scarf: null })).toBe(HEAD_TRIANGLES.base);
    expect(headTriangles({ hairStyle: "coleta", hat: "paja", scarf: "bufanda" })).toBe(570 + 148 + 366 + 204);
    expect(headTriangles({ hairStyle: "corto", hat: null, scarf: "panuelo" })).toBe(570 - 46 + 36 + 46);
  });

  test("addEstimates suma; los topes de tier son los de 03 §2.7.1", () => {
    expect(addEstimates({ drawCalls: 1, triangles: 2 }, { drawCalls: 3, triangles: 4 })).toEqual({ drawCalls: 4, triangles: 6 });
    expect(addEstimates()).toEqual({ drawCalls: 0, triangles: 0 });
    expect(TIER_BUDGETS.medium).toEqual({ maxDrawCalls: 120, maxTriangles: 50_000, maxTextureMb: 48 });
  });
});

describe("terreno y empedrado", () => {
  const b = { minX: -16, maxX: 16, minZ: -12, maxZ: 12 };

  test("la extensión es la falda alrededor de los límites; los triángulos salen de las líneas", () => {
    expect(terrainExtent(b)).toEqual({ minX: -16 - TERRAIN_SKIRT, maxX: 16 + TERRAIN_SKIRT, minZ: -12 - TERRAIN_SKIRT, maxZ: 12 + TERRAIN_SKIRT });
    const { xs, zs } = terrainLines(b);
    expect(terrainTriangles(b)).toBe(2 * (xs.length - 1) * (zs.length - 1));
    expect(terrainTriangles(b)).toBe(9672); // the number measured at 43c2b48 on the test diorama
    for (let i = 1; i < xs.length; i++) expect(xs[i] as number).toBeGreaterThan(xs[i - 1] as number);
  });

  test("empedrado: largo de la polilínea de control × ancho × 2", () => {
    expect(pavingStoneCount([[-2.5, 2], [-2.5, 6]], 3)).toBe(24);
    expect(pavingStoneCount([[0, 0], [3, 4], [3, 8]], 1)).toBe(18);
    expect(pavingStoneCount([[0, 0]], 2)).toBe(0);
  });
});

describe("formas 2D", () => {
  const sq = [[0, 0], [4, 0], [4, 4], [0, 4]] as const;
  test("punto en polígono y distancia al borde", () => {
    expect(insidePolygon(2, 2, sq)).toBe(true);
    expect(insidePolygon(5, 2, sq)).toBe(false);
    expect(polygonEdgeDistance(2, 1, sq)).toBe(1);
    expect(polygonEdgeDistance(6, 2, sq)).toBe(2);
  });
  test("distancia a polilínea: vacía, un punto, tramos", () => {
    expect(polylineDistance(0, 0, [])).toBe(Infinity);
    expect(polylineDistance(3, 4, [{ x: 0, z: 0 }])).toBe(5);
    expect(polylineDistance(2, 3, [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 0 }])).toBe(3);
  });
});
