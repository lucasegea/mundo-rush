// F2 A2, A4, A7, A9 (partes puras de world/): geometría de tiles por chunk, billboards, matemática de cámara,
// registro de presets y arte generado. Sin WebGL: se prueban las funciones que alimentan a three (D-016).
import { CAMERA_PRESET_IDS, presetAngles, TOPDOWN_PITCH_DEG, type TileLayerData } from "@lg/core";
import { describe, expect, test } from "vitest";
import { CAMERA_RIG_PRESETS } from "../src/world/camera/presets";
import {
  cameraOffset, cutFollow, followAlpha, orthoFrustum, snapToPixelGrid, TARGET_TILES_WIDE, zoomPixelScales, zoomViewWidth,
} from "../src/world/camera/rig";
import { getPixel } from "../src/world/art/pixels";
import { drawBlobShadow, drawSpriteSheet, NPC_PALETTES, PLAYER_PALETTE } from "../src/world/sprites/sheet";
import {
  billboardYaw, cameraForward, directionFromVelocity, selectSpriteFrame, sheetCellTransform, SHEET_COLUMNS,
  SPRITE_H_PX, SPRITE_W_PX, spriteHeightCompensation, DIRECTIONS,
} from "../src/world/sprites/orientation";
import { drawTestAtlas, TEST_ATLAS } from "../src/world/tiles/atlas";
import {
  atlasCellUv, buildTileChunk, buildTileChunkArrays, CHUNK_SIZE, chunkCount, TILE_PX,
} from "../src/world/tiles/buildTileChunk";

const layer = (width: number, height: number, fill: (x: number, z: number) => number, originX = 0, originZ = 0): TileLayerData => ({
  name: "suelo", originX, originZ, width, height,
  tiles: Array.from({ length: width * height }, (_, i) => fill(i % width, Math.floor(i / width))),
});

describe("A2 buildTileChunk: un quad por tile no vacío, 1 geometría por chunk y capa", () => {
  test("chunk lleno de 16×16: 256 quads, 4 vértices y 2 triángulos cada uno", () => {
    const a = buildTileChunkArrays(layer(16, 16, () => 1), 0, 0, TEST_ATLAS);
    expect(a.tileCount).toBe(256);
    expect(a.positions.length).toBe(256 * 4 * 3);
    expect(a.uvs.length).toBe(256 * 4 * 2);
    expect(a.indices.length).toBe(256 * 6);
    expect(Math.max(...a.indices)).toBe(256 * 4 - 1);
  });

  test("los tiles vacíos (0) no generan geometría; una capa vacía da una geometría vacía", () => {
    const sparse = buildTileChunkArrays(layer(16, 16, (x, z) => ((x + z) % 2 === 0 ? 6 : 0)), 0, 0, TEST_ATLAS);
    expect(sparse.tileCount).toBe(128);
    const empty = buildTileChunk(layer(4, 4, () => 0), 0, 0, TEST_ATLAS);
    expect(empty.getAttribute("position").count).toBe(0);
    expect(empty.getIndex()?.count).toBe(0);
  });

  test("normales hacia +Y y triángulos antihorarios vistos desde arriba", () => {
    const a = buildTileChunkArrays(layer(1, 1, () => 1), 0, 0, TEST_ATLAS);
    for (let i = 0; i < 4; i++) expect([a.normals[i * 3], a.normals[i * 3 + 1], a.normals[i * 3 + 2]]).toEqual([0, 1, 0]);
    const p = (v: number) => [a.positions[v * 3] ?? 0, a.positions[v * 3 + 2] ?? 0] as const;
    const [i0, i1, i2] = [a.indices[0] ?? 0, a.indices[1] ?? 0, a.indices[2] ?? 0];
    const [ax, az] = p(i0); const [bx, bz] = p(i1); const [cx, cz] = p(i2);
    // Producto cruz (b-a)×(c-a) en Y: positivo = normal +Y.
    expect((bz - az) * (cx - ax) - (bx - ax) * (cz - az)).toBeGreaterThan(0);
  });

  test("dos chunks vecinos comparten el borde exacto y respetan el origen de la capa (metros)", () => {
    const big = layer(20, 3, () => 1, -16, -12);
    expect(chunkCount(big)).toEqual({ x: 2, z: 1 });
    const left = buildTileChunkArrays(big, 0, 0, TEST_ATLAS);
    const right = buildTileChunkArrays(big, 1, 0, TEST_ATLAS);
    expect(left.tileCount).toBe(16 * 3);
    expect(right.tileCount).toBe(4 * 3);
    const xs = (a: typeof left) => [...a.positions].filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs(left))).toBe(-16);
    expect(Math.max(...xs(left))).toBe(-16 + CHUNK_SIZE);
    expect(Math.min(...xs(right))).toBe(-16 + CHUNK_SIZE); // el borde coincide, sin hueco ni solape
    expect(Math.max(...xs(right))).toBe(-16 + 20);
    const zs = [...left.positions].filter((_, i) => i % 3 === 2);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([-12, -9]);
  });

  test("UV del atlas con margen: dentro de su celda, la fila 0 arriba; fuera de rango falla", () => {
    const [u0, v0, u1, v1] = atlasCellUv(5, TEST_ATLAS); // columna 1, fila 1
    const w = TEST_ATLAS.columns * TILE_PX;
    const h = TEST_ATLAS.rows * TILE_PX;
    expect(u0).toBeGreaterThan(TILE_PX / w);
    expect(u1).toBeLessThan((2 * TILE_PX) / w);
    expect(v0).toBeGreaterThan(0);
    expect(v1).toBeLessThan(1 - TILE_PX / h + 1e-9);
    expect(() => atlasCellUv(TEST_ATLAS.columns * TEST_ATLAS.rows, TEST_ATLAS)).toThrow(RangeError);
    // Un id de tile es celda + 1.
    const a = buildTileChunkArrays(layer(1, 1, () => 6), 0, 0, TEST_ATLAS);
    expect(a.uvs[0]).toBeCloseTo(u0, 6); // Float32
  });
});

