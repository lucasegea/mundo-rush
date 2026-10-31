// NPC voice adapter selection by configuration (03 §5.10-§5.11, D-092, ADR-023): `voice.npc.adapter` in
// models.yaml chooses the adapter and scene-runtime doesn't change. The whole choice lives here, in providers/ (F5.1a A4).
// Without a key there is no voice session: the voice scene falls back to text with a notice (03 §5.8). The key is never read or printed.
import { GEMINI_KEY_VAR, hasGeminiKey, type ModelsConfig } from "../config/models.ts";
import { createGeminiLiveProvider } from "./gemini-live/adapter.ts";
import { FAKE_MODELS_VAR } from "./scripted.ts";
import { ProviderError } from "./text.ts";
import type { RealtimeVoiceProvider, VoiceProviderFactory } from "./types.ts";

export const CASCADE_ADAPTER = "cascade";

export interface VoiceSelection {
  /** null: voice is not available (and `reason` says why, with no sensitive data). */
  factory: VoiceProviderFactory | null;
  adapter: ModelsConfig["voice"]["npc"]["adapter"];
  reason: string | null;
}

/** Cascade arrives in F5.1b: until then, an adapter that doesn't open (the scene carries on by text). */
const pendingCascade = (): RealtimeVoiceProvider => ({
  adapter: CASCADE_ADAPTER,
  provider: "cascade",
  model: "cascade",
  open: () => Promise.reject(new ProviderError("el adaptador de cascada llega en F5.1b", "unavailable")),
  injectContext: () => {},
  startTurn: () => {},
  sendAudio: () => {},
  endTurn: () => {},
  interrupt: () => {},
  close: () => Promise.resolve(),
  on: () => {},
});

export function voiceProviderFromConfig(
  models: ModelsConfig,
  env: Record<string, string | undefined>,
  test: { liveEndpoint?: string } = {},
): VoiceSelection {
  const adapter = models.voice.npc.adapter;
  // With scripted models a paid session is never opened, even if there is a key: there is no scripted voice, so the voice
  // scene falls back to text (03 §5.8) and carries on with the scripted NPC (D-027).
  if (env[FAKE_MODELS_VAR] === "1") return { adapter, factory: null, reason: `${FAKE_MODELS_VAR}=1: sin voz guionada, la escena sigue por texto` };
  switch (adapter) {
    case "cascade":
      return { adapter, factory: pendingCascade, reason: null };
    case "live": {
      if (!hasGeminiKey(env)) return { adapter, factory: null, reason: `sin ${GEMINI_KEY_VAR}: la voz no está configurada` };
      const role = models.roles.npcVoice;
      const apiKey = env[GEMINI_KEY_VAR] ?? "";
      return {
        adapter,
        reason: null,
        factory: () => createGeminiLiveProvider({
          apiKey, model: role.model, openTimeoutMs: role.openTimeoutMs, maxReconnects: role.maxReconnects,
          ...(test.liveEndpoint ? { endpoint: test.liveEndpoint } : {}),
        }),
      };
    }
  }
}
