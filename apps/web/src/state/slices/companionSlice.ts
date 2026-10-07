// Slice `companion` (03 §3.3): Lumi. Arranca en su estado inicial; la política llega con F6.
export interface CompanionState {
  state: "idle" | "listening" | "speaking" | "signal" | "noted";
  /** Señal activa: id de plantilla, escalón de la escalera, audio cacheado. */
  signal: { templateId: string; step: number; audio: string | null } | null;
  bubbleVisible: boolean;
  queue: string[];
  /** Brillo derivado de la evidencia total (0-1). */
  glow: number;
  notedThisScene: string[];
}

/** No se persiste: deriva de progression y learner. */
export const COMPANION_PERSIST = "none" as const;

export const initialCompanion = (): CompanionState => ({
  state: "idle",
  signal: null,
  bubbleVisible: false,
  queue: [],
  glow: 0,
  notedThisScene: [],
});
