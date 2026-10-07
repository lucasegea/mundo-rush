// @lg/protocol/director — snapshot del estado vivo y eventos del diario del modo director (03 §6.5.2, FD0).
// Solo desarrollo (D-187, ADR-026): este módulo NO se re-exporta desde el índice del paquete; lo importan
// apps/web/src/dev/director/ (dentro de la doble llave) y tooling/director/. El juego no lo conoce.
// Nunca hay audio en estos esquemas (D-108): los objetos son estrictos y un campo de más no valida.
import { z } from "zod";

/** Canal de HMR por el que el cliente manda el snapshot (≤ 4 por segundo y solo si cambió). */
export const SNAPSHOT_EVENT = "lg:director:snapshot";
/** Canal de HMR por el que el cliente manda eventos del diario (el plugin les pone `seq` y los agrega). */
export const JOURNAL_EVENT = "lg:director:journal";
/** El plugin avisa que el contenido se recompiló bien: `{ ids }` con los ids tocados. */
export const CONTENT_UPDATED_EVENT = "lg:content:updated";

/** Topes del snapshot (03 §6.5.2). */
export const PATH_CAP = 500;
export const DIALOGUE_CAP = 20;
/** Sesiones del diario que se conservan (D-192). */
export const JOURNAL_KEEP_SESSIONS = 30;

/** Id de sesión: seguro como nombre de archivo (`.director/journal/<id>.jsonl`). */
export const SessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const Iso = z.iso.datetime();
const Tile = z.strictObject({ x: z.number().int(), y: z.number().int() });
const Facing = z.enum(["n", "s", "e", "w"]);
const FoundationState = z.enum(["idea", "en_marcha", "fundado", "crece"]);

export const ContentErrorSchema = z.strictObject({ file: z.string(), key: z.string(), message: z.string() });

export const DirectorSnapshotSchema = z.strictObject({
  v: z.literal(1),
  sessionId: SessionIdSchema,
  at: Iso,
  build: z.strictObject({ contentHash: z.string().nullable(), gitSha: z.string().nullable() }),
  region: z.string().nullable(),
  diorama: z.string().nullable(),
  player: z.strictObject({
    /** Tile de 1 m (D-154) bajo el jugador; null fuera del mapa. */
    tile: Tile.nullable(),
    pos: z.strictObject({ x: z.number(), z: z.number() }).nullable(),
    facing: Facing,
  }),
  nearby: z.array(z.string()),
  scene: z.strictObject({
    missionId: z.string().nullable(),
    sceneId: z.string().nullable(),
    /** Estado de la máquina de escena (03 §3.5.1). */
    step: z.string(),
    turnIndex: z.number().int().nonnegative(),
  }).nullable(),
  path: z.array(z.strictObject({ tile: Tile, at: Iso })).max(PATH_CAP),
  npcsTalked: z.array(z.string()),
  dialogue: z.array(z.strictObject({ turnId: z.string(), speaker: z.string(), text: z.string(), at: Iso })).max(DIALOGUE_CAP),
  worldFlags: z.record(z.string(), z.boolean()),
  foundations: z.record(z.string().regex(/^SITIO-/), FoundationState),
  network: z.array(z.string().regex(/^intro:NPC-/)),
  lastPick: z.strictObject({ x: z.number(), z: z.number() }).nullable(),
  contentErrors: z.array(ContentErrorSchema),
});
export type DirectorSnapshot = z.infer<typeof DirectorSnapshotSchema>;

// ---------- diario (03 §6.5.2, D-192): `{ seq, at, type, … }`, solo texto, nunca audio ----------

const ev = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ seq: z.number().int().nonnegative(), at: Iso, type: z.literal(type), ...shape });

export const JournalEventSchema = z.discriminatedUnion("type", [
  ev("session.start", { gitSha: z.string().nullable(), contentHash: z.string().nullable(), tier: z.string() }),
  ev("move.cell", { diorama: z.string().nullable(), tile: Tile }),
  ev("interact", { targetId: z.string() }),
  ev("scene.start", { missionId: z.string().nullable(), sceneId: z.string().nullable(), npcId: z.string().nullable() }),
  ev("scene.end", { result: z.string(), criteriaMet: z.array(z.string()) }),
  ev("choice", { choice: z.enum(["pressDone", "pressPass", "choose"]), option: z.string().nullable() }),
  /** Texto final del turno; nunca audio (D-108). */
  ev("line", { turnId: z.string(), speaker: z.string(), text: z.string() }),
  ev("content.reload", { ids: z.array(z.string()), ok: z.boolean(), errors: z.array(ContentErrorSchema) }),
  // FD1 (el esquema existe desde v0 para que el diario sea uno solo)
  ev("director.note", { text: z.string() }),
  ev("director.edit", { sha: z.string(), summary: z.string(), paths: z.array(z.string()) }),
  ev("session.end", {}),
]);
export type JournalEvent = z.infer<typeof JournalEventSchema>;
export type JournalEventType = JournalEvent["type"];

/** Lo que manda el cliente: el evento sin `seq` (el escritor del diario lo numera al agregarlo). */
export type JournalEventInput = JournalEvent extends infer E ? (E extends JournalEvent ? Omit<E, "seq"> : never) : never;

/** Mensaje del canal JOURNAL_EVENT. */
export const JournalBatchSchema = z.strictObject({
  sessionId: SessionIdSchema,
  events: z.array(z.unknown()).max(500),
});
export type JournalBatch = { sessionId: string; events: JournalEventInput[] };

/** Mensaje del canal CONTENT_UPDATED_EVENT. */
export interface ContentUpdated {
  ids: string[];
}
