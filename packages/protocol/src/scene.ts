// Client ↔ server messages of a text scene (F4.1; 03 §5.3, §5.6-§5.8) and the contracts that travel with them:
// observer output (03 §5.7), evidence event (03 §3.5.3) and mission effects (03 §6.4.8).
// All objects are strict: an extra field (a prompt, a model name, a key) does not validate (A4).
// F5.1a: voice on the server. The client asks for a voice scene (`scene.start` with `modality: "voice"`), marks the start and
// end of its turn (`voice.turnStart`/`voice.turnEnd`, D-091) and sends the audio in separate binary frames (ADR-017).
// F5.2: the client captures and plays that audio (apps/web/src/services/audio) and receives what the server heard from its
// turno (`turn.transcript`).
import { z } from "zod";

const NpcId = z.string().regex(/^NPC-[A-Z0-9-]+$/);
const MissionId = z.string().regex(/^M\d+\.\d+$/);
const SceneId = z.string().regex(/^M\d+\.\d+-E\d+$/);
const Iso = z.iso.datetime();

/**
 * Audio framing on the scene WebSocket (ADR-017): BINARY frames with no header, PCM16 little-endian mono.
 * Client → server: the player's voice at 16 kHz, only between `voice.turnStart` and `voice.turnEnd`.
 * Server → client: the NPC's voice at 24 kHz, only during `npcTurn` (invariant a of 03 §3.5.1).
 */
export const PLAYER_AUDIO_SAMPLE_RATE = 16000;
export const NPC_AUDIO_SAMPLE_RATE = 24000;

/** Scene WebSocket path and the single-use token path (03 §5.3, D-158). */
export const SCENE_WS_PATH = "/scene";
export const SCENE_TOKEN_PATH = "/scene-token";

// ---------- mission effects (03 §6.4.8) ----------

export const FoundationStageSchema = z.enum(["idea", "en_marcha", "fundado", "crece"]);
export const WorldEffectSchema = z.union([
  z.strictObject({ fundacion: z.string().regex(/^SITIO-[A-Z0-9-]+$/), estado: FoundationStageSchema }),
  z.strictObject({ intro: NpcId }),
  z.strictObject({ flag: z.string().regex(/^[a-z][a-z0-9_]*$/) }),
]);
export type WorldEffectMsg = z.infer<typeof WorldEffectSchema>;

// ---------- observador (03 §5.7) ----------

export const ERROR_TYPES = ["grammar", "vocabulary", "word-order", "article", "tense", "subject-verb", "pronoun", "preposition", "other"] as const;
export const EVIDENCE_KINDS = ["target_use", "self_correction", "review_recall", "option_choice", "can_do", "mission_outcome"] as const;

export const ObserverResultSchema = z.strictObject({
  turnId: z.string().min(1),
  intended: z.string(),
  errors: z.array(z.strictObject({
    key: z.string(),
    type: z.enum(ERROR_TYPES),
    scope: z.enum(["global", "local"]),
    missionTarget: z.boolean(),
    span: z.string(),
    correction: z.string(),
  })),
  criteria: z.array(z.strictObject({ criterionId: z.string(), met: z.boolean(), quote: z.string() })),
  evidence: z.array(z.strictObject({
    kind: z.enum(["target_use", "self_correction", "review_recall"]),
    structureId: z.string(),
    branch: z.string(),
    quote: z.string(),
  })),
  offTopic: z.boolean(),
  personalDataDetected: z.boolean(),
  safety: z.enum(["none", "inappropriate", "risk"]),
});
export type ObserverResult = z.infer<typeof ObserverResultSchema>;

// ---------- evidence (03 §3.5.3, D-157): append-only, written by the server ----------

export const EvidenceEventSchema = z.strictObject({
  id: z.string().min(1),
  accountId: z.string().min(1),
  at: Iso,
  kind: z.enum(EVIDENCE_KINDS),
  missionId: MissionId,
  sceneId: SceneId,
  branch: z.string().optional(),
  structureId: z.string().optional(),
  quote: z.string().optional(),
  /** Only in `mission_outcome`: how the scene closed and which effects it emitted. */
  outcome: z.enum(["success", "partial", "hardCap"]).optional(),
  effects: z.array(WorldEffectSchema).optional(),
  criteriaMet: z.array(z.string()).optional(),
});
export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;

