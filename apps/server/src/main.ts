// Arranque del proceso: `npm start --workspace @lg/server` (node con type stripping, Node >= 22.18).
// Escucha solo en 127.0.0.1 (D-158); el puerto sale de LG_PORT (por defecto 8787). Con LG_OPERATOR_MODE=1 sirve
// escenas (token + WebSocket) para la cuenta op-local; con LG_DEV_CONTENT_WATCH=1 (modo director) relee el contenido
// compilado entre escenas. La evidencia va a apps/server/data/evidence.jsonl (gitignored, D-157); con LG_FAKE_MODELS=1
// va a memoria (storesFromEnv): una corrida guionada nunca escribe progreso falso en el log real.
// F5.1a: voz por el adaptador de `voice.npc.adapter` (models.yaml); el costo de voz va a apps/server/data/cost-ledger.jsonl
// y una alerta (promedio > US$0,05/min, D-027) se imprime sin cortar nada. Nunca se imprimen transcripciones ni prompts.
import type { AddressInfo } from "node:net";
import { createGameServer, storesFromEnv, textProvidersFromEnv } from "./app.ts";
import { hasGeminiKey, GEMINI_KEY_VAR, loadModelsConfig, moderationProviderFromConfig } from "./config/models.ts";
import { assertOperatorHost } from "./config/operator.ts";
import { createContentLoader, universeIdFromEnv, type ContentLoader } from "./content/loader.ts";
import { listenOptions, SERVICE_NAME } from "./http.ts";
import { FAKE_MODELS_VAR } from "./providers/scripted.ts";
import { voiceProviderFromConfig } from "./providers/voice.ts";
import { installProcessGuards } from "./process-guards.ts";

const env = process.env;
installProcessGuards(process, (m) => console.error(m), SERVICE_NAME);
const { host, port } = listenOptions(env);
assertOperatorHost(host, env);
const models = loadModelsConfig();
// El contenido se carga con la primera escena: /health anda aunque la salida compilada todavía no exista.
// S4/D-806: el universo de la sesión sale del entorno (dev:play --universe → LG_UNIVERSE); unset ⇒ U-CAMPESINO.
const sessionUniverse = universeIdFromEnv(env);
let loader: ContentLoader | null = null;
const stores = storesFromEnv(env, {}, models);
const voice = voiceProviderFromConfig(models, env);
const game = createGameServer({
  env, models, content: () => (loader ??= createContentLoader({ env, ...(sessionUniverse ? { universeId: sessionUniverse } : {}) })).forNextScene(), evidence: stores.evidence, ...textProvidersFromEnv(models, env),
  moderation: moderationProviderFromConfig(models), safety: stores.safety, encounters: stores.encounters,
  onConversationLog: (m) => console.warn(`${SERVICE_NAME}: ${m}`),
  voice: voice.factory, ...(stores.ledger ? { ledger: stores.ledger } : {}),
  onCostAlert: (a) => console.warn(`${SERVICE_NAME}: ALERTA de costo de voz: promedio US$${a.usdPerMin.toFixed(4)}/min en ${a.scenes} escenas (umbral US$${a.thresholdUsdPerMin}/min). No corta el juego (D-027).`),
  onCostError: (m) => console.error(`${SERVICE_NAME}: el libro de costos no registró un uso de voz: ${m}`),
});
const { server } = game;

server.on("error", (err) => {
  console.error(`${SERVICE_NAME}: no pudo escuchar en ${host}:${port}: ${err.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const { port: actual } = server.address() as AddressInfo;
  console.log(`${SERVICE_NAME} escuchando en http://${host}:${actual}`);
  // Solo presencia, nunca valores (contrato de secretos).
  console.log(`${SERVICE_NAME}: universo ${sessionUniverse ?? "U-CAMPESINO (por defecto)"} · modo operador ${game.operatorMode ? "sí" : "no"} · LG_DEV_CONTENT_WATCH ${env["LG_DEV_CONTENT_WATCH"] === "1" ? "sí" : "no"} · ${GEMINI_KEY_VAR} presente: ${hasGeminiKey(env) ? "sí" : "no"} · modelos guionados (${FAKE_MODELS_VAR}) ${env[FAKE_MODELS_VAR] === "1" && game.operatorMode ? "sí" : "no"} · clasificador de moderación: ${models.moderation.classifier} · evidencia ${stores.persistent ? "en apps/server/data/" : "en memoria (se pierde al cerrar)"} · voz: ${voice.adapter}${voice.factory ? "" : ` (no disponible: ${voice.reason ?? "?"})`}`);
});

const stop = (): void => {
  game.close();
  loader?.close();
  server.close(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
