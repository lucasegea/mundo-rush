// Arranque del proceso: `npm start --workspace @lg/server` (node con type stripping, Node >= 22.18).
// Escucha solo en 127.0.0.1 (D-158); el puerto sale de LG_PORT (por defecto 8787). Con LG_OPERATOR_MODE=1 sirve
// escenas (token + WebSocket) para la cuenta op-local; con LG_DEV_CONTENT_WATCH=1 (modo director) relee el contenido
// compilado entre escenas. La evidencia va a apps/server/data/evidence.jsonl (gitignored, D-157).
import type { AddressInfo } from "node:net";
import { createGameServer, textProvidersFromEnv } from "./app.ts";
import { hasGeminiKey, GEMINI_KEY_VAR, loadModelsConfig } from "./config/models.ts";
import { assertOperatorHost } from "./config/operator.ts";
import { createContentLoader, type ContentLoader } from "./content/loader.ts";
import { listenOptions, SERVICE_NAME } from "./http.ts";
import { createFileEvidenceStore } from "./store/evidence.ts";

const env = process.env;
const { host, port } = listenOptions(env);
assertOperatorHost(host, env);
const models = loadModelsConfig();
// El contenido se carga con la primera escena: /health anda aunque la salida compilada todavía no exista.
let loader: ContentLoader | null = null;
const game = createGameServer({
  env, models, content: () => (loader ??= createContentLoader({ env })).forNextScene(), evidence: createFileEvidenceStore(), ...textProvidersFromEnv(models, env),
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
  console.log(`${SERVICE_NAME}: modo operador ${game.operatorMode ? "sí" : "no"} · LG_DEV_CONTENT_WATCH ${env["LG_DEV_CONTENT_WATCH"] === "1" ? "sí" : "no"} · ${GEMINI_KEY_VAR} presente: ${hasGeminiKey(env) ? "sí" : "no"}`);
});

const stop = (): void => {
  game.close();
  loader?.close();
  server.close(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
