// @lg/art looks.ts: the character appearance vocabulary (plan estetica-c M3 and M5, D-207). In M3 the appearance
// table lived in world/actors/looks.ts; since M5 each NPC brings it in its sheet (`apariencia` in
// content/npcs/NPC-*.yaml), so the vocabulary (bodies, hairstyles, hats, neck) lives here, as pure data: it is
// imported by packages/content-schema (to validate the sheet), services/content (to read npcs.json) and world/ (to
// draw). Content keys are in Spanish (D-090); the type used by world/ (`CharacterLook`) comes from
// `lookFromApariencia`, a single translation.
import { PALETTE, SHIRT_TOKENS, type PaletteToken } from "./palette.ts";

/** The base bodies (pipeline files: `kaykit-adventurers-1/cuerpo-<id>`). */
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
  /** T-shirt (`casa-1..6`) and trousers: world/ repaints the body's marked garments with these tokens. */
  shirt: ShirtToken;
  pants: PaletteToken;
  skin: PaletteToken;
  hair: PaletteToken;
  hairStyle: HairStyle;
  hat: Hat | null;
  scarf: Scarf | null;
  /** Character scale (1 = adult; Maya is 9 years old). */
  scale: number;
}

/** The `apariencia` block of an NPC sheet, as it arrives from the compiled content (Spanish keys, D-090). */
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

/** Allowed scale (from child to large adult). */
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
 * Reads an `apariencia` block without zod (the client does not load zod): the appearance, or the first problem found. The
 * compiler already validated the same thing with the content-schema schema; this is the client-side defense.
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

/** The silhouette: what reads from afar without color (body, hairstyle, hat, neck and size). */
export const silhouetteKey = (l: CharacterLook): string => [l.body, l.hairStyle, l.hat ?? "-", l.scarf ?? "-", l.scale].join("|");

/**
 * The player has no sheet in content/ (there is no player file), so their appearance stays in code, here, and is
 * read by world/ (to draw it) and the validate:content estimator (to count it).
 * M5 SEAM: if the player gains a content sheet (or the operator picks an appearance at the start), this moves to that file.
 */
export const PLAYER_LOOK: CharacterLook = {
  body: "tunica", shirt: "casa-1", pants: "pantalon", skin: "piel", hair: "pelo", hairStyle: "casquete", hat: "gorra", scarf: null, scale: 1,
};

/**
 * Open-world-3d T7 (AC47, D3): in the open world (dioramas with relief) the player and the NPCs use the
 * Quaternius character from the V6 mockup (a single body with hair and face; each one's appearance repaints shirt and trousers and
 * picks hat and neck). Flat dioramas (farmer) continue with the three KayKit bodies.
 * Open-world-3d T7b (D-840): which skeleton a diorama uses is stated by its look (`characters.rig` in worldLook.ts); these are
 * the files of the `quaternius` skeleton (world/actors/rigs.ts) and CAP_COLOR is the value of DEFAULT_LOOK.
 */
export const OPEN_WORLD_BODY_ASSET = "quaternius-character-animated/cuerpo";
export const OPEN_WORLD_CLIPS_ASSET = "quaternius-character-animated/animaciones";
/** The open-world player's cap, from the mockup (accessory by code, not a token: it is the mockup's red). */
export const CAP_COLOR = 0xd6342c;
