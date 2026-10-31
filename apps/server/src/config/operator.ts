// Operator mode (D-158): a single player, the operator, on their machine. Process bound to 127.0.0.1, `LG_OPERATOR_MODE=1`,
// fixed pseudonymous account `op-local` and a scene token with no login. Outside loopback, operator mode does not start.

export const OPERATOR_ACCOUNT = "op-local";
export const OPERATOR_MODE_VAR = "LG_OPERATOR_MODE";

export const operatorModeOn = (env: Record<string, string | undefined>): boolean => env[OPERATOR_MODE_VAR] === "1";

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

/** D-158: if operator mode is exposed outside the machine, the server refuses to start. */
export function assertOperatorHost(host: string, env: Record<string, string | undefined>): void {
  if (operatorModeOn(env) && !LOOPBACK.has(host)) {
    throw new Error(`modo operador solo en loopback: el host ${host} no es local (D-158)`);
  }
}
