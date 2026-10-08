// scene/ — máquina de escena (03 §3.5.1), criterios de éxito y efectos de misión (03 §6.4.8). Compartido por cliente y
// servidor. Importa con extensión .ts y sin nada de fuera de la carpeta: el servidor lo corre con el type stripping de
// Node por la subruta `@lg/core/scene` (el resto del núcleo usa resolución de bundler).
export * from "./machine.ts";
export * from "./criteria.ts";
export * from "./world.ts";
