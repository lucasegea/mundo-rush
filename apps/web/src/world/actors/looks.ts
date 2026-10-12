// world/actors/looks.ts — apariencia placeholder de los personajes por id (plan estetica-c M1 ítem 13): silueta por
// accesorio y color de remera de `casa-1..5`. Tabla en código hasta que M5 la pase al contenido (bloque `apariencia`).
import { HOUSE_TOKENS, type PaletteToken } from "../materials/palette";

export type Accessory = "gorra" | "paja" | "panuelo" | "rodete" | null;

export interface ChibiLook {
  shirt: PaletteToken;
  pants: PaletteToken;
  skin: PaletteToken;
  hair: PaletteToken;
  accessory: Accessory;
}

export const PLAYER_LOOK_ID = "player";

export const CHIBI_LOOKS: Readonly<Record<string, ChibiLook>> = {
  [PLAYER_LOOK_ID]: { shirt: "casa-1", pants: "pantalon", skin: "piel", hair: "pelo", accessory: "gorra" },
  "NPC-INES": { shirt: "casa-3", pants: "pantalon-2", skin: "piel-2", hair: "pelo-2", accessory: "panuelo" },
  "NPC-NELL": { shirt: "casa-5", pants: "pantalon", skin: "piel", hair: "pelo", accessory: "rodete" },
  "NPC-HARLAN": { shirt: "casa-2", pants: "pantalon-2", skin: "piel-2", hair: "pelo-2", accessory: "paja" },
};

/** La apariencia de un id; uno sin fila toma un color de remera estable por id y sin accesorio. */
export function chibiLook(id: string): ChibiLook {
  const known = CHIBI_LOOKS[id];
  if (known) return known;
  let h = 0;
  for (const ch of id) h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) | 0;
  const shirt = HOUSE_TOKENS[Math.abs(h) % HOUSE_TOKENS.length] as PaletteToken;
  return { shirt, pants: "pantalon", skin: "piel", hair: "pelo", accessory: null };
}
