// Modo operador (D-158): un solo jugador, el operador, en su máquina. Proceso ligado a 127.0.0.1, `LG_OPERATOR_MODE=1`,
// cuenta seudónima fija `op-local` y token de escena sin login. Fuera de loopback, el modo operador no arranca.

export const OPERATOR_ACCOUNT = "op-local";
export const OPERATOR_MODE_VAR = "LG_OPERATOR_MODE";

export const operatorModeOn = (env: Record<string, string | undefined>): boolean => env[OPERATOR_MODE_VAR] === "1";

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

/** D-158: si el modo operador se expone fuera de la máquina, el servidor se niega a arrancar. */
export function assertOperatorHost(host: string, env: Record<string, string | undefined>): void {
  if (operatorModeOn(env) && !LOOPBACK.has(host)) {
    throw new Error(`modo operador solo en loopback: el host ${host} no es local (D-158)`);
  }
}
