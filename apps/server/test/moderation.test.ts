// F4.2 A2: moderación de texto (03 §7.7). Fixtures de entradas y salidas inaceptables → corte + línea segura guionada +
// safety_event, con modelos y clasificador falsos (sin red, D-027). Riesgo → contención (D-112): línea fuera de la
// ficción + recurso + evento. Ningún evento guarda el texto cortado.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createModerator, PERSONAL_DATA_PATTERNS } from "../src/moderation/moderation.ts";
import type { ModerationProvider, ModerationVerdict } from "../src/providers/moderation.ts";
import { readCatalog } from "../src/scene-runtime/catalog.ts";
import { createFileSafetyStore, type SafetyEvent } from "../src/store/safety.ts";
import { M01_RULES, observerJson } from "./fakes/text-model.ts";
import { harness, play, realContent } from "./helpers.ts";

const catalog = readCatalog(realContent());
const SAFE_LINE = catalog.safety.containment.linea_segura_en;

/** Clasificador falso: devuelve el veredicto que decide la función (o falla). */
function fakeClassifier(decide: (text: string, dir: "input" | "output") => ModerationVerdict | Error): ModerationProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: "fake-moderation",
    calls,
    classify(text, dir) {
      calls.push(`${dir}:${text}`);
      const v = decide(text, dir);
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
    },
  };
}

const lists = catalog.safety.lists;

describe("capas del moderador (listas, reglas, clasificador)", () => {
  const mod = createModerator({ lists, classifier: null });

  test.each([
    ["I want to kill myself", "containment", "riesgo"],
    ["Me quiero morir", "containment", "riesgo"],
    ["they hurt me at home", "containment", "riesgo"],
    ["this is fucking boring", "cut", "inapropiado"],
    ["sos un pelotudo", "cut", "inapropiado"],
    ["my email is nico@example.com", "cut", "datos_personales"],
    ["call me at 11 4567 8901", "cut", "datos_personales"],
    ["look at www.example.com", "cut", "datos_personales"],
  ] as const)("entrada %j → %s (%s)", (text, action, category) => {
    expect(mod.checkInput(text)).toEqual({ action, layer: "input", category });
  });

  test.each(["Hello! I'm Nico.", "How much is this?", "I'm sick of the rain", "Good morning, Maya!", "I have 2 dogs"])(
    "entrada aceptable %j pasa (dinero o salud en boca del jugador no se cortan: el NPC los reconduce, S8/S9)", (text) => {
      expect(mod.checkInput(text)).toEqual({ action: "allow" });
    });

  test.each([
    ["That costs ten dollars.", "dinero"],
    ["You are wrong, say it like this.", "correccion_explicita"],
    ["Sure, honey.", "apelativos"],
    ["Hmm, that smells like shit.", "inapropiado"],
    ["You look sick today.", "salud"],
  ] as const)("salida del NPC %j → corte (%s)", (text, category) => {
    expect(mod.checkOutput(text, "NPC-INES")).toEqual({ action: "cut", layer: "output", category });
  });

  test("excepto: salud en boca de NPC-GRACE no se corta (D-176)", () => {
    expect(mod.checkOutput("If you feel sick, come see me.", "NPC-GRACE")).toEqual({ action: "allow" });
    expect(mod.checkOutput("If you feel sick, come see me.", "NPC-INES")).toMatchObject({ action: "cut", category: "salud" });
  });

  test("sin clasificador la decisión es síncrona; con clasificador corre solo si las listas no cortaron", async () => {
    const cls = fakeClassifier((t) => (t.includes("weird") ? "inappropriate" : t.includes("dark") ? "risk" : "ok"));
    const withCls = createModerator({ lists, classifier: cls });
    expect(await withCls.checkInput("something weird")).toEqual({ action: "cut", layer: "input", category: "clasificador" });
    expect(await withCls.checkInput("a dark thought")).toEqual({ action: "containment", layer: "input", category: "clasificador" });
    expect(await withCls.checkOutput("a dark thought", "NPC-INES")).toEqual({ action: "cut", layer: "output", category: "clasificador" });
    expect(await withCls.checkInput("Hello!")).toEqual({ action: "allow" });
    expect(await withCls.checkInput("fuck")).toMatchObject({ category: "inapropiado" });
    expect(cls.calls).not.toContain("input:fuck");
  });

  test("un clasificador que falla corta (no deja pasar sin la capa)", async () => {
    const mod2 = createModerator({ lists, classifier: fakeClassifier(() => new Error("caído")) });
    expect(await mod2.checkInput("Hello!")).toEqual({ action: "cut", layer: "input", category: "clasificador_error" });
  });

  test("sin listas de riesgo o inapropiado falla claro (nunca modera en falso)", () => {
    expect(() => createModerator({ lists: lists.filter((l) => l.regla !== "riesgo"), classifier: null })).toThrow(/riesgo o inapropiado/);
  });

  test("las reglas de datos personales no confunden horas ni cantidades chicas", () => {
    for (const ok of ["See you at 7:30", "I have 3 goats", "Row 12"]) expect(PERSONAL_DATA_PATTERNS.some((re) => re.test(ok)), ok).toBe(false);
  });
});

