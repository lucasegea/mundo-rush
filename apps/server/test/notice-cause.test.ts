// open-world-3d T1 (AC1 to AC3): a `model_unavailable` from the NPC in text says why, with a structured cause that
// comes only from `ProviderError.code` and `status`. The scene stays open for the next turn.
import { describe, expect, test } from "vitest";
import { createGeminiTextProvider } from "../src/providers/gemini-text.ts";
import { ProviderError, type TextModelProvider } from "../src/providers/text.ts";
import { M01_RULES } from "./fakes/text-model.ts";
import { harness } from "./helpers.ts";

const rejecting = (err: unknown): TextModelProvider => ({ id: "rejecting", generate: () => Promise.reject(err) });

/** Opens M0.1 with Inés and sends a turn that doesn't meet the criteria: the NPC has to answer (and fails). */
async function failedTurn(npcModel: TextModelProvider) {
  const h = harness({ rules: M01_RULES, npcModel });
  await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
  await h.session.receive({ type: "turn.text", text: "Hello!" });
  return h;
}

describe("AC1: un 402 del proveedor llega como causa http con su estado", () => {
  test("notice model_unavailable con cause {http, 402}; la escena sigue esperando el próximo turno", async () => {
    const h = await failedTurn(rejecting(new ProviderError("el proveedor respondio 402", "http", 402)));
    expect(h.of("scene.notice")).toEqual([
      { type: "scene.notice", code: "model_unavailable", message: "El NPC no pudo responder (modelo no disponible).", cause: { kind: "http", status: 402 } },
    ]);
    expect(h.session.snapshot.state).toBe("playerTurn");
    expect(h.steps().at(-1)).toBe("playerTurn.waiting");
    expect(h.of("scene.end")).toEqual([]);
  });
});

describe("AC2: cada falla da su kind; status null salvo un http con respuesta", () => {
  test("timeout, empty, truncated, Error plano y http sin estado (red caída)", async () => {
    const errs: unknown[] = [
      new ProviderError("x", "timeout"),
      new ProviderError("x", "empty"),
      new ProviderError("x", "truncated"),
      new Error("x"),
      new ProviderError("error de red con el proveedor", "http"),
    ];
    const causes = [];
    for (const err of errs) causes.push((await failedTurn(rejecting(err))).of("scene.notice")[0]?.cause);
    expect(causes).toEqual([
      { kind: "timeout", status: null },
      { kind: "empty", status: null },
      { kind: "truncated", status: null },
      { kind: "unknown", status: null },
      { kind: "http", status: null },
    ]);
  });
});

describe("AC3: el texto del error nunca viaja al cliente", () => {
  test("una falla de red con la clave en el mensaje: ningún mensaje la lleva y el aviso solo suma cause.kind y cause.status", async () => {
    const KEY = "KEY-TEST-4242";
    const fetchImpl = (() => Promise.reject(new Error(`fallo conectando con ${KEY}`))) as unknown as typeof fetch;
    const h = await failedTurn(createGeminiTextProvider(KEY, "modelo-test", fetchImpl));
    for (const m of h.sent) expect(JSON.stringify(m)).not.toContain(KEY);
    const notice = h.of("scene.notice")[0];
    expect(Object.keys(notice ?? {}).sort()).toEqual(["cause", "code", "message", "type"]);
    expect(Object.keys(notice?.cause ?? {}).sort()).toEqual(["kind", "status"]);
    expect(notice?.cause).toEqual({ kind: "http", status: null });
  });
});

describe("gemini-text: el estado HTTP y la respuesta vacía", () => {
  const respond = (status: number, body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;
  const req = { system: "s", turns: [{ role: "user" as const, text: "hi" }], json: false, maxOutputTokens: 10, timeoutMs: 1000 };

  test("un 402 sale como ProviderError http con status 402", async () => {
    const err = await createGeminiTextProvider("k", "m", respond(402, {})).generate(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ code: "http", status: 402 });
  });

  test("un 200 sin texto sale como code empty, sin status", async () => {
    const err = await createGeminiTextProvider("k", "m", respond(200, { candidates: [{ content: { parts: [{ text: "  " }] } }] })).generate(req).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "empty", status: null });
  });
});
