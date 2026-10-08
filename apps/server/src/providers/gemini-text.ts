// Adaptador de texto de Gemini (03 §5.10) por fetch a la API REST, sin SDK. Solo se construye con clave presente y lo
// usan el servidor del operador y la eval en vivo opt-in (scripts/eval/live-text.ts, D-027); ningún test lo llama.
// La clave va en un header y jamás aparece en errores, logs ni mensajes al cliente.
import { ProviderError, type TextModelProvider, type TextRequest, type TextResponse } from "./text.ts";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
}

export function createGeminiTextProvider(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): TextModelProvider {
  if (apiKey === "") throw new ProviderError("falta la clave del proveedor de texto", "unavailable");
  return {
    id: `gemini-text:${model}`,
    async generate(req: TextRequest): Promise<TextResponse> {
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { maxOutputTokens: req.maxOutputTokens, ...(req.json ? { responseMimeType: "application/json" } : {}) },
      };
      let res: Response;
      try {
        res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(req.timeoutMs),
        });
      } catch (err) {
        const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        throw new ProviderError(timeout ? "el proveedor no respondió a tiempo" : "error de red con el proveedor", timeout ? "timeout" : "http");
      }
      if (!res.ok) throw new ProviderError(`el proveedor respondió ${res.status}`, "http");
      const data = (await res.json()) as GeminiResponse;
      const candidate = data.candidates?.[0];
      // finishReason antes de usar el texto: una salida cortada no se interpreta como respuesta.
      if (candidate?.finishReason === "MAX_TOKENS") throw new ProviderError("respuesta truncada (MAX_TOKENS)", "truncated");
      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (text === "") throw new ProviderError("respuesta vacía del proveedor", "http");
      return { text };
    },
  };
}
