// Open-world-3d T6: los clasificadores puros de la Walk (AC39, AC41) con imágenes sintéticas, incluidos los controles
// negativos del mockup (un verde de pradera es verde, un mostaza es amarillo).
import { describe, expect, test } from "vitest";
import { AC41, diffMask, hueClass, maskPixels, skyCheck, yellowShare, type Rgba } from "./classify.ts";

const image = (w: number, h: number, at: (x: number, y: number) => [number, number, number]): Rgba => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...at(x, y), 255], (y * w + x) * 4);
  return { width: w, height: h, data };
};

describe("clase de tono (el hueClass del mockup V6)", () => {
  test("pradera verde, mostaza amarillo; tierra, gris y sombra no cuentan", () => {
    expect(hueClass(96, 150, 52)).toBe(2);
    expect(hueClass(178, 168, 48)).toBe(1);
    expect(hueClass(120, 90, 60)).toBe(0); // tierra (tono < 40)
    expect(hueClass(128, 128, 128)).toBe(0); // gris
    expect(hueClass(10, 30, 8)).toBe(0); // sombra honda
  });
});

describe("AC41: amarillo entre los píxeles de terreno", () => {
  test("la máscara de diferencia toma solo lo que cambió, y el amarillo se mide ahí", () => {
    const sky: [number, number, number] = [200, 220, 235];
    const withTerrain = image(10, 10, (x) => (x < 5 ? [178, 168, 48] : [96, 150, 52]));
    const without = image(10, 10, () => sky);
    const mask = diffMask(withTerrain, without);
    expect([...mask].every((m) => m === 1)).toBe(true);
    expect(yellowShare(withTerrain, maskPixels(mask)).share).toBe(0.5);
    expect(diffMask(without, without).every((m) => m === 0)).toBe(true);
  });

  test("teeth: un suelo todo mostaza falla el tope, uno de pradera pasa", () => {
    const all = Array.from({ length: 100 }, (_, i) => i);
    expect(yellowShare(image(10, 10, () => [178, 168, 48]), all).share).toBeGreaterThan(AC41.maxYellowFull);
    expect(yellowShare(image(10, 10, () => [96, 150, 52]), all).share).toBeLessThanOrEqual(AC41.maxYellowFull);
  });
});

describe("AC39: el cielo de la vista por defecto", () => {
  test("cielo azul arriba, horizonte pálido y pasto abajo pasa", () => {
    const img = image(40, 100, (_x, y) => (y < 50 ? [Math.round(60 + y * 3), Math.round(130 + y * 1.8), 220] : [80, 150, 50]));
    const r = skyCheck(img, 50);
    expect(r.ok, r.detail).toBe(true);
  });

  test("teeth: un cielo plano (sin gradiente), uno que no es azul o un suelo sin verde fallan", () => {
    expect(skyCheck(image(40, 100, (_x, y) => (y < 50 ? [150, 200, 230] : [80, 150, 50])), 50).ok).toBe(false);
    expect(skyCheck(image(40, 100, (_x, y) => (y < 50 ? [240 - y * 2, 200, 120] : [80, 150, 50])), 50).ok).toBe(false);
    expect(skyCheck(image(40, 100, (_x, y) => (y < 50 ? [60 + y * 3, 130 + y * 2, 220] : [150, 130, 90])), 50).ok).toBe(false);
  });

  test("las filas tapadas por la barra del título (y0) no cuentan como cielo", () => {
    const img = image(40, 120, (_x, y) => (y < 20 ? [250, 250, 250] : y < 70 ? [Math.round(60 + (y - 20) * 3), Math.round(130 + (y - 20) * 1.8), 220] : [80, 150, 50]));
    expect(skyCheck(img, 70).topBlue).toBe(false);
    const r = skyCheck(img, 70, 20);
    expect(r.ok, r.detail).toBe(true);
  });

  // Cambio registrado (open-world-3d M3, QA AC39): el paso tiene signo y las bandas miran solo cielo. W2 de QA (cénit
  // = bruma = horizonte, un cielo plano) pasaba porque la banda del horizonte tomaba la silueta de las lomas.
  const hills = (top: (y: number) => [number, number, number]) => {
    const silhouette = (x: number): number => 36 + Math.round(6 * Math.sin(x / 5)); // lomas entre las filas 30 y 42
    const img = image(60, 100, (x, y) => (y < silhouette(x) ? top(y) : [70, 120, 60]));
    const sky = new Uint8Array(60 * 100).map((_, i) => (Math.floor(i / 60) < silhouette(i % 60) ? 1 : 0));
    return { img, sky };
  };

  test("teeth W2: un cielo plano sobre lomas oscuras falla aunque las lomas pisen las filas del horizonte", () => {
    const { img, sky } = hills(() => [207, 231, 238]);
    // Sin máscara (el criterio viejo con el horizonte geométrico en la fila 50) las lomas entraban en la banda.
    const r = skyCheck(img, 50, 0, undefined, sky);
    expect(Math.abs(r.lumaStep), r.detail).toBeLessThan(0.01);
    expect(r.ok).toBe(false);
  });

  test("un cielo con gradiente sobre las mismas lomas pasa: la banda del horizonte es cielo justo sobre la silueta", () => {
    const { img, sky } = hills((y) => [Math.round(60 + y * 4), Math.round(130 + y * 2.5), 225]);
    // Abajo de todo pasto para el verde (las lomas son verdes dominantes).
    const r = skyCheck(img, 50, 0, undefined, sky);
    expect(r.ok, r.detail).toBe(true);
    expect(r.lumaStep).toBeGreaterThan(0.12);
  });

  test("teeth: un gradiente invertido (arriba más claro que el horizonte) falla aunque la diferencia pase de 12 %", () => {
    const { img, sky } = hills((y) => [Math.round(210 - y * 4), Math.round(235 - y * 2.5), 240]);
    const r = skyCheck(img, 50, 0, undefined, sky);
    expect(r.lumaStep, r.detail).toBeLessThan(-0.12);
    expect(r.ok).toBe(false);
  });

  test("los píxeles que tapa un panel del HUD (visible en 0) no cuentan", () => {
    // Un panel blanco tapa 70 % de la mitad de abajo: sin la máscara el verde no llega a 40 %; con ella, sí.
    const img = image(100, 100, (x, y) => (y < 50 ? [Math.round(60 + y * 3), Math.round(130 + y * 1.8), 220] : x < 70 ? [250, 250, 250] : [80, 150, 50]));
    expect(skyCheck(img, 50).ok).toBe(false);
    const visible = new Uint8Array(100 * 100).map((_, i) => (Math.floor(i / 100) >= 50 && i % 100 < 70 ? 0 : 1));
    const r = skyCheck(img, 50, 0, visible);
    expect(r.ok, r.detail).toBe(true);
  });
});
