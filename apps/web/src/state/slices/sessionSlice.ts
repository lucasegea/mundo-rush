// Slice `session` (03 §3.3): app phase, account, connection, experiments, voice budget, languages.
// F1.3 uses the phase; the rest starts in its initial state (account and voice arrive with F4/F5).
import type { AppPhase } from "@lg/core";

export interface SessionState {
  phase: AppPhase;
  /** Pseudonymous account (03 §3.3; operator mode `op-local`, D-158). null until F4.1. */
  account: { id: string; role: "player" | "operator"; ageBand: string | null; classId: string | null } | null;
  connection: "offline" | "connecting" | "online";
  /** Assigned experiment arms. */
  experimentArms: Record<string, string>;
  /** Voice minutes left; null = no data yet. */
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
