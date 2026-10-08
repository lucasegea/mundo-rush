// Selección del adaptador de voz del NPC por configuración (03 §5.10-§5.11, D-092, ADR-023): `voice.npc.adapter` en
// models.yaml elige el adaptador y scene-runtime no cambia. Toda la elección vive acá, en providers/ (F5.1a A4).
// Sin clave no hay sesión de voz: la escena de voz cae a texto con aviso (03 §5.8). Nunca se lee ni imprime la clave.
import { GEMINI_KEY_VAR, hasGeminiKey, type ModelsConfig } from "../config/models.ts";
import { createGeminiLiveProvider } from "./gemini-live/adapter.ts";
import { ProviderError } from "./text.ts";
import type { RealtimeVoiceProvider, VoiceProviderFactory } from "./types.ts";

export const CASCADE_ADAPTER = "cascade";

export interface VoiceSelection {
  /** null: la voz no está disponible (y `reason` dice por qué, sin datos sensibles). */
  factory: VoiceProviderFactory | null;
  adapter: ModelsConfig["voice"]["npc"]["adapter"];
  reason: string | null;
}

/** La cascada llega en F5.1b: hasta entonces, un adaptador que no abre (la escena sigue por texto). */
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