describe("A2 en la escena: corte + línea segura + safety_event", () => {
  test("entrada inaceptable: no llega al modelo ni al observador; el NPC dice la línea segura y el turno sigue", async () => {
    const h = harness({ rules: M01_RULES });
    await play(h, "NPC-INES", ["you are a fucking idiot"]);
    expect(h.npc.calls).toEqual([]);
    expect(h.observer.calls).toEqual([]);
    expect(h.of("scene.safety")).toEqual([{ type: "scene.safety", layer: "input", action: "cut" }]);
    const safe = h.of("npc.line").filter((m) => m.line.kind === "safe");
    expect(safe.map((m) => [m.line.speaker, m.line.text])).toEqual([["NPC-INES", SAFE_LINE]]);
    expect(h.session.snapshot).toMatchObject({ state: "playerTurn", sub: "waiting" });
    const [ev] = h.safety.list("op-local");
    expect(ev).toMatchObject({ layer: "input", action: "cut", category: "inapropiado", missionId: "M0.1", sceneId: "M0.1-E1", visibility: "operator" });
    expect(JSON.stringify(h.safety.list("op-local"))).not.toMatch(/idiot|fucking/);
    // La escena sigue: el turno siguiente llega al modelo, y el texto cortado nunca entró al transcripto.
    await h.session.receive({ type: "turn.text", text: "Hello! I'm Nico." });
    expect(h.of("scene.end")[0]?.outcome).toBe("success");
    expect(JSON.stringify(h.npc.calls)).not.toContain("idiot");
  });

  test("salida inaceptable del modelo: no se muestra; va la línea segura y queda el evento", async () => {
    const h = harness({ rules: [], replies: ["Nice! That costs five dollars."] });
    await play(h, "NPC-INES", ["Hello!"]);
    expect(h.npc.calls).toHaveLength(1);
    const lines = h.of("npc.line").map((m) => m.line);
    expect(lines.some((l) => l.text?.includes("dollars"))).toBe(false);
    expect(lines.filter((l) => l.kind === "reply")).toEqual([]);
    expect(lines.at(-1)).toMatchObject({ kind: "safe", speaker: "NPC-INES", text: SAFE_LINE });
    expect(h.of("scene.safety")).toEqual([{ type: "scene.safety", layer: "output", action: "cut" }]);
    expect(h.safety.list("op-local")[0]).toMatchObject({ layer: "output", action: "cut", category: "dinero" });
    expect(h.session.snapshot).toMatchObject({ state: "playerTurn", sub: "waiting" });
  });

  test("clasificador falso (proveedor) marca la salida: corte + línea segura", async () => {
    const cls = fakeClassifier((_t, dir) => (dir === "output" ? "inappropriate" : "ok"));
    const h = harness({ rules: [], moderation: cls, replies: ["Let's go somewhere private."] });
    await play(h, "NPC-INES", ["Hello!"]);
    expect(cls.calls).toEqual(["input:Hello!", "output:Let's go somewhere private."]);
    expect(h.of("npc.line").at(-1)?.line).toMatchObject({ kind: "safe", text: SAFE_LINE });
    expect(h.safety.list("op-local")[0]).toMatchObject({ layer: "output", category: "clasificador" });
  });

  test("el observador marca `inappropriate`: corte + línea segura (sin la respuesta del modelo)", async () => {
    const h = harness({ observe: (c) => observerJson(c, [], { safety: "inappropriate" }), replies: ["Ha ha, yes!"] });
    await play(h, "NPC-INES", ["something rude"]);
    expect(h.of("npc.line").filter((m) => m.line.kind === "reply")).toEqual([]);
    expect(h.of("scene.safety")).toEqual([{ type: "scene.safety", layer: "observer", action: "cut" }]);
  });

  test("el observador marca `inappropriate` Y da los criterios por cumplidos: gana la seguridad (corte, sin evidencia, sin éxito)", async () => {
    const h = harness({
      observe: (c) => observerJson(c, M01_RULES, {
        safety: "inappropriate",
        evidence: [{ kind: "target_use", structureId: "Hello / Hi", branch: "-", quote: c.playerText }],
      }),
      replies: ["Ha ha, yes!"],
    });
    await play(h, "NPC-INES", ["Hello! I'm a rude thing."]);
    expect(h.of("scene.end")).toEqual([]);
    expect(h.session.snapshot).toMatchObject({ state: "playerTurn", sub: "waiting" });
    expect(h.of("scene.safety")).toEqual([{ type: "scene.safety", layer: "observer", action: "cut" }]);
    expect(h.of("npc.line").at(-1)?.line).toMatchObject({ kind: "safe", speaker: "NPC-INES", text: SAFE_LINE });
    expect(h.of("npc.line").filter((m) => m.line.kind === "reply")).toEqual([]);
    expect(h.safety.list("op-local")).toEqual([expect.objectContaining({ layer: "observer", action: "cut", category: "observador" })]);
    expect(h.evidence.list("op-local")).toEqual([]);
  });

  test("escena sin NPC (M0.2, Lumi): un corte no pone texto libre en boca de Lumi", async () => {
    const h = harness({ rules: M01_RULES });
    await play(h, "NPC-INES", ["Hello! I'm Nico."]);
    const s2 = h.reconnect();
    await s2.receive({ type: "scene.start", npcId: null });
    const before = h.sent.length;
    await s2.receive({ type: "turn.text", text: "shit" });
    const after = h.sent.slice(before);
    expect(after.some((m) => m.type === "npc.line")).toBe(false);
    expect(after.find((m) => m.type === "scene.safety")).toEqual({ type: "scene.safety", layer: "input", action: "cut" });
  });
});

