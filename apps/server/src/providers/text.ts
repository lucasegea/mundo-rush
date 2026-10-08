// Interfaz de modelo de texto (03 §5.10: `TextModelProvider`). La usan el NPC en modo texto y el observador. Los
// adaptadores reales viven en providers/; los tests usan el falso de test/fakes/ (nunca una API paga, D-027).

export interface TextTurn {
  readonly role: "user" | "model";
  readonly text: string;
}

export interface TextRequest {
  /** Prompt de sistema armado por el servidor (el cliente nunca lo ve, 03 §5.3). */
  readonly system: string;
  readonly turns: readonly TextTurn[];
  /** Pide JSON (observador). */
  readonly json: boolean;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  /** Observador en voz (D-095): audio PCM16 del turno, adjunto al pedido. Nunca se guarda. */
  readonly audio?: { readonly pcm16: Int16Array; readonly sampleRate: number };
}

export interface TextResponse {
  readonly text: string;
}

export interface TextModelProvider {
  readonly id: string;
  generate(req: TextRequest): Promise<TextResponse>;
}

export type ProviderErrorCode = "unavailable" | "truncated" | "http" | "timeout";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  constructor(message: string, code: ProviderErrorCode) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}

/** Proveedor sin configurar (sin clave): falla claro en cada llamada, sin red. */
export const unavailableProvider = (reason: string): TextModelProvider => ({
  id: "unavailable",
  generate: () => Promise.reject(new ProviderError(reason, "unavailable")),
});