// ---------- cliente → servidor ----------

export const PassOptionSchema = z.enum(["hint", "repeat", "simpler", "continue"]);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  /** Talk to an NPC; `null` opens the companion scene without an NPC (like M0.2). Operator mode: `op-local` account. */
  z.strictObject({
    type: z.literal("scene.start"),
    npcId: NpcId.nullable(),
    /** Text by default. Voice with no session available (no key, provider down): the scene continues by text with a notice. */
    modality: z.enum(["voice", "text"]).optional(),
  }),
  /** Text turn: the player types and presses Terminé. */
  z.strictObject({ type: z.literal("turn.text"), text: z.string().trim().min(1).max(500) }),
  z.strictObject({ type: z.literal("turn.pass") }),
  z.strictObject({ type: z.literal("turn.choose"), option: PassOptionSchema }),
  z.strictObject({ type: z.literal("scene.abort") }),
  // Voice (F5.1a): start and end of the spoken turn (end = `Terminé` or the local silence threshold). The audio goes in frames
  // separate binary ones (PLAYER_AUDIO_SAMPLE_RATE).
  z.strictObject({ type: z.literal("voice.turnStart") }),
  z.strictObject({ type: z.literal("voice.turnEnd") }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------- servidor → cliente ----------

export const SCENE_STEP_NAMES = [
  "idle", "pretask", "npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging",
  "closing", "posttask", "done", "aborted", "containment",
] as const;

const LineSchema = z.strictObject({
  lineId: z.string().min(1),
  /** NPC speaking or LUMI (their lines travel as a template id, never free text from the model). */
  speaker: z.union([NpcId, z.literal("LUMI")]),
  /** `safe`: scripted safe line that replaces a turn cut by moderation (F4.2, 03 §7.7). */
  kind: z.enum(["pretask", "opening", "reply", "closing", "exit", "notIntroduced", "safe"]),
  text: z.string().nullable(),
  template: z.string().nullable(),
});

export const SAFETY_LAYERS = ["input", "output", "observer"] as const;
export type SafetyLayer = (typeof SAFETY_LAYERS)[number];

export const NOTICE_CODES = ["observer_invalid", "model_unavailable", "containment"] as const;
/**
 * Structured cause of an NPC `model_unavailable` in text (open-world-3d T1). The server builds it ONLY from
 * `ProviderError.code` and `status`, never from the error text (which may carry a key or a raw body).
 */
export const NOTICE_CAUSE_KINDS = ["http", "timeout", "empty", "truncated", "unavailable", "unknown"] as const;
export type NoticeCauseKind = (typeof NOTICE_CAUSE_KINDS)[number];
export const NoticeCauseSchema = z.strictObject({
  kind: z.enum(NOTICE_CAUSE_KINDS),
  status: z.number().int().min(100).max(599).nullable(),
});
export type NoticeCause = z.infer<typeof NoticeCauseSchema>;
/** `not_voice`: a voice message or frame in a scene that is not in voice mode. */
export const ERROR_CODES = ["bad_message", "not_implemented", "scene_busy", "no_scene", "unknown_npc", "not_your_turn", "not_voice"] as const;

/**
 * A2 (ADR-027): conversation state through meters for the HUD. No numbers: each bar is a 0..1 width and its
 * state; the facts are the Spanish labels of "Lo que sabés de…"; the help is the step the server decided on
 * (the client may raise it with its silence clock) and its content. `completed`: the goal was met and the scene
 * closes on the player's next turn.
 */
export const CONVERSATION_NOTICES = ["early_errand", "real_data", "l1"] as const;
export const ConversationStateSchema = z.strictObject({
  type: z.literal("conversation.state"),
  npcName: z.string().min(1).max(80),
  activeMeter: z.string().min(1).nullable(),
  meters: z.array(z.strictObject({
    id: z.string().min(1),
    kind: z.enum(["rapport", "request", "persuasion", "negotiation"]),
    label: z.string().min(1).max(80),
    fill: z.number().min(0).max(1),
    status: z.enum(["active", "locked", "full"]),
  })).max(6),
  facts: z.array(z.strictObject({ id: z.string().min(1), label: z.string().min(1).max(120) })).max(40),
  stalled: z.boolean(),
  notice: z.enum(CONVERSATION_NOTICES).nullable(),
  help: z.strictObject({
    level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    hint: z.string().max(300).nullable(),
    phrases: z.array(z.string().min(1).max(120)).max(4),
  }),
  completed: z.boolean(),
});
export type ConversationStateMessage = z.infer<typeof ConversationStateSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  ConversationStateSchema,
  z.strictObject({
    type: z.literal("scene.opened"),
    sceneRunId: z.string().min(1), missionId: MissionId, sceneId: SceneId, npcId: NpcId.nullable(),
    modality: z.enum(["voice", "text"]),
  }),
  z.strictObject({
    type: z.literal("scene.state"),
    state: z.enum(SCENE_STEP_NAMES),
    sub: z.enum(["waiting", "speaking", "endPending", "passMenu", "committed"]).nullable(),
    modality: z.enum(["voice", "text"]),
    turnIndex: z.number().int().nonnegative(),
    softCapReached: z.boolean(),
  }),
  z.strictObject({ type: z.literal("npc.line"), line: LineSchema }),
  /** The NPC does not open a scene: asks for an introduction (and greets with its scripted line) or has nothing right now. */
  z.strictObject({ type: z.literal("scene.blocked"), npcId: NpcId.nullable(), reason: z.enum(["notIntroduced", "noScene"]) }),
  z.strictObject({ type: z.literal("scene.effects"), missionId: MissionId, sceneId: SceneId, effects: z.array(WorldEffectSchema) }),
  z.strictObject({
    type: z.literal("scene.end"),
    outcome: z.enum(["success", "partial", "hardCap", "containment", "aborted"]),
    criteriaMet: z.array(z.string()),
    evidence: z.array(EvidenceEventSchema),
  }),
  /**
   * Moderation cut (F4.2, 03 §7.7): at which layer it was detected (player input, NPC output or observer) and
   * what happened (cut + safe line, or containment). It never carries the cut text or the term that triggered it.
   */
  z.strictObject({ type: z.literal("scene.safety"), layer: z.enum(SAFETY_LAYERS), action: z.enum(["cut", "containment"]) }),
  /** Containment (D-112): out-of-fiction line and local help resource. `provisional`: unreviewed texts (F13). */
  z.strictObject({
    type: z.literal("scene.containment"),
    line: z.string().min(1),
    resource: z.strictObject({ label: z.string().min(1), detail: z.string().min(1) }).nullable(),
    provisional: z.boolean(),
  }),
  /**
   * F5.2: what the server heard from the player in a voice turn (`final: false` while they speak; `final: true` when the
   * transcript is complete and passed input moderation). `npc` is reserved for the F5.1b holdback: today
   * the NPC line arrives moderated and complete via `npc.line`. It never carries audio (D-108).
   */
  z.strictObject({
    type: z.literal("turn.transcript"),
    turnId: z.string().min(1),
    speaker: z.enum(["player", "npc"]),
    text: z.string().max(2000),
    final: z.boolean(),
  }),
  /** Error event that does not cut the scene (e.g. the observer failed to validate twice). */
  z.strictObject({ type: z.literal("scene.notice"), code: z.enum(NOTICE_CODES), message: z.string(), cause: NoticeCauseSchema.optional() }),
  z.strictObject({ type: z.literal("error"), code: z.enum(ERROR_CODES), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Response of POST /scene-token (over the server's `{ ok, data }`). */
export const SceneTokenSchema = z.strictObject({ token: z.string().min(16), wsPath: z.string() });
export type SceneToken = z.infer<typeof SceneTokenSchema>;
