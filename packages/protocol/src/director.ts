// @lg/protocol/director — snapshot of the live state and journal events of director mode (03 §6.5.2, FD0).
// Development only (D-187, ADR-026): this module is NOT re-exported from the package index; it is imported by
// apps/web/src/dev/director/ (inside the double gate) and tooling/director/. The game does not know about it.
// There is never audio in these schemas (D-108): the objects are strict and an extra field does not validate.
import { z } from "zod";

/** HMR channel the client uses to send the snapshot (≤ 4 per second and only if it changed). */
export const SNAPSHOT_EVENT = "lg:director:snapshot";
/** HMR channel the client uses to send journal events (the plugin adds `seq` and appends them). */
export const JOURNAL_EVENT = "lg:director:journal";
/** The plugin reports that the content recompiled fine: `{ ids }` with the ids touched. */
export const CONTENT_UPDATED_EVENT = "lg:content:updated";

/** Snapshot caps (03 §6.5.2). */
export const PATH_CAP = 500;
export const DIALOGUE_CAP = 20;
/** Journal sessions that are kept (D-192). */
export const JOURNAL_KEEP_SESSIONS = 30;

/** Session id: safe as a file name (`.director/journal/<id>.jsonl`). */
export const SessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const Iso = z.iso.datetime();
const Tile = z.strictObject({ x: z.number().int(), y: z.number().int() });
const Facing = z.enum(["n", "s", "e", "w"]);
const FoundationState = z.enum(["idea", "en_marcha", "fundado", "crece"]);

export const ContentErrorSchema = z.strictObject({ file: z.string(), key: z.string(), message: z.string() });

/**
 * Real renderer counters (plan estetica-c M6): calls and triangles of the last complete frame (all its
 * passes), live textures and geometries, and the measured FPS. Only the director-mode client sends them; null if the canvas
 * has not drawn yet (or there is no map).
 */
export const RenderStatsSchema = z.strictObject({
  drawCalls: z.number().int().nonnegative(),
  triangles: z.number().int().nonnegative(),
  textures: z.number().int().nonnegative(),
  geometries: z.number().int().nonnegative(),
  fps: z.number().nonnegative(),
});
export type RenderStats = z.infer<typeof RenderStatsSchema>;

export const DirectorSnapshotSchema = z.strictObject({
  v: z.literal(1),
  sessionId: SessionIdSchema,
  at: Iso,
  build: z.strictObject({ contentHash: z.string().nullable(), gitSha: z.string().nullable() }),
  region: z.string().nullable(),
  diorama: z.string().nullable(),
  player: z.strictObject({
    /** 1 m tile (D-154) under the player; null outside the map. */
    tile: Tile.nullable(),
    pos: z.strictObject({ x: z.number(), z: z.number() }).nullable(),
    facing: Facing,
  }),
  nearby: z.array(z.string()),
  scene: z.strictObject({
    missionId: z.string().nullable(),
    sceneId: z.string().nullable(),
    /** State of the scene machine (03 §3.5.1). */
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
  /** Plan estetica-c M6: optional (a snapshot without counters is still valid). */
  render: RenderStatsSchema.nullable().optional(),
});
export type DirectorSnapshot = z.infer<typeof DirectorSnapshotSchema>;

// ---------- journal (03 §6.5.2, D-192): `{ seq, at, type, … }`, text only, never audio ----------

const ev = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ seq: z.number().int().nonnegative(), at: Iso, type: z.literal(type), ...shape });

export const JournalEventSchema = z.discriminatedUnion("type", [
  ev("session.start", { gitSha: z.string().nullable(), contentHash: z.string().nullable(), tier: z.string() }),
  ev("move.cell", { diorama: z.string().nullable(), tile: Tile }),
  ev("interact", { targetId: z.string() }),
  ev("scene.start", { missionId: z.string().nullable(), sceneId: z.string().nullable(), npcId: z.string().nullable() }),
  ev("scene.end", { result: z.string(), criteriaMet: z.array(z.string()) }),
  ev("choice", { choice: z.enum(["pressDone", "pressPass", "choose"]), option: z.string().nullable() }),
  /** Final text of the turn; never audio (D-108). */
  ev("line", { turnId: z.string(), speaker: z.string(), text: z.string() }),
  ev("content.reload", { ids: z.array(z.string()), ok: z.boolean(), errors: z.array(ContentErrorSchema) }),
  // FD1 (the schema exists since v0 so the journal is a single one)
  ev("director.note", { text: z.string() }),
  ev("director.edit", { sha: z.string(), summary: z.string(), paths: z.array(z.string()) }),
  ev("session.end", {}),
]);
export type JournalEvent = z.infer<typeof JournalEventSchema>;
export type JournalEventType = JournalEvent["type"];

/** What the client sends: the event without `seq` (the journal writer numbers it when appending). */
export type JournalEventInput = JournalEvent extends infer E ? (E extends JournalEvent ? Omit<E, "seq"> : never) : never;

/** Message of the JOURNAL_EVENT channel. */
export const JournalBatchSchema = z.strictObject({
  sessionId: SessionIdSchema,
  events: z.array(z.unknown()).max(500),
});
export type JournalBatch = { sessionId: string; events: JournalEventInput[] };

/** Message of the CONTENT_UPDATED_EVENT channel. */
export interface ContentUpdated {
  ids: string[];
}
