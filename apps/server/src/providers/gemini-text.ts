// Adaptador de texto de Gemini (03 §5.10) por fetch a la API REST, sin SDK. Solo se construye con clave presente y lo
// usan el servidor del operador y la eval en vivo opt-in (scripts/eval/live-text.ts, D-027); ningún test lo llama.
// La clave va en un header y jamás aparece en errores, logs ni mensajes al cliente.
import { ProviderError, type TextModelProvider, type TextRequest, type TextResponse } from "./text.ts";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
}

/** PCM16 mono → WAV (cabecera RIFF de 44 bytes): formato de audio que acepta generateContent como inlineData. */
export function pcm16ToWav(pcm16: Int16Array, sampleRate: number): Buffer {
  const data = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.byteLength, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.byteLength, 40);
  return Buffer.concat([h, data]);
}

export function createGeminiTextProvider(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): TextModelProvider {
  if (apiKey === "") throw new ProviderError("falta la clave del proveedor de texto", "unavailable");
  return {
    id: `gemini-text:${model}`,
    async generate(req: TextRequest): Promise<TextResponse> {
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.turns.map((t, i) => ({
          role: t.role,
          parts: [
            { text: t.text },
            // El clip del turno va con el primer turno (el del jugador); se codifica acá y no se guarda.
            ...(i === 0 && req.audio ? [{ inlineData: { mimeType: "audio/wav", data: pcm16ToWav(req.audio.pcm16, req.audio.sampleRate).toString("base64") } }] : []),
          ],
        })),
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
      if (!res.ok) throw new ProviderError(`el proveedor respondió ${res.status}`, "http", res.status);
      const data = (await res.json()) as GeminiResponse;
      const candidate = data.candidates?.[0];
      // finishReason antes de usar el texto: una salida cortada no se interpreta como respuesta.
      if (candidate?.finishReason === "MAX_TOKENS") throw new ProviderError("respuesta truncada (MAX_TOKENS)", "truncated");
      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (text === "") throw new ProviderError("respuesta vacía del proveedor", "empty");
      return { text };
    },
  };
}
