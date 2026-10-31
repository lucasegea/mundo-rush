// Process guards (A2, nit from the A1 review): a rejected promise nobody handles (e.g. an async hook
// that slipped through) must not bring the server down in the middle of a scene: it is logged and the process carries on. Transcripts
// and prompts are never printed: only the error message.

/** The minimum of `process` that is needed (tests pass a fake emitter). */
export interface ProcessEvents {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): unknown;
}

export function installProcessGuards(proc: ProcessEvents, log: (message: string) => void, name = "lg-server"): void {
  proc.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "motivo desconocido";
    log(`${name}: promesa rechazada sin manejar (el proceso sigue): ${message}`);
  });
}
