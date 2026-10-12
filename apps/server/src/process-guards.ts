// Guardas del proceso (A2, nit de la revisión de A1): una promesa rechazada que nadie maneja (p. ej. un gancho async
// que se escapó) no tira el servidor en medio de una escena: se registra y el proceso sigue. Nunca se imprimen
// transcripciones ni prompts: solo el mensaje del error.

/** Lo mínimo de `process` que hace falta (los tests pasan un emisor falso). */
export interface ProcessEvents {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): unknown;
}

export function installProcessGuards(proc: ProcessEvents, log: (message: string) => void, name = "lg-server"): void {
  proc.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "motivo desconocido";
    log(`${name}: promesa rechazada sin manejar (el proceso sigue): ${message}`);
  });
}
