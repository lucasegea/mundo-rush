// revisión de arquitectura placeholder del mapa de prueba (content/dioramas/test.yaml, `atlas_tiles: test-tiles`), generado por
// código: 4×2 celdas de 32 px. Id de tile = celda + 1 (0 = vacío). Lo reemplaza el atlas del pack en F3.
import { createImage, fillRect, hash2, hex, setPixel, type PixelImage, type Rgba } from "../art/pixels";
import { TILE_PX, type AtlasLayout } from "./buildTileChunk";

export const TEST_ATLAS: AtlasLayout = { columns: 4, rows: 2 };

interface GroundArt { fill: string; noise: string; edge: string }
/** Celdas 0-4: suelo (pasto, pasto alto, tierra, agua, piedra). */
const GROUND: readonly GroundArt[] = [
  { fill: "#6fa44c", noise: "#7db458", edge: "#64973f" },
  { fill: "#5e9442", noise: "#6aa24c", edge: "#548738" },
  { fill: "#c8a36a", noise: "#d6b47c", edge: "#b8935a" },
  { fill: "#3f7fbf", noise: "#5a98d0", edge: "#356ea6" },
  { fill: "#a9a69c", noise: "#bab7ad", edge: "#8c8981" },
];

/** Celdas 5-7: detalles con fondo transparente (flores, mata, piedritas). */
const DETAILS: readonly (readonly [number, number, number, number, string])[][] = [
  [[10, 12, 3, 3, "#f2e15c"], [20, 18, 3, 3, "#f07c9a"], [14, 22, 3, 3, "#ffffff"], [11, 15, 1, 4, "#2f5a26"], [21, 21, 1, 4, "#2f5a26"]],
  [[11, 14, 1, 6, "#4c8a34"], [13, 11, 1, 9, "#4c8a34"], [15, 14, 1, 6, "#4c8a34"], [17, 11, 1, 9, "#4c8a34"], [19, 14, 1, 6, "#4c8a34"]],
  [[11, 15, 10, 7, "#5b5b5b"], [12, 15, 7, 4, "#8d8d8d"], [11, 22, 10, 1, "#2f2f2f"]],
];

const cellOrigin = (cell: number): [number, number] => [(cell % TEST_ATLAS.columns) * TILE_PX, Math.floor(cell / TEST_ATLAS.columns) * TILE_PX];

export function drawTestAtlas(): PixelImage {
  const img = createImage(TEST_ATLAS.columns * TILE_PX, TEST_ATLAS.rows * TILE_PX);
  GROUND.forEach((art, cell) => {
    const [x0, y0] = cellOrigin(cell);
    const fill = hex(art.fill);
    const noise = hex(art.noise);
    for (let j = 0; j < TILE_PX; j++) {
      for (let i = 0; i < TILE_PX; i++) setPixel(img, x0 + i, y0 + j, hash2(i + cell * 97, j) < 0.08 ? noise : fill);
    }
    // Borde de un píxel más oscuro abajo y a la derecha: se lee la grilla sin que parezca una cuadrícula.
    const edge: Rgba = hex(art.edge);
    fillRect(img, x0, y0 + TILE_PX - 1, TILE_PX, 1, edge);
    fillRect(img, x0 + TILE_PX - 1, y0, 1, TILE_PX, edge);
  });
  DETAILS.forEach((rects, k) => {
    const [x0, y0] = cellOrigin(GROUND.length + k);
    for (const [x, y, w, h, c] of rects) fillRect(img, x0 + x, y0 + y, w, h, hex(c));
  });
  return img;
}
