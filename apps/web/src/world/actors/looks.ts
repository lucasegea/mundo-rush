// world/actors/looks.ts — la apariencia de cada personaje por id (plan estetica-c M1 ítem 13, M3): cuerpo base (uno de
// los tres cuerpos KayKit repintados por el pipeline), peinado, sombrero, pañuelo o bufanda y color de remera de
// `casa-1..6` (D-153 releída por D-207), así cada vecino se lee por silueta y por color. Un test exige que cada ficha de
// content/npcs/ y el jugador tengan fila, que no haya dos siluetas iguales y que en una misma zona no se repita la remera.
// M5 SEAM: esta tabla pasa al contenido (bloque `apariencia` de content/npcs/NPC-*.yaml) en M5; hasta entonces es código.
import { SHIRT_TOKENS, type PaletteToken } from "@lg/art";

/** Los cuerpos base (archivos del pipeline: `kaykit-adventurers-1/cuerpo-<id>`). */
export const BODY_IDS = ["saco", "tunica", "ancho"] as const;
export type BodyId = (typeof BODY_IDS)[number];

export const HAIR_STYLES = ["casquete", "corto", "rodete", "coleta", "largo"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const HATS = ["gorra", "paja", "boina"] as const;
export type Hat = (typeof HATS)[number];
export const SCARVES = ["panuelo", "bufanda"] as const;
export type Scarf = (typeof SCARVES)[number];

export interface CharacterLook {
  body: BodyId;
  /** Remera (`casa-1..6`) y pantalón: world/ repinta las prendas marcadas del cuerpo con estos tokens. */
  shirt: (typeof SHIRT_TOKENS)[number];
  pants: PaletteToken;
  skin: PaletteToken;
  hair: PaletteToken;
  hairStyle: HairStyle;
  hat: Hat | null;
  scarf: Scarf | null;
  /** Escala del personaje (1 = adulto; Maya tiene 9 años). */
  scale: number;
}

/** Compatibilidad con M1: el cuerpo de cápsulas usa el mismo tipo. */
export type ChibiLook = CharacterLook;

export const PLAYER_LOOK_ID = "player";

export const CHARACTER_LOOKS: Readonly<Record<string, CharacterLook>> = {
  [PLAYER_LOOK_ID]: { body: "tunica", shirt: "casa-1", pants: "pantalon", skin: "piel", hair: "pelo", hairStyle: "casquete", hat: "gorra", scarf: null, scale: 1 },
  // Campos (Los Campos, D-180)
  "NPC-HARLAN": { body: "ancho", shirt: "casa-2", pants: "pantalon-2", skin: "piel-2", hair: "piedra", hairStyle: "casquete", hat: "paja", scarf: null, scale: 1 },
  "NPC-INES": { body: "saco", shirt: "casa-3", pants: "pantalon-2", skin: "piel-2", hair: "pelo-2", hairStyle: "largo", hat: null, scarf: "panuelo", scale: 1 },
  "NPC-OLLIE": { body: "saco", shirt: "casa-4", pants: "pantalon", skin: "piel", hair: "pelo", hairStyle: "casquete", hat: "boina", scarf: null, scale: 1 },
  "NPC-KOFI": { body: "ancho", shirt: "casa-6", pants: "pantalon", skin: "piel-2", hair: "pelo", hairStyle: "corto", hat: null, scarf: "bufanda", scale: 1 },
  // El Cruce
  "NPC-NELL": { body: "tunica", shirt: "casa-5", pants: "pantalon", skin: "piel", hair: "piedra", hairStyle: "rodete", hat: null, scarf: null, scale: 1 },
  "NPC-MAYA": { body: "tunica", shirt: "casa-2", pants: "pantalon-2", skin: "piel-2", hair: "pelo-2", hairStyle: "coleta", hat: null, scarf: null, scale: 0.8 },
};

/** Compatibilidad con M1 (los tests y el cuerpo de cápsulas leen esta tabla). */
export const CHIBI_LOOKS = CHARACTER_LOOKS;

/**
 * La apariencia de un id. Uno sin fila (un NPC nuevo antes de que M5 traiga su `apariencia`) toma un cuerpo y un color
 * estables por id y sin accesorios; el test de las fichas falla mientras falte su fila.
 */
export function characterLook(id: string): CharacterLook {
  const known = CHARACTER_LOOKS[id];
  if (known) return known;
  let h = 0;
  for (const ch of id) h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) | 0;
  const n = Math.abs(h);
  return {
    body: BODY_IDS[n % BODY_IDS.length] as BodyId,
    shirt: SHIRT_TOKENS[n % SHIRT_TOKENS.length] as CharacterLook["shirt"],
    pants: "pantalon", skin: "piel", hair: "pelo", hairStyle: "casquete", hat: null, scarf: null, scale: 1,
  };
}

export const chibiLook = characterLook;

/** La silueta: lo que se lee de lejos sin color (cuerpo, peinado, sombrero, pañuelo o bufanda y tamaño). */
export const silhouetteKey = (l: CharacterLook): string => [l.body, l.hairStyle, l.hat ?? "-", l.scarf ?? "-", l.scale].join("|");
