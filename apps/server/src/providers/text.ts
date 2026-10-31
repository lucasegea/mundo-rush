// Text model interface (03 §5.10: `TextModelProvider`). Used by the NPC in text mode and the observer. The
// real adapters live in providers/; tests use the fake in test/fakes/ (never a paid API, D-027).
import type { NoticeCause } from "@lg/protocol";

export interface TextTurn {
  readonly role: "user" | "model";
  readonly text: string;
}

export interface TextRequest {
  /** System prompt built by the server (the client never sees it, 03 §5.3). */
  readonly system: string;
  readonly turns: readonly TextTurn[];
  /** Asks for JSON (observer). */
  readonly json: boolean;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  /** Voice observer (D-095): PCM16 audio of the turn, attached to the request. Never stored. */
  readonly audio?: { readonly pcm16: Int16Array; readonly sampleRate: number };
}

export interface TextResponse {
  readonly text: string;
}

export interface TextModelProvider {
  readonly id: string;
  generate(req: TextRequest): Promise<TextResponse>;
}

/** `empty`: the provider answered 200 with no text (open-world-3d T1; before, it fell under `http`). */
export type ProviderErrorCode = "unavailable" | "truncated" | "http" | "timeout" | "empty";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  /** HTTP status of the response when there was one (402, 429, 500...); null if there was no response (network, timeout). */
  readonly status: number | null;
  constructor(message: string, code: ProviderErrorCode, status: number | null = null) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
  }
}

/**
 * The cause that travels in `scene.notice` (open-world-3d T1): comes ONLY from `code` and `status` of a `ProviderError`;
 * any other thrown value is `unknown`. The error message is never read (it may carry a key or a body).
 */
export const noticeCause = (err: unknown): NoticeCause => {
  if (!(err instanceof ProviderError)) return { kind: "unknown", status: null };
  const status = err.status !== null && Number.isInteger(err.status) && err.status >= 100 && err.status <= 599 ? err.status : null;
  return { kind: err.code, status };
};

/** Unconfigured provider (no key): fails clearly on every call, without network. */
export const unavailableProvider = (reason: string): TextModelProvider => ({
  id: "unavailable",
  generate: () => Promise.reject(new ProviderError(reason, "unavailable")),
});
