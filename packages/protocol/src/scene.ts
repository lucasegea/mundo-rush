// Mensajes cliente ↔ servidor de una escena por texto (F4.1; 03 §5.3, §5.6-§5.8) y contratos que viajan con ellos:
// salida del observador (03 §5.7), evento de evidencia (03 §3.5.3) y efectos de misión (03 §6.4.8).
// Todos los objetos son estrictos: un campo de más (un prompt, un nombre de modelo, una clave) no valida (A4).
// F5.1a: voz en el servidor. El cliente pide una escena de voz (`scene.start` con `modality: "voice"`), marca inicio y
// fin de su turno (`voice.turnStart`/`voice.turnEnd`, D-091) y manda el audio en frames binarios aparte (ADR-017).
// F5.2: el cliente captura y reproduce ese audio (apps/web/src/services/audio) y recibe lo que el servidor oyó de su
// turno (`turn.transcript`).
import { z } from "zod";

const NpcId = z.string().regex(/^NPC-[A-Z0-9-]+$/);
const MissionId = z.string().regex(/^M\d+\.\d+$/);
const SceneId = z.string().regex(/^M\d+\.\d+-E\d+$/);
const Iso = z.iso.datetime();

/**
 * Framing del audio en el WebSocket de escena (ADR-017): frames BINARIOS sin cabecera, PCM16 little-endian mono.
 * Cliente → servidor: la voz del jugador a 16 kHz, solo entre `voice.turnStart` y `voice.turnEnd`.
 * Servidor → cliente: la voz del NPC a 24 kHz, solo durante `npcTurn` (invariante a de 03 §3.5.1).
 */
export const PLAYER_AUDIO_SAMPLE_RATE = 16000;
export const NPC_AUDIO_SAMPLE_RATE = 24000;

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
  z.strictObject({
    type: z.literal("scene.start"),
    npcId: NpcId.nullable(),
    /** Por omisión, texto. Voz sin sesión disponible (sin clave, proveedor caído): la escena sigue por texto con aviso. */
    modality: z.enum(["voice", "text"]).optional(),
  }),
  /** Turno por texto: el jugador escribe y aprieta Terminé. */
  z.strictObject({ type: z.literal("turn.text"), text: z.string().trim().min(1).max(500) }),
  z.strictObject({ type: z.literal("turn.pass") }),
  z.strictObject({ type: z.literal("turn.choose"), option: PassOptionSchema }),
  z.strictObject({ type: z.literal("scene.abort") }),
  // Voz (F5.1a): inicio y fin del turno hablado (fin = `Terminé` o el umbral de silencio local). El audio va en frames
  // binarios aparte (PLAYER_AUDIO_SAMPLE_RATE).
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
  /** `safe`: línea segura guionada que reemplaza un turno cortado por la moderación (F4.2, 03 §7.7). */
  kind: z.enum(["pretask", "opening", "reply", "closing", "exit", "notIntroduced", "safe"]),
  text: z.string().nullable(),
  template: z.string().nullable(),
});

export const SAFETY_LAYERS = ["input", "output", "observer"] as const;
export type SafetyLayer = (typeof SAFETY_LAYERS)[number];

export const NOTICE_CODES = ["observer_invalid", "model_unavailable", "containment"] as const;
/** `not_voice`: un mensaje o frame de voz en una escena que no está en modo voz. */
export const ERROR_CODES = ["bad_message", "not_implemented", "scene_busy", "no_scene", "unknown_npc", "not_your_turn", "not_voice"] as const;

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
  /**
   * Corte de moderación (F4.2, 03 §7.7): en qué capa se detectó (entrada del jugador, salida del NPC u observador) y
   * qué pasó (corte + línea segura, o contención). Nunca lleva el texto cortado ni el término que disparó.
   */
  z.strictObject({ type: z.literal("scene.safety"), layer: z.enum(SAFETY_LAYERS), action: z.enum(["cut", "containment"]) }),
  /** Contención (D-112): línea fuera de la ficción y recurso de ayuda local. `provisional`: textos sin revisar (F13). */
  z.strictObject({
    type: z.literal("scene.containment"),
    line: z.string().min(1),
    resource: z.strictObject({ label: z.string().min(1), detail: z.string().min(1) }).nullable(),
    provisional: z.boolean(),
  }),
  /**
   * F5.2: lo que el servidor oyó del jugador en un turno de voz (`final: false` mientras habla; `final: true` cuando la
   * transcripción quedó completa y pasó la moderación de entrada). `npc` queda reservado para el holdback de F5.1b: hoy
   * la línea del NPC llega moderada y completa por `npc.line`. Nunca lleva audio (D-108).
   */
  z.strictObject({
    type: z.literal("turn.transcript"),
    turnId: z.string().min(1),
    speaker: z.enum(["player", "npc"]),
    text: z.string().max(2000),
    final: z.boolean(),
  }),
  /** Evento de error que no corta la escena (p. ej. el observador no validó dos veces). */
  z.strictObject({ type: z.literal("scene.notice"), code: z.enum(NOTICE_CODES), message: z.string() }),
  z.strictObject({ type: z.literal("error"), code: z.enum(ERROR_CODES), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Respuesta de POST /scene-token (sobre `{ ok, data }` del servidor). */
export const SceneTokenSchema = z.strictObject({ token: z.string().min(16), wsPath: z.string() });
export type SceneToken = z.infer<typeof SceneTokenSchema>;
