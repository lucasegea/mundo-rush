// tooling/book-analyzer — book → universe analyzer, offline/build-time (ADR-029, book-mode slice-1).
// Workspace `@lg/book-analyzer` (private). Nothing in the product imports it (lint zone: product ↛ tooling).
// The CLI is src/cli.ts; the pipeline and EMIT are exported for the tests.
export { correrPipeline } from "./src/pipeline.ts";
export type { OpcionesPipeline } from "./src/pipeline.ts";
export { emit, planearEmit } from "./src/stages/emit.ts";
export type { ArchivoEmitido, ResultadoEmit, SalidaEmit } from "./src/stages/emit.ts";
export { parsearIntermedio, CLAVES_INTERMEDIO, ErrorIntermedio } from "./src/intermediate.ts";
export type { Intermedio } from "./src/intermediate.ts";
export { runCli, USAGE } from "./src/cli.ts";
