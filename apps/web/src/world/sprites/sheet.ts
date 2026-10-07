// Hoja de sprites y sombra blob placeholder, generadas por código (D-137; el pack llega con F3, D-153).
// 4 direcciones × (quieto + 3 pasos), celdas de 32×48 px, como la hoja real que espera Billboard.
import { createImage, fillRect, hex, setPixel, type PixelImage } from "../art/pixels";
import { DIRECTIONS, SHEET_COLUMNS, SPRITE_H_PX, SPRITE_W_PX } from "./orientation";

export interface SpritePalette {
  shirt: string;
  pants: string;
  hair: string;
  skin: string;
}

/** El jugador y un color por NPC (por índice): se distinguen sin arte final. */
export const PLAYER_PALETTE: SpritePalette = { shirt: "#d04a3a", pants: "#3a4a7a", hair: "#3a2a1a", skin: "#e8b88a" };
export const NPC_PALETTES: readonly SpritePalette[] = [
  { shirt: "#3a8ad0", pants: "#4a3a2a", hair: "#d8b04a", skin: "#f0c8a0" },
  { shirt: "#4ab05a", pants: "#2a2a3a", hair: "#1a1a1a", skin: "#a87050" },
  { shirt: "#e0b03a", pants: "#5a3a5a", hair: "#8a3a1a", skin: "#e8b88a" },
  { shirt: "#9a5ad0", pants: "#3a5a3a", hair: "#c8c8c8", skin: "#c89068" },
];

const OUTLINE = hex("#1e1a16");

/** Una figura de 32×48 en la celda (col, row): cabeza, torso, piernas que alternan al caminar. */
function drawFigure(img: PixelImage, col: number, row: number, p: SpritePalette): void {
  const x0 = col * SPRITE_W_PX;
  const y0 = row * SPRITE_H_PX;
  const dir = DIRECTIONS[row];
  const step = col === 0 ? 0 : col % 2 === 1 ? 1 : -1;
  // piernas
  fillRect(img, x0 + 11, y0 + 34, 4, 12 - Math.max(0, step) * 2, hex(p.pants));
  fillRect(img, x0 + 17, y0 + 34, 4, 12 - Math.max(0, -step) * 2, hex(p.pants));
  // torso y brazos
  fillRect(img, x0 + 9, y0 + 20, 14, 15, hex(p.shirt));
  fillRect(img, x0 + 7, y0 + 21 + step, 2, 11, hex(p.skin));
  fillRect(img, x0 + 23, y0 + 21 - step, 2, 11, hex(p.skin));
  // cabeza: pelo arriba; de espaldas, todo pelo
  fillRect(img, x0 + 10, y0 + 6, 12, 14, hex(dir === "up" ? p.hair : p.skin));
  fillRect(img, x0 + 10, y0 + 4, 12, 5, hex(p.hair));
  if (dir === "down") {
    setPixel(img, x0 + 13, y0 + 12, OUTLINE);
    setPixel(img, x0 + 18, y0 + 12, OUTLINE);
  } else if (dir === "left") {
    setPixel(img, x0 + 12, y0 + 12, OUTLINE);
  } else if (dir === "right") {
    setPixel(img, x0 + 19, y0 + 12, OUTLINE);
  }
}

export function drawSpriteSheet(p: SpritePalette): PixelImage {
  const img = createImage(SHEET_COLUMNS * SPRITE_W_PX, DIRECTIONS.length * SPRITE_H_PX);
  for (let row = 0; row < DIRECTIONS.length; row++) for (let col = 0; col < SHEET_COLUMNS; col++) drawFigure(img, col, row, p);
  return img;
}

/** Sombra blob (03 §2.7.1: en todos los tiers): elipse oscura semitransparente, borde duro de pixel art. */
export function drawBlobShadow(size = 16): PixelImage {
  const img = createImage(size, size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot((x - c) / c, (y - c) / c) <= 1) setPixel(img, x, y, [0, 0, 0, 96]);
    }
  }
  return img;
}
