// Interfaz de modelo de texto (03 §5.10: `TextModelProvider`). La usan el NPC en modo texto y el observador. Los
// adaptadores reales viven en providers/; los tests usan el falso de test/fakes/ (nunca una API paga, D-027).
import type { NoticeCause } from "@lg/protocol";

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

/** `empty`: el proveedor respondió 200 sin texto (open-world-3d T1; antes caía en `http`). */
export type ProviderErrorCode = "unavailable" | "truncated" | "http" | "timeout" | "empty";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  /** Estado HTTP de la respuesta cuando la hubo (402, 429, 500...); null si no hubo respuesta (red, timeout). */
  readonly status: number | null;
  constructor(message: string, code: ProviderErrorCode, status: number | null = null) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
  }
}

/**
 * La causa que viaja en `scene.notice` (open-world-3d T1): sale SOLO de `code` y `status` de un `ProviderError`;
 * cualquier otro valor lanzado es `unknown`. El mensaje del error nunca se lee (puede traer una clave o un cuerpo).
 */
export const noticeCause = (err: unknown): NoticeCause => {
  if (!(err instanceof ProviderError)) return { kind: "unknown", status: null };
  const status = err.status !== null && Number.isInteger(err.status) && err.status >= 100 && err.status <= 599 ? err.status : null;
  return { kind: err.code, status };
};

/** Proveedor sin configurar (sin clave): falla claro en cada llamada, sin red. */
export const unavailableProvider = (reason: string): TextModelProvider => ({
  id: "unavailable",
  generate: () => Promise.reject(new ProviderError(reason, "unavailable")),
});
