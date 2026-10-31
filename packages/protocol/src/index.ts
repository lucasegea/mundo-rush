// @lg/protocol — WS messages and REST DTOs (03 §4.2). Depends only on zod (03 §4.3).
// F4.1: text scene (messages, observer, evidence, effects). .ts extension: the server runs it with Node.
// Director mode goes through the @lg/protocol/director subpath and is not re-exported here (FD0).
export const PACKAGE_NAME = "@lg/protocol";

export * from "./scene.ts";
