// Branded domain ID types: a MissionId is not confused with an NpcId
// even though both are strings. The shape of each id (prefixes like "NPC-", "SITIO-") is
// validated by content-schema (F1.2); the core only requires a non-empty string without spaces.

declare const brand: unique symbol;

/** Nominal brand on a base type. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A domain id of class `K`. */
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

/** Invalid id error: names the class and never repeats the full value if it is long. */
export class InvalidIdError extends Error {
  readonly kind: string;
  constructor(kind: string, raw: string) {
    const shown = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
    super(`id de "${kind}" inválido: ${JSON.stringify(shown)} (no vacío, sin espacios)`);
    this.name = "InvalidIdError";
    this.kind = kind;
  }
}

/** Converts a string into an id of class `kind`, or throws InvalidIdError. */
export function toId<K extends string>(kind: K, raw: string): Id<K> {
  if (!ID_SHAPE.test(raw)) throw new InvalidIdError(kind, raw);
  return raw as Id<K>;
}

/** Like toId, but returns null instead of throwing. */
export function parseId<K extends string>(kind: K, raw: string): Id<K> | null {
  return ID_SHAPE.test(raw) ? (raw as Id<K>) : null;
}