describe("A2 riesgo → contención (D-112, mecanismo con textos provisorios)", () => {
  test("señal de riesgo en la entrada: containment, línea fuera de la ficción + recurso, evento, sin modelo", async () => {
    const h = harness({ rules: M01_RULES });
    await play(h, "NPC-INES", ["I want to kill myself"]);
    expect(h.npc.calls).toEqual([]);
    expect(h.steps()).toContain("containment");
    const c = h.of("scene.containment")[0];
    const content = catalog.safety.containment;
    expect(c).toEqual({
      type: "scene.containment", line: content.contencion_es,
      resource: { label: content.recursos.AR?.etiqueta, detail: content.recursos.AR?.detalle }, provisional: true,
    });
    expect(h.of("scene.end")[0]?.outcome).toBe("containment");
    // La contención nunca cumple la misión ni emite efectos (D-199).
    expect(h.of("scene.effects")).toEqual([]);
    expect(h.safety.list("op-local")).toEqual([expect.objectContaining({ layer: "input", action: "containment", category: "riesgo" })]);
    expect(JSON.stringify(h.safety.list("op-local"))).not.toContain("kill");
  });

  test("el prompt del NPC lleva la línea S3 del archivo de contención (sin texto hardcodeado)", async () => {
    const h = harness({ rules: [] });
    await play(h, "NPC-INES", ["Hello!"]);
    expect(h.npc.calls[0]?.system).toContain(catalog.safety.containment.contencion_en);
  });
});

describe("SafetyEventStore de archivo", () => {
  const dir = mkdtempSync(join(tmpdir(), "lg-safety-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("sobrevive un reinicio y no acepta campos de más (ni el texto)", () => {
    const path = join(dir, "safety.jsonl");
    const ev = {
      id: "s1", accountId: "op-local", at: "2026-10-08T12:00:00.000Z", sceneRunId: "r1", missionId: "M0.1", sceneId: "M0.1-E1",
      layer: "input", action: "cut", category: "inapropiado", visibility: "operator",
    } as const;
    createFileSafetyStore(path).append(ev);
    expect(createFileSafetyStore(path).list("op-local")).toEqual([ev]);
    expect(() => createFileSafetyStore(path).append({ ...ev, id: "s2", text: "bad words" } as unknown as SafetyEvent)).toThrow();
    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(1);
  });
});
