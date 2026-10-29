// world/actors/looks.ts: la apariencia de cada personaje (plan estetica-c M1 ítem 13, M3 y M5). Desde M5 la de cada
// vecino viene del contenido (bloque `apariencia` de content/npcs/NPC-*.yaml) y llega por el selector del mapa
// (`MapActor.look`); el vocabulario (cuerpos, peinados, sombreros, cuello) y la del jugador viven en @lg/art. Acá
// quedan el id del jugador y la apariencia de reserva para un id sin apariencia (el catálogo no cargó todavía).
import { BODY_IDS, PLAYER_LOOK, SHIRT_TOKENS, type BodyId, type CharacterLook, type ShirtToken } from "@lg/art";

export { BODY_IDS, HAIR_STYLES, HATS, PLAYER_LOOK, SCARVES, silhouetteKey } from "@lg/art";
export type { BodyId, CharacterLook, HairStyle, Hat, Scarf } from "@lg/art";

/** Compatibilidad con M1: el cuerpo de cápsulas usa el mismo tipo. */
export type ChibiLook = CharacterLook;

export const PLAYER_LOOK_ID = "player";

/**
 * Apariencia de reserva, estable por id y sin accesorios: la usa un NPC cuya apariencia no llegó (catálogo sin cargar o
 * ficha sin `apariencia`; validate:content falla si un NPC puesto en un diorama no la tiene).
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
