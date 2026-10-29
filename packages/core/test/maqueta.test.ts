// Plan estetica-c M5 (D-207): el formato de la maqueta en el núcleo. Curvas catmull-rom, props con instancias, giro y
// tinte, huella girada, agua por polígonos y ríos que bloquean la grilla; desde M7, sin capas de tiles.
import { describe, expect, test } from "vitest";
import {
  buildWalkGrid, cellAt, distanceToPolyline, isWalkable, prepareDiorama, sampleCatmullRom, CURVE_SAMPLES_PER_SPAN,
  type DioramaLayout,
} from "../src";

const BOUNDS = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };
const base = (extra: Partial<DioramaLayout> = {}): DioramaLayout => ({ id: "m5", bounds: BOUNDS, ...extra });
const walkableAt = (l: DioramaLayout, x: number, z: number): boolean => {
  const d = prepareDiorama(l);
  const [c, r] = cellAt(d.grid, x, z);
  return isWalkable(d.grid, c, r);
};

describe("curvas catmull-rom", () => {
  test("pasa por cada punto de control, en orden, y termina en el último", () => {
    const pts = [[0, 0], [4, 2], [8, 0], [12, 5]] as const;
    const line = sampleCatmullRom(pts);
    expect(line).toHaveLength(3 * CURVE_SAMPLES_PER_SPAN + 1);
    pts.forEach((p, i) => {
      const s = line[i * CURVE_SAMPLES_PER_SPAN];
      expect(s?.x).toBeCloseTo(p[0], 9);
      expect(s?.z).toBeCloseTo(p[1], 9);
    });
  });

  test("puntos alineados dan una recta; dos puntos, el segmento", () => {
    for (const p of sampleCatmullRom([[0, 0], [2, 0], [5, 0]])) expect(p.z).toBeCloseTo(0, 12);
    const seg = sampleCatmullRom([[0, 0], [4, 4]], 4);
    expect(seg).toHaveLength(5);
    for (const p of seg) expect(p.z).toBeCloseTo(p.x, 12);
    expect(seg[0]).toEqual({ x: 0, z: 0 });
    expect(seg[4]).toEqual({ x: 4, z: 4 });
  });

  test("bordes: sin puntos, nada; un punto, ese punto", () => {
    expect(sampleCatmullRom([])).toEqual([]);
    expect(sampleCatmullRom([[3, -1]])).toEqual([{ x: 3, z: -1 }]);
  });

  test("una curva de verdad se sale de la cuerda (no es una polilínea por los puntos)", () => {
    const line = sampleCatmullRom([[0, 0], [4, 4], [8, 0]]);
    const mid = line[CURVE_SAMPLES_PER_SPAN / 2] as { x: number; z: number };
    // El punto medio del primer tramo queda por encima de la cuerda (0,0)-(4,4).
    expect(mid.z).toBeGreaterThan(mid.x);
  });

  test("distanceToPolyline: un punto, una línea vacía y la proyección sobre el tramo", () => {
    expect(distanceToPolyline(3, 4, [{ x: 0, z: 0 }])).toBe(5);
    expect(distanceToPolyline(0, 0, [])).toBe(Infinity);
    expect(distanceToPolyline(2, 1, [{ x: 0, z: 0 }, { x: 4, z: 0 }])).toBe(1);
    expect(distanceToPolyline(6, 0, [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 0 }])).toBe(2);
  });
});

describe("props: instancias, giro y tinte", () => {
  test("las instancias heredan tam, giro y tinte del prop y pueden pisarlos", () => {
    const d = prepareDiorama(base({
      props: [{
        asset: "codigo/caja", tam: [1, 1, 1], rotY: 90, tinte: "casa-2",
        instancias: [{ pos: [2, 0, 2] }, { pos: [-2, 0, -2], rotY: 0, tam: [2, 1, 1] }],
      }],
    }));
    expect(d.boxes).toEqual([
      { asset: "codigo/caja", x: 2, y: 0, z: 2, w: 1, h: 1, d: 1, rotY: Math.PI / 2, tint: "casa-2" },
      { asset: "codigo/caja", x: -2, y: 0, z: -2, w: 2, h: 1, d: 1, rotY: 0, tint: "casa-2" },
    ]);
  });

  test("sin giro: rotY null; sin tam en el prop ni en la instancia: no hay caja; sin pos ni instancias: nada", () => {
    const d = prepareDiorama(base({
      props: [
        { asset: "codigo/caja", pos: [0, 0, 0], tam: [1, 1, 1] },
        { asset: "codigo/caja", instancias: [{ pos: [1, 0, 1] }] },
        { asset: "codigo/caja", tam: [1, 1, 1] },
      ],
    }));
    expect(d.boxes).toEqual([{ asset: "codigo/caja", x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, rotY: null, tint: null }]);
  });

  test("giro de 90°: la huella cambia ancho por fondo", () => {
    const largo = { asset: "codigo/caja", pos: [0, 0, 0] as [number, number, number], tam: [6, 1, 1] as [number, number, number] };
    expect(walkableAt(base({ props: [largo] }), 2.5, 0)).toBe(false);
    expect(walkableAt(base({ props: [largo] }), 0, 2.5)).toBe(true);
    const girado = base({ props: [{ ...largo, rotY: 90 }] });
    expect(walkableAt(girado, 2.5, 0)).toBe(true);
    expect(walkableAt(girado, 0, 2.5)).toBe(false);
    // 270° es lo mismo que 90° para la huella.
    expect(walkableAt(base({ props: [{ ...largo, rotY: 270 }] }), 0, 2.5)).toBe(false);
  });

  test("giro de 45°: la huella es el rombo girado, no la caja sin girar", () => {
    const l = base({ props: [{ asset: "codigo/caja", pos: [0, 0, 0], tam: [6, 1, 1], rotY: 45 }] });
    // Sobre la diagonal girada (three gira +y: x' = x cos + z sin, z' = -x sin + z cos): la caja llega hasta (2,1; -2,1).
    expect(walkableAt(l, 1.6, -1.6)).toBe(false);
    expect(walkableAt(l, 2.1, 2.1)).toBe(true);
    // Donde estaría la caja sin girar, ya no bloquea.
    expect(walkableAt(l, 2.75, 0)).toBe(true);
  });
});

