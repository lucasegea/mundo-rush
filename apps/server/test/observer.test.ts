// F4.1 A3: invalid observer output → 1 retry → error event; never an invented criterion.
import { describe, expect, test } from "vitest";
import { OBSERVER_MAX_ATTEMPTS, parseObserverOutput, runObserver, type ObserverInput } from "../src/observer/observer.ts";
import { ProviderError } from "../src/providers/text.ts";
import { fakeObserverModel, M01_RULES, observerJson } from "./fakes/text-model.ts";
import { harness, play } from "./helpers.ts";

const INPUT: ObserverInput = {
  turnId: "run-1:1", playerText: "Hello! I'm Nico.", lastNpcLine: "Hello! Welcome to Kestrel Valley.",
  criteria: [{ id: "C1", texto: "saluda" }, { id: "C2", texto: "dice su nombre" }], structures: ["I'm + nombre"], cefrBand: "A1",
};
const LIMITS = { maxOutputTokens: 1024, timeoutMs: 4000 };

describe("runObserver", () => {
  test("JSON válido al primer intento", async () => {
    const model = fakeObserverModel((c) => observerJson(c, M01_RULES));
    const out = await runObserver(model, INPUT, LIMITS);
    expect(out).toMatchObject({ ok: true, attempts: 1 });
    expect(model.calls[0]?.json).toBe(true);
  });

  test("inválido y después válido: un reintento y sale bien", async () => {
    const model = fakeObserverModel((c) => (c.attempt === 1 ? '{"turnId": "run-1:1", "intended": "Hel' : observerJson(c, M01_RULES)));
    const out = await runObserver(model, INPUT, LIMITS);
    expect(out).toMatchObject({ ok: true, attempts: 2 });
    expect(model.observed.map((c) => c.attempt)).toEqual([1, 2]);
  });

  test.each([
    ["JSON truncado", () => '{"turnId": "run-1:1", "criteria": ['],
    ["texto alrededor del JSON", (c: Parameters<typeof observerJson>[0]) => `Sure! ${observerJson(c, M01_RULES)}`],
    ["campo de más", (c: Parameters<typeof observerJson>[0]) => observerJson(c, M01_RULES, { score: 9 })],
    ["tipo de error fuera de la lista", (c: Parameters<typeof observerJson>[0]) =>
      observerJson(c, [], { errors: [{ key: "k", type: "spelling", scope: "local", missionTarget: false, span: "x", correction: "y" }] })],
    ["turnId distinto", (c: Parameters<typeof observerJson>[0]) => observerJson({ ...c, turnId: "otro" }, M01_RULES)],
  ])("%s dos veces → error tras exactamente %#+1 llamadas", async (_name, decide) => {
    const model = fakeObserverModel(decide);
    const out = await runObserver(model, INPUT, LIMITS);
    expect(out.ok).toBe(false);
    expect(out.attempts).toBe(OBSERVER_MAX_ATTEMPTS);
    expect(model.calls).toHaveLength(2);
  });

  test("un error del proveedor cuenta como intento", async () => {
    let n = 0;
    const model = { id: "boom", generate: () => (++n === 1 ? Promise.reject(new ProviderError("x", "timeout")) : Promise.resolve({ text: "nope" })) };
    const out = await runObserver(model, INPUT, LIMITS);
    expect(out).toMatchObject({ ok: false, attempts: 2 });
    expect(n).toBe(2);
  });

  test("parseObserverOutput valida el turnId pedido", () => {
    expect(parseObserverOutput(observerJson({ turnId: "a", playerText: "Hi", attempt: 1 }, []), "a").ok).toBe(true);
    expect(parseObserverOutput(observerJson({ turnId: "a", playerText: "Hi", attempt: 1 }, []), "b").ok).toBe(false);
  });
});

describe("A3 en la escena: el observador inválido no inventa criterios", () => {
  test("inválido dos veces → scene.notice observer_invalid; el NPC responde y el turno sigue sin evaluar", async () => {
    const h = harness({ observe: () => "not json", replies: ["Nice to meet you!"] });
    await play(h, "NPC-INES", ["Hello! I'm Nico."]);
    expect(h.observer.calls).toHaveLength(2);
    expect(h.of("scene.notice").map((n) => n.code)).toEqual(["observer_invalid"]);
    expect(h.of("npc.line").some((m) => m.line.kind === "reply" && m.line.text === "Nice to meet you!")).toBe(true);
    expect(h.session.snapshot.state).toBe("playerTurn");
    expect(h.session.snapshot.ctx.criteriaSatisfied).toBe(false);
    expect(h.of("scene.end")).toEqual([]);
    expect(h.evidence.list("op-local")).toEqual([]);
  });

  test("un id de criterio que la escena no tiene se descarta (C9 no cierra la escena)", async () => {
    const h = harness({ observe: (c) => observerJson(c, [{ id: "C9", when: /./ }]) });
    await play(h, "NPC-INES", ["Hello! I'm Nico."]);
    expect(h.session.snapshot.state).toBe("playerTurn");
    expect(h.of("scene.notice")).toEqual([]);
    await h.session.receive({ type: "scene.abort" });
    expect(h.of("scene.end")[0]?.criteriaMet).toEqual([]);
  });

  test("un criterio 'cumplido' sin cita del jugador no cuenta", async () => {
    const h = harness({
      observe: (c) => observerJson(c, [], { criteria: [{ criterionId: "C1", met: true, quote: " " }, { criterionId: "C2", met: true, quote: "" }] }),
    });
    await play(h, "NPC-INES", ["Hello! I'm Nico."]);
    expect(h.session.snapshot.state).toBe("playerTurn");
  });

  test("evidencia con una estructura que la misión no tiene no se guarda", async () => {
    const h = harness({
      observe: (c) => observerJson(c, [], { evidence: [{ kind: "target_use", structureId: "INVENTADA", branch: "-", quote: c.playerText }] }),
    });
    await play(h, "NPC-INES", ["Hello! I'm Nico."]);
    expect(h.evidence.list("op-local")).toEqual([]);
  });

  test("evidencia sobre un chunk de la misión se guarda con la cuenta, la misión y la escena", async () => {
    const h = harness({
      observe: (c) => observerJson(c, [], { evidence: [{ kind: "target_use", structureId: "I'm [nombre]", branch: "nombre", quote: c.playerText }] }),
    });
    await play(h, "NPC-INES", ["I'm Nico."]);
    expect(h.evidence.list("op-local")).toEqual([expect.objectContaining({
      kind: "target_use", accountId: "op-local", missionId: "M0.1", sceneId: "M0.1-E1", structureId: "I'm [nombre]", quote: "I'm Nico.",
    })]);
  });
});
