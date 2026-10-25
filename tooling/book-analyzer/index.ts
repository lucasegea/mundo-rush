// tooling/book-analyzer — analizador libro → universo, offline/build-time (ADR-029, book-mode slice-1).
// Workspace `@lg/book-analyzer` (private). Nadie del producto lo importa (zona de lint: producto ↛ tooling).
// La CLI es src/cli.ts; el pipeline y EMIT se exportan para los tests.
export { correrPipeline } from "./src/pipeline.ts";
export type { OpcionesPipeline } from "./src/pipeline.ts";
export { emit, planearEmit } from "./src/stages/emit.ts";
export type { ArchivoEmitido, ResultadoEmit, SalidaEmit } from "./src/stages/emit.ts";
export { parsearIntermedio, CLAVES_INTERMEDIO, ErrorIntermedio } from "./src/intermediate.ts";
export type { Intermedio } from "./src/intermediate.ts";
export { runCli, USAGE } from "./src/cli.ts";
