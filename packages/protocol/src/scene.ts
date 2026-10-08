// Mensajes cliente ↔ servidor de una escena por texto (F4.1; 03 §5.3, §5.6-§5.8) y contratos que viajan con ellos:
// salida del observador (03 §5.7), evento de evidencia (03 §3.5.3) y efectos de misión (03 §6.4.8).
// Todos los objetos son estrictos: un campo de más (un prompt, un nombre de modelo, una clave) no valida (A4).
// Los mensajes de voz quedan reservados (F5): existen en el esquema y el servidor responde `not_implemented`.
import { z } from "zod";

const NpcId = z.string().regex(/^NPC-[A-Z0-9-]+$/);
const MissionId = z.string().regex(/^M\d+\.\d+$/);
const SceneId = z.string().regex(/^M\d+\.\d+-E\d+$/);
const Iso = z.iso.datetime();

/** Ruta del WebSocket de escena y del token de un solo uso (03 §5.3, D-158). */
export const SCENE_WS_PATH = "/scene";
export const SCENE_TOKEN_PATH = "/scene-token";

// ---------- efectos de misión (03 §6.4.8) ----------

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

// ---------- evidencia (03 §3.5.3, D-157): append-only, la escribe el servidor ----------

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
  /** Solo en `mission_outcome`: cómo cerró la escena y qué efectos emitió. */
  outcome: z.enum(["success", "partial", "hardCap"]).optional(),
  effects: z.array(WorldEffectSchema).optional(),
  criteriaMet: z.array(z.string()).optional(),
});
export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;

// ---------- cliente → servidor ----------

export const PassOptionSchema = z.enum(["hint", "repeat", "simpler", "continue"]);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  /** Hablar con un NPC; `null` abre la escena del compañero sin NPC (como M0.2). Modo operador: cuenta `op-local`. */
  z.strictObject({ type: z.literal("scene.start"), npcId: NpcId.nullable() }),
  /** Turno por texto: el jugador escribe y aprieta Terminé. */
  z.strictObject({ type: z.literal("turn.text"), text: z.string().trim().min(1).max(500) }),
  z.strictObject({ type: z.literal("turn.pass") }),
  z.strictObject({ type: z.literal("turn.choose"), option: PassOptionSchema }),
  z.strictObject({ type: z.literal("scene.abort") }),
  // Reservados para voz (F5): el audio va en frames binarios aparte (framing de 03 §4.2).
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
  /** NPC que habla o LUMI (sus líneas viajan como id de plantilla, nunca texto libre del modelo). */
  speaker: z.union([NpcId, z.literal("LUMI")]),
  kind: z.enum(["pretask", "opening", "reply", "closing", "exit", "notIntroduced"]),
  text: z.string().nullable(),
  template: z.string().nullable(),
});

export const NOTICE_CODES = ["observer_invalid", "model_unavailable", "containment"] as const;
export const ERROR_CODES = ["bad_message", "not_implemented", "scene_busy", "no_scene", "unknown_npc", "not_your_turn"] as const;

export const ServerMessageSchema = z.discriminatedUnion("type", [
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
  /** El NPC no abre escena: pide presentación (y saluda con su línea guionada) o no tiene nada ahora. */
  z.strictObject({ type: z.literal("scene.blocked"), npcId: NpcId.nullable(), reason: z.enum(["notIntroduced", "noScene"]) }),
  z.strictObject({ type: z.literal("scene.effects"), missionId: MissionId, sceneId: SceneId, effects: z.array(WorldEffectSchema) }),
  z.strictObject({
    type: z.literal("scene.end"),
    outcome: z.enum(["success", "partial", "hardCap", "containment", "aborted"]),
    criteriaMet: z.array(z.string()),
    evidence: z.array(EvidenceEventSchema),
  }),
  /** Evento de error que no corta la escena (p. ej. el observador no validó dos veces). */
  z.strictObject({ type: z.literal("scene.notice"), code: z.enum(NOTICE_CODES), message: z.string() }),
  z.strictObject({ type: z.literal("error"), code: z.enum(ERROR_CODES), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Respuesta de POST /scene-token (sobre `{ ok, data }` del servidor). */
export const SceneTokenSchema = z.strictObject({ token: z.string().min(16), wsPath: z.string() });
export type SceneToken = z.infer<typeof SceneTokenSchema>;
