// Process startup: `npm start --workspace @lg/server` (node with type stripping, Node >= 22.18).
// Listens only on 127.0.0.1 (D-158); the port comes from LG_PORT (default 8787). With LG_OPERATOR_MODE=1 it serves
// scenes (token + WebSocket) for the op-local account; with LG_DEV_CONTENT_WATCH=1 (director mode) it rereads the compiled
// content between scenes. Evidence goes to apps/server/data/evidence.jsonl (gitignored, D-157; with LG_UNIVERSE other than U-CAMPESINO, evidence.<id>.jsonl, D-812); with LG_FAKE_MODELS=1
// it goes to memory (storesFromEnv): a scripted run never writes fake progress into the real log.
// F5.1a: voice via the `voice.npc.adapter` adapter (models.yaml); voice cost goes to apps/server/data/cost-ledger.jsonl
// and an alert (average > US$0.05/min, D-027) is printed without cutting anything off. Transcripts and prompts are never printed.
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
// Content is loaded with the first scene: /health works even if the compiled output doesn't exist yet.
// S4/D-806: the session's universe comes from the environment (dev:play --universe → LG_UNIVERSE); unset ⇒ U-CAMPESINO.
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
  // Presence only, never values (secrets contract).
  console.log(`${SERVICE_NAME}: universo ${sessionUniverse ?? "U-CAMPESINO (por defecto)"} · modo operador ${game.operatorMode ? "sí" : "no"} · LG_DEV_CONTENT_WATCH ${env["LG_DEV_CONTENT_WATCH"] === "1" ? "sí" : "no"} · ${GEMINI_KEY_VAR} presente: ${hasGeminiKey(env) ? "sí" : "no"} · modelos guionados (${FAKE_MODELS_VAR}) ${env[FAKE_MODELS_VAR] === "1" && game.operatorMode ? "sí" : "no"} · clasificador de moderación: ${models.moderation.classifier} · evidencia ${stores.persistent ? "en apps/server/data/" : "en memoria (se pierde al cerrar)"} · voz: ${voice.adapter}${voice.factory ? "" : ` (no disponible: ${voice.reason ?? "?"})`}`);
});

const stop = (): void => {
  game.close();
  loader?.close();
  server.close(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
