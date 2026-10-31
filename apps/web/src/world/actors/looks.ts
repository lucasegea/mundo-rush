// world/actors/looks.ts: each character's appearance (plan estetica-c M1 item 13, M3 and M5). Since M5 each
// neighbor's comes from the content (`apariencia` block of content/npcs/NPC-*.yaml) and arrives through the map selector
// (`MapActor.look`); the vocabulary (bodies, hairstyles, hats, neckwear) and the player's live in @lg/art. Here
// remain the player's id and the fallback appearance for an id without appearance (the catalog has not loaded yet).
import { BODY_IDS, PLAYER_LOOK, SHIRT_TOKENS, type BodyId, type CharacterLook, type ShirtToken } from "@lg/art";

export { BODY_IDS, HAIR_STYLES, HATS, PLAYER_LOOK, SCARVES, silhouetteKey } from "@lg/art";
export type { BodyId, CharacterLook, HairStyle, Hat, Scarf } from "@lg/art";

/** M1 compatibility: the capsule body uses the same type. */
export type ChibiLook = CharacterLook;

export const PLAYER_LOOK_ID = "player";

/**
 * Fallback appearance, stable per id and without accessories: used by an NPC whose appearance did not arrive (catalog not loaded or
 * sheet without `apariencia`; validate:content fails if an NPC placed in a diorama does not have it).
 */
export function fallbackLook(id: string): CharacterLook {
  if (id === PLAYER_LOOK_ID) return PLAYER_LOOK;
  let h = 0;
  for (const ch of id) h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) | 0;
  const n = Math.abs(h);
  return {
    body: BODY_IDS[n % BODY_IDS.length] as BodyId,
    shirt: SHIRT_TOKENS[n % SHIRT_TOKENS.length] as ShirtToken,
    pants: "pantalon", skin: "piel", hair: "pelo", hairStyle: "casquete", hat: null, scarf: null, scale: 1,
  };
}
