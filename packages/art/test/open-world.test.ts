// Open-world-3d T6 (plan v3 M3, D-819, D-832): lo puro de @lg/art para el mundo abierto. AC31 (triángulos del terreno y
// del peor caso del pasto por tier, sin GPU), AC33 (reliefAt puro, determinístico y plano en los llanos) y la cabecera
// KTX2 de AC42 (512 x 512, 10 niveles, destino BC7 da los bytes de bloque).
import { describe, expect, test } from "vitest";
import {
  BASIS_TARGET, BC_BLOCK_BYTES, blockBytes, gpuBytes, grassWorstTriangles, ktx2GpuBytes, OPEN_WORLD_DENSITY, parseKtx2Header,
  polylineNearest, RELIEF, reliefAt, reliefRaw, terrainTriangles, TIER_BUDGETS, WORLD_TIERS,
} from "../src/index";

const WORLD = { minX: -70, maxX: 70, minZ: -50, maxZ: 50 };
const SKIRT = 160;
const TERRAIN_CAP = { low: 5000, medium: 11000, high: 18000 } as const;

describe("AC31: terreno y pasto en el presupuesto de cada tier", () => {
  for (const tier of WORLD_TIERS) {
    test(`${tier}: terreno de 140 x 100 m con falda de 160 m, y terreno más pasto al 45 % del techo o menos`, () => {
      const ow = OPEN_WORLD_DENSITY[tier];
      const terrain = terrainTriangles(WORLD, SKIRT, ow.terrain);
      expect(terrain).toBeLessThanOrEqual(TERRAIN_CAP[tier]);
      expect(terrain + grassWorstTriangles(ow.grass)).toBeLessThanOrEqual(0.45 * TIER_BUDGETS[tier].maxTriangles);
    });
  }

  test("el peor caso del pasto: tarjetas de todas las matas más las hojas de las del radio cercano", () => {
    const g = { clumps: 1000, radius: 15, nearRadius: 4.5, blades: 8 };
    const near = Math.ceil((1000 * Math.PI * 4.5 ** 2) / 30 ** 2);
    expect(grassWorstTriangles(g)).toBe(2000 + near * 8 * 3);
  });
});

describe("AC33: reliefAt", () => {
  const pads = [{ x: -48, z: 30 }, { x: -5, z: 12 }, { x: 42, z: -18 }, { x: -20, z: -38 }];

  test("puro y determinístico: la misma semilla da lo mismo; otra semilla, otro relieve; siempre entre 2 y 8 m", () => {
    const sample = (seed: number) => Array.from({ length: 200 }, (_, i) => reliefAt((i % 20) * 7 - 70, Math.floor(i / 20) * 10 - 50, seed, pads));
    expect(sample(1545)).toEqual(sample(1545));
    expect(sample(1546)).not.toEqual(sample(1545));
    for (const h of sample(1545)) {
      expect(h).toBeGreaterThanOrEqual(RELIEF.min);
      expect(h).toBeLessThanOrEqual(RELIEF.max);
    }
  });

  test("dentro de 8 m de cada llano vale exactamente la altura del llano", () => {
    for (const p of pads) {
      const at = reliefRaw(p.x, p.z, 1545);
      for (const [dx, dz] of [[0, 0], [7.9, 0], [0, -7.9], [5, 5], [-5.6, 5.6]] as const) {
        expect(reliefAt(p.x + dx, p.z + dz, 1545, pads)).toBe(at);
      }
    }
    // Fuera del llano y de la mezcla manda el relieve crudo.
    expect(reliefAt(60, -45, 1545, pads)).toBe(reliefRaw(60, -45, 1545));
  });

  test("polylineNearest da el punto más cercano del centro de un camino", () => {
    const q = polylineNearest(5, 3, [{ x: 0, z: 0 }, { x: 10, z: 0 }]);
    expect(q).toEqual({ x: 5, z: 0, d: 3 });
    expect(polylineNearest(0, 0, [])).toBeNull();
  });
});

/** Una cabecera KTX2 mínima (los campos que lee parseKtx2Header) para un archivo UASTC o ETC1S. */
function ktx2Header(w: number, h: number, levels: number, colorModel: number, alpha: boolean): Uint8Array {
  const b = new Uint8Array(200);
  const dv = new DataView(b.buffer);
  b.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  dv.setUint32(20, w, true);
  dv.setUint32(24, h, true);
  dv.setUint32(40, levels, true);
  dv.setUint32(44, colorModel === 163 ? 1 : 0, true);
  const dfd = 104;
  dv.setUint32(48, dfd, true);
  b[dfd + 4 + 8] = colorModel;
  // Un canal de muestra (o dos con alfa): el id del canal va en el byte 3 de cada muestra de 16 bytes.
  dv.setUint16(dfd + 4 + 6, alpha ? 24 + 32 : 24 + 16, true);
  b[dfd + 4 + 24 + 3] = 0;
  if (alpha) b[dfd + 4 + 40 + 3] = 15;
  return b;
}

describe("AC42: la memoria de un .ktx2 sale de su cabecera", () => {
  test("512 x 512, 10 niveles, UASTC (destino BC7) da los bytes de bloque de los 10 niveles", () => {
    const h = parseKtx2Header(ktx2Header(512, 512, 10, 166, false));
    expect([h.width, h.height, h.levels, h.format]).toEqual([512, 512, 10, "uastc"]);
    let want = 0;
    for (let l = 0; l < 10; l++) want += Math.ceil(Math.max(1, 512 >> l) / 4) ** 2 * 16;
    expect(ktx2GpuBytes(h)).toBe(want);
    expect(blockBytes(512, 512, 10, "bc7")).toBe(want);
  });

  // Cambio registrado (open-world-3d M3, QA AC42/AC74): antes «ETC1S sin alfa va a BC1 (8 bytes por bloque); con alfa,
  // a BC3». KTX2Loader transcodifica ETC1S a BC7 cuando hay BPTC (priorityETC1S: ETC2 1, ETC1 2, BPTC 3, DXT 4), y la
  // sonda midió BC7 en el escritorio; se cuenta en BC7, el peor caso de todos los destinos.
  test("ETC1S, con o sin alfa, cuenta en BC7 (16 bytes por bloque), el destino que elige KTX2Loader con BPTC", () => {
    expect(BASIS_TARGET).toBe("bc7");
    expect(BC_BLOCK_BYTES[BASIS_TARGET]).toBe(16);
    const opaque = parseKtx2Header(ktx2Header(256, 256, 9, 163, false));
    expect(opaque.format).toBe("etc1s");
    let want = 0;
    for (let l = 0; l < 9; l++) want += Math.ceil(Math.max(1, 256 >> l) / 4) ** 2 * 16;
    expect(ktx2GpuBytes(opaque)).toBe(want);
    expect(ktx2GpuBytes(parseKtx2Header(ktx2Header(256, 256, 9, 163, true)))).toBe(want);
    // Y el inventario (texture-table, estimateTextureMemory) usa los mismos bytes que la cabecera.
    expect(gpuBytes({ width: 256, height: 256, mips: true, alpha: false }, "etc1s")).toBe(want);
  });

  test("teeth: un archivo que no es KTX2 se rechaza", () => {
    expect(() => parseKtx2Header(new Uint8Array(80))).toThrow();
  });
});
