// Tipos de IDs de dominio con marca (branded): un MissionId no se confunde con un NpcId
// aunque los dos sean strings. La forma de cada id (prefijos como "NPC-", "SITIO-") la
// valida content-schema (F1.2); el núcleo solo exige un string no vacío y sin espacios.

declare const brand: unique symbol;

/** Marca nominal sobre un tipo base. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Un id de dominio de la clase `K`. */
export type Id<K extends string> = Brand<string, K>;

export type AccountId = Id<"account">;
export type MissionId = Id<"mission">;
export type SceneId = Id<"scene">;
export type NpcId = Id<"npc">;
export type TurnId = Id<"turn">;
export type DioramaId = Id<"diorama">;
export type SitioId = Id<"sitio">;
export type SaberId = Id<"saber">;

const ID_SHAPE = /^\S+$/;

/** Error de id inválido: nombra la clase y nunca repite el valor completo si es largo. */
export class InvalidIdError extends Error {
  readonly kind: string;
  constructor(kind: string, raw: string) {
    const shown = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
    super(`id de "${kind}" inválido: ${JSON.stringify(shown)} (no vacío, sin espacios)`);
    this.name = "InvalidIdError";
    this.kind = kind;
  }
}

/** Convierte un string en un id de la clase `kind`, o lanza InvalidIdError. */
export function toId<K extends string>(kind: K, raw: string): Id<K> {
  if (!ID_SHAPE.test(raw)) throw new InvalidIdError(kind, raw);
  return raw as Id<K>;
}

/** Como toId, pero devuelve null en vez de lanzar. */
export function parseId<K extends string>(kind: K, raw: string): Id<K> | null {
  return ID_SHAPE.test(raw) ? (raw as Id<K>) : null;
}