describe("A2 billboards HD-2D: orientación solo en Y y cuadro por dirección relativa a la cámara", () => {
  test("el plano mira a la cámara en topdown e iso", () => {
    expect(billboardYaw(cameraForward(TOPDOWN_PITCH_DEG, 0))).toBeCloseTo(0, 9);
    expect(billboardYaw(cameraForward(35.264, 45))).toBeCloseTo(Math.PI / 4, 9);
    expect(billboardYaw({ x: 0, z: 0 })).toBe(0);
  });

  test("la compensación de alto es 1/cos(pitch), con tope 3×", () => {
    expect(spriteHeightCompensation(cameraForward(57, 0))).toBeCloseTo(1 / Math.cos((57 * Math.PI) / 180), 6);
    expect(spriteHeightCompensation(cameraForward(89.9, 0))).toBe(3);
  });

  test("dirección relativa a la cámara (yaw 0 y 90°) y la anterior si está quieto", () => {
    expect(directionFromVelocity(0, 1, 0)).toBe("down");
    expect(directionFromVelocity(0, -1, 0)).toBe("up");
    expect(directionFromVelocity(1, 0, 0)).toBe("right");
    expect(directionFromVelocity(-1, 0, 0)).toBe("left");
    expect(directionFromVelocity(1, 0, Math.PI / 2)).toBe("down");
    expect(directionFromVelocity(0, 0, 0, "left")).toBe("left");
  });

  test("quieto en la columna 0; caminando cicla 1..3; la fila es la dirección", () => {
    expect(selectSpriteFrame(0, 0, 0, 5, "up")).toEqual({ direction: "up", col: 0, row: 3, moving: false });
    const cols = [0, 0.125, 0.25, 0.375].map((t) => selectSpriteFrame(1, 0, 0, t).col);
    expect(cols).toEqual([1, 2, 3, 1]);
    expect(sheetCellTransform(2, 1)).toEqual({ repeatX: 1 / SHEET_COLUMNS, repeatY: 1 / 4, offsetX: 2 / SHEET_COLUMNS, offsetY: 0.5 });
  });
});

describe("A2 arte placeholder generado por código (D-137)", () => {
  test("atlas de 4×2 celdas de 32 px; detalles con fondo transparente", () => {
    const atlas = drawTestAtlas();
    expect([atlas.width, atlas.height]).toEqual([TEST_ATLAS.columns * TILE_PX, TEST_ATLAS.rows * TILE_PX]);
    expect(getPixel(atlas, 2, 2)[3]).toBe(255); // celda 0: pasto opaco
    expect(getPixel(atlas, TILE_PX + 1, TILE_PX + 1)[3]).toBe(0); // celda 5: borde transparente
  });

  test("hojas de personaje 4 columnas × 4 direcciones de 32×48; jugador y NPCs distintos", () => {
    const player = drawSpriteSheet(PLAYER_PALETTE);
    expect([player.width, player.height]).toEqual([SHEET_COLUMNS * SPRITE_W_PX, DIRECTIONS.length * SPRITE_H_PX]);
    expect(NPC_PALETTES.length).toBeGreaterThan(1);
    expect(drawSpriteSheet(NPC_PALETTES[0] ?? PLAYER_PALETTE).data).not.toEqual(player.data);
    const shadow = drawBlobShadow(16);
    expect(getPixel(shadow, 8, 8)[3]).toBeGreaterThan(0);
    expect(getPixel(shadow, 0, 0)[3]).toBe(0);
  });
});

