// @lg/art looks.ts: el vocabulario de la apariencia de los personajes (plan estetica-c M3 y M5, D-207). En M3 la tabla
// de apariencias vivía en world/actors/looks.ts; desde M5 cada NPC la trae en su ficha (`apariencia` de
// content/npcs/NPC-*.yaml), así que el vocabulario (cuerpos, peinados, sombreros, cuello) vive acá, en dato puro: lo
// importan packages/content-schema (para validar la ficha), services/content (para leer npcs.json) y world/ (para
// dibujar). Las claves del contenido van en español (D-090); el tipo que usa world/ (`CharacterLook`) sale de
// `lookFromApariencia`, una sola traducción.
import { PALETTE, SHIRT_TOKENS, type PaletteToken } from "./palette.ts";

/** Los cuerpos base (archivos del pipeline: `kaykit-adventurers-1/cuerpo-<id>`). */
export const BODY_IDS = ["saco", "tunica", "ancho"] as const;
export type BodyId = (typeof BODY_IDS)[number];

export const HAIR_STYLES = ["casquete", "corto", "rodete", "coleta", "largo"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const HATS = ["gorra", "paja", "boina"] as const;
export type Hat = (typeof HATS)[number];
export const SCARVES = ["panuelo", "bufanda"] as const;
export type Scarf = (typeof SCARVES)[number];

export type ShirtToken = (typeof SHIRT_TOKENS)[number];

export interface CharacterLook {
  body: BodyId;
  /** Remera (`casa-1..6`) y pantalón: world/ repinta las prendas marcadas del cuerpo con estos tokens. */
  shirt: ShirtToken;
  pants: PaletteToken;
  skin: PaletteToken;
  hair: PaletteToken;
  hairStyle: HairStyle;
  hat: Hat | null;
  scarf: Scarf | null;
  /** Escala del personaje (1 = adulto; Maya tiene 9 años). */
  scale: number;
}

/** El bloque `apariencia` de una ficha de NPC, tal como llega del contenido compilado (claves en español, D-090). */
export interface Apariencia {
  cuerpo: BodyId;
  remera: ShirtToken;
  pantalon: PaletteToken;
  piel: PaletteToken;
  pelo: PaletteToken;
  peinado: HairStyle;
  sombrero: Hat | null;
  cuello: Scarf | null;
  escala: number;
}

/** Escala permitida (de niño a adulto grande). */
export const LOOK_SCALE_MIN = 0.6;
export const LOOK_SCALE_MAX = 1.2;

export const isPaletteToken = (s: unknown): s is PaletteToken => typeof s === "string" && Object.hasOwn(PALETTE, s);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

export function lookFromApariencia(a: Apariencia): CharacterLook {
  return {
    body: a.cuerpo, shirt: a.remera, pants: a.pantalon, skin: a.piel, hair: a.pelo, hairStyle: a.peinado,
    hat: a.sombrero, scarf: a.cuello, scale: a.escala,
  };
}

/**
 * Lee un bloque `apariencia` sin zod (el cliente no carga zod): la apariencia, o el primer problema encontrado. El
 * compilador ya validó lo mismo con el esquema de content-schema; esto es la defensa del lado del cliente.
 */
export function parseApariencia(v: unknown): { ok: true; look: CharacterLook } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "se esperaba un objeto" };
  const o = v as Record<string, unknown>;
  if (!oneOf(BODY_IDS, o["cuerpo"])) return { ok: false, error: `cuerpo "${String(o["cuerpo"])}" desconocido` };
  if (!oneOf(SHIRT_TOKENS, o["remera"])) return { ok: false, error: `remera "${String(o["remera"])}" no es casa-1..6` };
  for (const k of ["pantalon", "piel", "pelo"] as const) {
    if (!isPaletteToken(o[k])) return { ok: false, error: `${k} "${String(o[k])}" no es un token de la paleta` };
  }
  if (!oneOf(HAIR_STYLES, o["peinado"])) return { ok: false, error: `peinado "${String(o["peinado"])}" desconocido` };
  if (o["sombrero"] !== null && !oneOf(HATS, o["sombrero"])) return { ok: false, error: `sombrero "${String(o["sombrero"])}" desconocido` };
  if (o["cuello"] !== null && !oneOf(SCARVES, o["cuello"])) return { ok: false, error: `cuello "${String(o["cuello"])}" desconocido` };
  const escala = o["escala"];
  if (typeof escala !== "number" || escala < LOOK_SCALE_MIN || escala > LOOK_SCALE_MAX) return { ok: false, error: `escala fuera de ${LOOK_SCALE_MIN}..${LOOK_SCALE_MAX}` };
  return { ok: true, look: lookFromApariencia(o as unknown as Apariencia) };
}

/** La silueta: lo que se lee de lejos sin color (cuerpo, peinado, sombrero, cuello y tamaño). */
export const silhouetteKey = (l: CharacterLook): string => [l.body, l.hairStyle, l.hat ?? "-", l.scarf ?? "-", l.scale].join("|");

/**
 * El jugador no tiene ficha en content/ (no hay archivo de jugador), así que su apariencia sigue en código, acá, y la
 * leen world/ (para dibujarlo) y el estimador de validate:content (para contarlo).
 * M5 SEAM: si el jugador gana ficha de contenido (o el operador elige apariencia al empezar), esto pasa a ese archivo.
 */
export const PLAYER_LOOK: CharacterLook = {
  body: "tunica", shirt: "casa-1", pants: "pantalon", skin: "piel", hair: "pelo", hairStyle: "casquete", hat: "gorra", scarf: null, scale: 1,
};
