// Plan estetica-c M2 (revisión de arquitectura 2026-10-12 §10.3): @lg/art recibió la paleta, el núcleo de la pintura y la regla del bisel
// de M1 sin reescribirlos. Acá se prueban sin three, sobre arreglos (los tests de los constructores por código siguen
// en apps/web/test/estetica-c.test.ts, que importa de @lg/art).
import { describe, expect, test } from "vitest";
import {
  hexToLinear, maxDihedralDeg, MAX_DIHEDRAL_DEG, paintColors, PAINT_DEFAULTS, paintRange, PALETTE, tokenRgb, withinPaint,
  type PaletteToken,
} from "../src/index";

/** Cubo unitario sin bisel, 12 triángulos no indexados. */
function cube(): Float32Array {
  const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
  return new Float32Array(faces.flat().flatMap((i) => v[i] as number[]));
}

/** Octaedro: diedro entre normales de ~70,5°, por debajo del tope. */
function octahedron(): { pos: Float32Array; index: Uint16Array } {
  const pos = new Float32Array([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]);
  const index = new Uint16Array([0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5]);
  return { pos, index };
}

describe("paleta", () => {
  test("todos los tokens son #rrggbb y su lineal cae en [0, 1]", () => {
    for (const [token, hex] of Object.entries(PALETTE)) {
      expect(hex, token).toMatch(/^#[0-9A-F]{6}$/);
      for (const c of hexToLinear(hex)) expect(c).toBeGreaterThanOrEqual(0);
      expect(tokenRgb(token as PaletteToken)).toEqual(hexToLinear(hex));
    }
  });
});

describe("pintura y su tolerancia", () => {
  const pos = new Float32Array(Array.from({ length: 300 }, (_, i) => Math.sin(i * 1.7) * 3));

  test("paintColors es determinístico y todo color cae dentro de paintRange del token", () => {
    for (const token of ["muro", "techo", "pasto", "madera", "tinta"] as const) {
      const rgb = tokenRgb(token);
      const a = paintColors(pos, rgb, 7);
      expect(paintColors(pos, rgb, 7)).toEqual(a);
      for (let i = 0; i < a.length; i += 3) expect(withinPaint(a.subarray(i, i + 3), rgb), `${token} vértice ${i / 3}`).toBe(true);
    }
  });

  test("teeth: el color de otro token no entra en la tolerancia", () => {
    const muro = tokenRgb("muro");
    const techo = paintColors(pos, tokenRgb("techo"), 7);
    let fuera = 0;
    for (let i = 0; i < techo.length; i += 3) if (!withinPaint(techo.subarray(i, i + 3), muro)) fuera += 1;
    expect(fuera).toBe(techo.length / 3);
  });

  test("el rango abarca el oscurecido de abajo y el temblor", () => {
    const rgb = tokenRgb("pasto");
    const { min, max } = paintRange(rgb);
    expect(min[1] as number).toBeLessThanOrEqual((rgb[1] as number) * (1 - PAINT_DEFAULTS.bottomDark) - PAINT_DEFAULTS.jitter / 2 + 1e-9);
    expect(max[1] as number).toBeGreaterThan(rgb[1] as number);
  });
});

describe("regla del bisel (diedro), sin three", () => {
  test("un cubo sin bisel tiene aristas de 90°", () => {
    expect(maxDihedralDeg(cube())).toBeCloseTo(90, 3);
    expect(maxDihedralDeg(cube())).toBeGreaterThanOrEqual(MAX_DIHEDRAL_DEG);
  });

  test("un octaedro (indexado) queda por debajo del tope", () => {
    const { pos, index } = octahedron();
    const deg = maxDihedralDeg(pos, index);
    expect(deg).toBeCloseTo(70.53, 1);
    expect(deg).toBeLessThan(MAX_DIHEDRAL_DEG);
  });

  test("el tope es 80°", () => {
    expect(MAX_DIHEDRAL_DEG).toBe(80);
  });
});
