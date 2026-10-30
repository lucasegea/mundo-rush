// Open-world-3d T6: los clasificadores puros de la Walk (AC39, AC41) con imágenes sintéticas, incluidos los controles
// negativos del mockup (un verde de pradera es verde, un mostaza es amarillo). Open-world-3d T8 (AC50): tiras, amarillo
// junto al pasto y solidez de copas.
import { describe, expect, test } from "vitest";
import {
  AC41, AC51, AC52, crownSolidity, diffMask, differenceHash, grassDefects, hashDistance, hueClass, hullArea, maskPixels, pairwiseDistinct, skyCheck,
  syntheticControls, yellowShare, type Rgba,
} from "./classify.ts";

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

describe("AC50: los clasificadores de defectos del pasto y las copas (port de tools/defects.cjs)", () => {
  test("controles sintéticos: disco rasgado >= 0,9 y X <= 0,2; tiras 1,0 y matas 0,0; pradera verde, mostaza amarillo", () => {
    const c = syntheticControls();
    expect(c.disc).toBeGreaterThanOrEqual(0.9);
    expect(c.x).toBeLessThanOrEqual(0.2);
    expect(c.strips).toBe(1);
    expect(c.tufts).toBe(0);
    expect(c.meadow).toBe(2);
    expect(c.mustard).toBe(1);
  });

  test("la cápsula convexa: área del polígono más medio vértice por vértice más 1 (la fórmula del mockup)", () => {
    const pts: [number, number][] = [];
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) pts.push([x, y]);
    expect(hullArea(pts)).toBe(81 + 4 / 2 + 1); // el cuadrado de 0 a 9: área 81, 4 vértices
    expect(hullArea([[0, 0], [1, 0]])).toBe(2);
  });

  test("grassDefects: tarjetas de canto (bandas) dan tiras; matas redondas no; el suelo amarillo entre el pasto se mide", () => {
    const w = 200;
    const h = 100;
    const ground = (yellow: boolean): Rgba => image(w, h, () => (yellow ? [178, 168, 48] : [96, 150, 52]));
    const grassOn = (base: Rgba, at: (x: number, y: number) => boolean): Rgba => {
      const out = { width: w, height: h, data: new Uint8Array(base.data) };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y)) out.data.set([20, 60, 20, 255], (y * w + x) * 4);
      return out;
    };
    const bands = (x: number, y: number): boolean => y >= 50 && y % 12 < 6 && x % 50 < 44;
    const tufts = (x: number, y: number): boolean => y >= 50 && ((x % 20) - 10) ** 2 + ((y % 20) - 10) ** 2 <= 16;
    const green = ground(false);
    expect(grassDefects(grassOn(green, bands), green).strips).toBeGreaterThan(AC51.maxStrips);
    const t = grassDefects(grassOn(green, tufts), green);
    expect(t.strips).toBeLessThanOrEqual(AC51.maxStrips);
    expect(t.coverage).toBeGreaterThanOrEqual(AC51.minCoverage);
    expect(t.yellow).toBe(0);
    const yellow = ground(true);
    expect(grassDefects(grassOn(yellow, tufts), yellow).yellow).toBeGreaterThan(AC51.maxYellow);
  });

  test("crownSolidity: copas redondas aisladas son sólidas; cruces no; las que se tocan no se miden", () => {
    const w = 300;
    const h = 200;
    const m = new Uint8Array(w * h);
    const discs: { x: number; y: number; z: number; r: number }[] = [];
    const crosses: { x: number; y: number; z: number; r: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const cx = 40 + i * 70;
      for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (x * x + y * y <= 144) m[(60 + y) * w + cx + x] = 1;
      discs.push({ x: cx, y: 60, z: 0.5, r: 12 });
      for (let t = -12; t <= 12; t++) {
        for (let k = -1; k <= 1; k++) {
          m[(150 + t) * w + cx + t + k] = 1;
          m[(150 - t) * w + cx + t + k] = 1;
        }
      }
      crosses.push({ x: cx, y: 150, z: 0.5, r: 12 });
    }
    const solid = crownSolidity(m, w, h, discs);
    expect(solid.measured).toBe(4);
    expect(solid.median).toBeGreaterThanOrEqual(AC51.crown);
    expect(crownSolidity(m, w, h, crosses).median).toBeLessThan(AC51.crown);
    expect(crownSolidity(m, w, h, [{ x: 40, y: 60, z: 0.5, r: 12 }, { x: 50, y: 60, z: 0.5, r: 12 }]).measured).toBe(0);
  });
});

describe("AC52: hash perceptual de las capturas en los NPCs", () => {
  const scene = (seed: number): Rgba => image(90, 80, (x, y) => {
    const v = Math.round(128 + 100 * Math.sin((x + seed * 13) / (6 + seed)) * Math.cos((y - seed * 7) / (5 + seed * 0.5)));
    return [v, Math.min(255, v + 30), Math.max(0, v - 40)];
  });

  test("la misma vista da distancia 0 y falla (prueba roja); tres vistas distintas pasan el umbral", () => {
    const a = scene(1);
    expect(hashDistance(differenceHash(a), differenceHash(a))).toBe(0);
    expect(pairwiseDistinct([a, a, a]).ok).toBe(false);
    const r = pairwiseDistinct([scene(1), scene(2), scene(3)]);
    expect(r.distances.length).toBe(3);
    expect(r.ok).toBe(true);
    for (const d of r.distances) expect(d).toBeGreaterThan(AC52.minDistance);
  });

  test("un cambio chico (el aviso del HUD, unos píxeles) no alcanza para contar como otra vista", () => {
    const a = scene(2);
    const b = { width: a.width, height: a.height, data: new Uint8Array(a.data) };
    for (let y = 70; y < 76; y++) for (let x = 30; x < 60; x++) b.data.set([255, 255, 255, 255], (y * a.width + x) * 4);
    expect(hashDistance(differenceHash(a), differenceHash(b))).toBeLessThanOrEqual(AC52.minDistance);
  });
});
