// Slice `session` (03 §3.3): fase de la app, cuenta, conexión, experimentos, presupuesto de voz, idiomas.
// F1.3 usa la fase; el resto arranca en su estado inicial (cuenta y voz llegan con F4/F5).
import type { AppPhase } from "@lg/core";

export interface SessionState {
  phase: AppPhase;
  /** Cuenta seudónima (03 §3.3; modo operador `op-local`, D-158). null hasta F4.1. */
  account: { id: string; role: "player" | "operator"; ageBand: string | null; classId: string | null } | null;
  connection: "offline" | "connecting" | "online";
  /** Brazos de experimento asignados. */
  experimentArms: Record<string, string>;
  /** Minutos de voz que quedan; null = sin dato todavía. */
  voiceMinutesLeft: number | null;
  uiLanguage: "es-AR";
  languagePair: { l1: "es-AR"; l2: "en" };
}

export const SESSION_PERSIST = "server" as const;

export const initialSession = (): SessionState => ({
  phase: "boot",
  account: null,
  connection: "offline",
  experimentArms: {},
  voiceMinutesLeft: null,
  uiLanguage: "es-AR",
  languagePair: { l1: "es-AR", l2: "en" },
});