describe("agua, ríos y caminos en la grilla", () => {
  test("un estanque bloquea las celdas cuyo centro cae adentro", () => {
    const l = base({ agua: [{ poligono: [[1, 1], [4, 1], [4, 4], [1, 4]] }] });
    expect(walkableAt(l, 2.5, 2.5)).toBe(false);
    expect(walkableAt(l, -2.5, -2.5)).toBe(true);
  });

  test("un río bloquea su franja (medio ancho a cada lado de la curva) y nada más", () => {
    const l = base({ rio: [{ puntos: [[-8, 0], [0, 0.5], [8, 0]], ancho: 2 }] });
    expect(walkableAt(l, 0, 0.5)).toBe(false);
    expect(walkableAt(l, -6, 0.25)).toBe(false);
    expect(walkableAt(l, 0, 3)).toBe(true);
    expect(walkableAt(l, 0, -2)).toBe(true);
    // Teeth: sin el río, ese lugar es caminable.
    expect(walkableAt(base(), 0, 0.5)).toBe(true);
  });

  test("los caminos no bloquean (son suelo); quedan muestreados con sus puntos de control y superficie", () => {
    const l = base({ caminos: [{ puntos: [[-8, 0], [8, 0]], ancho: 2 }, { puntos: [[0, -8], [0, -2]], ancho: 3, superficie: "empedrado" }] });
    expect(walkableAt(l, 0, 0)).toBe(true);
    const d = prepareDiorama(l);
    expect(d.ground.paths.map((p) => [p.surface, p.width, p.points])).toEqual([
      ["camino", 2, [[-8, 0], [8, 0]]],
      ["empedrado", 3, [[0, -8], [0, -2]]],
    ]);
    expect(d.ground.paths[0]?.line.length).toBe(CURVE_SAMPLES_PER_SPAN + 1);
  });

  test("la franja de la grilla usa la misma polilínea que el runtime", () => {
    const d = prepareDiorama(base({ rio: [{ puntos: [[-8, -4], [0, 4], [8, -4]], ancho: 1.5 }] }));
    const line = d.ground.rivers[0]?.line ?? [];
    const g = buildWalkGrid({ bounds: BOUNDS, bands: [{ line, halfWidth: 0.75 }] });
    expect(Array.from(d.grid.walkable)).toEqual(Array.from(g.walkable));
  });
});

describe("formato del diorama", () => {
  test("plan estetica-c M7: el núcleo no lee tiles (el schema las rechaza); el runtime no tiene capas ni atlas", () => {
    const capa = { capa: "suelo", origen: [-8, -8], filas: ["4 4", "4 4"] };
    const conTiles = prepareDiorama({ ...base(), ...({ tiles: [capa], atlas_tiles: "atlas/test" } as object) } as DioramaLayout);
    expect(conTiles).not.toHaveProperty("layers");
    expect(conTiles).not.toHaveProperty("atlas");
    expect(conTiles.ground).not.toHaveProperty("format");
    expect(conTiles.ground).toEqual(prepareDiorama(base()).ground);
    expect(Array.from(conTiles.grid.walkable)).toEqual(Array.from(prepareDiorama(base()).grid.walkable));
  });

  test("terreno, paleta y detalle pasan tal cual; la semilla del detalle por defecto es su posición + 1", () => {
    const d = prepareDiorama(base({
      terreno: { extension: 200, lomas: 3, semilla: 5 },
      paleta: { pasto: "copa" },
      detalle: [{ tipo: "flores", centro: [1, 2], radio: 3, cantidad: 10 }, { tipo: "matas", centro: [0, 0], radio: 2, cantidad: 4, semilla: 9 }],
    }));
    expect(d.ground.terrain).toEqual({ extension: 200, hills: 3, seed: 5 });
    expect(d.ground.palette).toEqual({ pasto: "copa" });
    expect(d.ground.detail).toEqual([
      { kind: "flores", x: 1, z: 2, radius: 3, count: 10, seed: 1 },
      { kind: "matas", x: 0, z: 0, radius: 2, count: 4, seed: 9 },
    ]);
    expect(prepareDiorama(base()).ground.terrain).toEqual({ extension: null, hills: null, seed: null });
  });
});