describe("A4 CameraRig: exactamente los presets de R11", () => {
  test("las claves del registro son CAMERA_PRESET_IDS; perspective3D y dialogueFrame implementados (D-207)", () => {
    expect(Object.keys(CAMERA_RIG_PRESETS).sort()).toEqual([...CAMERA_PRESET_IDS].sort());
    // Plan estetica-c M1: el código ortográfico queda en el rig sin uso hasta M7.
    expect(CAMERA_RIG_PRESETS.topdownOrtho).toBe("declared");
    expect(CAMERA_RIG_PRESETS.isoOrtho).toBe("declared");
    expect(CAMERA_RIG_PRESETS.dialogueFrame).toBe("implemented");
    expect(CAMERA_RIG_PRESETS.perspective3D).toBe("implemented");
    expect(CAMERA_RIG_PRESETS.xrTabletop).toBe("declared");
  });

  test("offset por pitch/yaw: topdown 57° desde +z; iso a 45° de yaw", () => {
    const [x, y, z] = cameraOffset(presetAngles("topdownOrtho").pitchDeg, 0, 10);
    expect(x).toBeCloseTo(0, 9);
    expect(Math.atan2(y, z)).toBeCloseTo((57 * Math.PI) / 180, 9);
    const [ix, , iz] = cameraOffset(presetAngles("isoOrtho").pitchDeg, presetAngles("isoOrtho").yawDeg, 10);
    expect(ix).toBeCloseTo(iz, 9);
  });

  test("frustum ortográfico centrado y con el aspecto del canvas", () => {
    expect(orthoFrustum(16, 2)).toEqual({ left: -8, right: 8, top: 4, bottom: -4 });
  });

  test("snap a la grilla de píxel: las proyecciones sobre derecha y arriba quedan en múltiplos del píxel", () => {
    const px = 1 / 64;
    const right: [number, number, number] = [1, 0, 0];
    const up: [number, number, number] = [0, Math.SQRT1_2, -Math.SQRT1_2];
    const out = snapToPixelGrid([1.2345, 7.77, 3.21], right, up, px);
    const onRight = out[0] / px;
    const onUp = (out[1] * up[1] + out[2] * up[2]) / px;
    expect(onRight).toBeCloseTo(Math.round(onRight), 6);
    expect(onUp).toBeCloseTo(Math.round(onUp), 6);
    expect(snapToPixelGrid([1, 2, 3], right, up, 0)).toEqual([1, 2, 3]);
  });
});

describe("A7 reducir movimiento: la cámara corta en vez de seguir", () => {
  test("cutFollow no se mueve mientras el jugador está cerca del centro; corta de golpe cuando sale", () => {
    const here = { x: 0, z: 0 };
    expect(cutFollow(here, { x: 2, z: 1 }, 5, 4)).toBe(here);
    expect(cutFollow(here, { x: 3.5, z: 0 }, 5, 4)).toEqual({ x: 3.5, z: 0 });
    expect(cutFollow(here, { x: 0, z: -2.5 }, 5, 4)).toEqual({ x: 0, z: -2.5 });
  });

  test("el seguimiento suave es independiente del framerate", () => {
    const twoHalves = 1 - (1 - followAlpha(1 / 60)) ** 2;
    expect(twoHalves).toBeCloseTo(followAlpha(1 / 30), 9);
    expect(followAlpha(-1)).toBe(0);
  });
});

describe("A9 zoom: 3 pasos, escala de píxel siempre entera", () => {
  test.each([360, 768, 1280, 1920, 2560, 3840])("canvas de %i px", (px) => {
    const scales = zoomPixelScales(px);
    expect(scales.every(Number.isInteger)).toBe(true);
    expect(scales[0]).toBeGreaterThanOrEqual(1);
    expect(scales[1] - scales[0]).toBe(1);
    expect(scales[2] - scales[1]).toBe(1);
    for (let step = 0; step < 3; step++) {
      // ancho de vista × escala × 32 px = el canvas exacto: cada texel cubre un número entero de píxeles.
      expect(zoomViewWidth(px, step) * (scales[step] ?? 0) * TILE_PX).toBeCloseTo(px, 6);
    }
    // El paso medio ronda los ~15 tiles de ancho (D-053).
    if (px >= 1280) expect(Math.abs(zoomViewWidth(px, 1) - TARGET_TILES_WIDE)).toBeLessThan(TARGET_TILES_WIDE / 2);
  });

  test("pasos fuera de rango se acotan", () => {
    expect(zoomViewWidth(1920, -3)).toBe(zoomViewWidth(1920, 0));
    expect(zoomViewWidth(1920, 9)).toBe(zoomViewWidth(1920, 2));
  });
});
