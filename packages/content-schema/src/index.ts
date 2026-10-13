// @lg/content-schema — esquemas zod + validador + compilador de contenido (03 §4.2, §6.1).
// Puro: sin fs ni red. scripts/content/build.ts lee content/ y escribe la salida (D-159).
export const PACKAGE_NAME = "@lg/content-schema";

export * from "./ids.ts";
export * from "./schemas/common.ts";
export * from "./schemas/npc.ts";
export * from "./schemas/mision.ts";
export * from "./schemas/mundo.ts";
export * from "./schemas/saber.ts";
export * from "./schemas/red.ts";
export * from "./schemas/lumi.ts";
export * from "./schemas/aprendizaje.ts";
export * from "./schemas/control.ts";
export * from "./schemas/pedido.ts";
export * from "./schemas/conversacion.ts";
export * from "./schemas/assets.ts";

export { compilarContenido, compilarIncremental } from "./compile/compilar.ts";
export type { Resultado, ResultadoIncremental } from "./compile/compilar.ts";
export { necesitaRegistro } from "./compile/assets.ts";
export { filtrarGlosario, filtrarSaberes } from "./compile/vistas.ts";
export type { Salida } from "./compile/vistas.ts";
export { buscarRetirados, RUTA_RETIRADOS } from "./compile/retirados.ts";
export { encontrarCifra, oraciones, palabras, regexTermino } from "./compile/lints.ts";
export { formatearHallazgo } from "./compile/tipos.ts";
export type { ArchivoFuente, Hallazgo, Modo } from "./compile/tipos.ts";
