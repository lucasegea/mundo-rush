// Arranque del proceso: `npm start --workspace @lg/server` (node con type stripping, Node >= 22.18).
// Escucha solo en 127.0.0.1 (D-158); el puerto sale de LG_PORT (por defecto 8787).
import type { AddressInfo } from "node:net";
import { createHttpServer, listenOptions, SERVICE_NAME } from "./http.ts";

const { host, port } = listenOptions(process.env);
const server = createHttpServer();

server.on("error", (err) => {
  console.error(`${SERVICE_NAME}: no pudo escuchar en ${host}:${port}: ${err.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const { port: actual } = server.address() as AddressInfo;
  console.log(`${SERVICE_NAME} escuchando en http://${host}:${actual}`);
});

const stop = (): void => {
  server.close(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
