// @lg/protocol — mensajes WS y DTOs REST (03 §4.2). Solo depende de zod (03 §4.3).
// F4.1: escena por texto (mensajes, observador, evidencia, efectos). Extensión .ts: el servidor lo corre con Node.
// El modo director va por la subruta @lg/protocol/director y no se re-exporta acá (FD0).
export const PACKAGE_NAME = "@lg/protocol";

export * from "./scene.ts";
